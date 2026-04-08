import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { loadJsonlDataset, stratifiedSplit, summarizeLabels } from './lib/dataset.mjs';
import {
  fitPreprocessor,
  vectorizeRows,
} from './lib/features.mjs';
import {
  classificationMetrics,
  deriveThresholds,
  predictMatrix,
  rocAuc,
} from './lib/metrics.mjs';
import {
  DEFAULT_DATASET_PATH,
  DEFAULT_EXPORT_PATH,
  DEFAULT_RUNTIME_THRESHOLDS,
  DEFAULT_TRAINING_CONFIG,
  MODEL_SCHEMA_VERSION,
  NUMERICAL_FEATURE_NAMES,
  RANDOM_SEED,
} from './lib/defaults.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..');
const vendorIndexPath = path.join(__dirname, 'vendor', 'framework', 'dist', 'index.js');
const buildScriptPath = path.join(__dirname, 'build_framework_vendor.mjs');
const require = createRequire(import.meta.url);

function parseArgs(argv) {
  const [command = 'train', ...rest] = argv;
  const options = {};
  for (let index = 0; index < rest.length; index += 1) {
    const current = rest[index];
    if (!current.startsWith('--')) continue;
    const key = current.slice(2);
    const next = rest[index + 1];
    if (!next || next.startsWith('--')) {
      options[key] = true;
      continue;
    }
    options[key] = next;
    index += 1;
  }
  return { command, options };
}

function numberOption(options, key, fallback) {
  if (options[key] === undefined) return fallback;
  const value = Number(options[key]);
  return Number.isFinite(value) ? value : fallback;
}

function ensureFrameworkVendor(force = false) {
  if (!force && fs.existsSync(vendorIndexPath)) return;
  execFileSync('node', [buildScriptPath], {
    cwd: repoRoot,
    stdio: 'inherit',
  });
}

async function loadFramework(forceBuild = false) {
  ensureFrameworkVendor(forceBuild);
  const moduleUrl = pathToFileURL(vendorIndexPath).href;
  return import(moduleUrl);
}

function binaryCrossEntropyLoss(framework, logits, targets) {
  const { Tensor } = framework;
  const probabilities = logits.sigmoid();
  const ones = Tensor.ones(probabilities.shape);
  const eps = 1e-6;
  const positive = targets.mul(probabilities.add(eps).log());
  const negative = ones.sub(targets).mul(ones.sub(probabilities).add(eps).log());
  return positive.add(negative).neg().mean();
}

function modelArtifact({
  weights,
  bias,
  preprocessor,
  calibration,
  evaluation,
  trainingConfig,
  datasetSummary,
  trainCount,
  testCount,
}) {
  return {
    schema_version: MODEL_SCHEMA_VERSION,
    model_info: {
      name: 'Clarigo Educational Video Classifier',
      version: '2.0-framework-linear',
      type: 'Framework-trained logistic classifier with TF-IDF',
      created: new Date().toISOString(),
      accuracy: Number(evaluation.balanced.accuracy.toFixed(4)),
      auc: Number(evaluation.auc.toFixed(4)),
      precision: Number(evaluation.balanced.precision.toFixed(4)),
      recall: Number(evaluation.balanced.recall.toFixed(4)),
      train_samples: trainCount,
      test_samples: testCount,
    },
    preprocessing: {
      educational_keywords: preprocessor.educationalKeywords,
      tfidf: {
        vocabulary: preprocessor.tfidf.vocabulary,
        idf_values: preprocessor.tfidf.idfValues,
        ngram_range: preprocessor.tfidf.ngramRange,
      },
      numerical_scaler: preprocessor.numericalScaler,
      numerical_feature_names: NUMERICAL_FEATURE_NAMES,
    },
    model: {
      coef: [weights],
      intercept: [bias],
      classes: [0, 1],
      learning_rate: trainingConfig.learningRate,
      weight_decay: trainingConfig.weightDecay,
      epochs: trainingConfig.epochs,
    },
    inference: {
      positive_label: 1,
      default_filter_mode: 'aggressive',
      thresholds: calibration.thresholds,
      metrics_by_mode: evaluation,
      fallback_thresholds: DEFAULT_RUNTIME_THRESHOLDS,
    },
    dataset_summary: datasetSummary,
    feature_names: {
      text_features: preprocessor.textFeatureNames,
      numerical_features: NUMERICAL_FEATURE_NAMES,
    },
  };
}

function evaluateModel(probabilities, labels, calibration) {
  const balanced = classificationMetrics(probabilities, labels, calibration.thresholds.balanced);
  const aggressive = classificationMetrics(probabilities, labels, calibration.thresholds.aggressive);
  const conservative = classificationMetrics(probabilities, labels, calibration.thresholds.conservative);

  return {
    aggressive,
    balanced,
    conservative,
    auc: rocAuc(probabilities, labels),
  };
}

function writeJson(outputPath, payload) {
  const absolutePath = path.resolve(outputPath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, `${JSON.stringify(payload, null, 2)}\n`);
  return absolutePath;
}

function normalizeSchemaVersion(schemaVersion) {
  const parsedVersion = Number(schemaVersion);
  if (Number.isFinite(parsedVersion) && parsedVersion >= MODEL_SCHEMA_VERSION) {
    return parsedVersion;
  }
  return MODEL_SCHEMA_VERSION;
}

async function trainCommand(options) {
  const framework = await loadFramework(Boolean(options['force-build']));
  const { Tensor, Parameter, Adam } = framework;

  const trainingConfig = {
    trainRatio: numberOption(options, 'train-ratio', DEFAULT_TRAINING_CONFIG.trainRatio),
    maxFeatures: numberOption(options, 'max-features', DEFAULT_TRAINING_CONFIG.maxFeatures),
    ngramRange: DEFAULT_TRAINING_CONFIG.ngramRange,
    epochs: numberOption(options, 'epochs', DEFAULT_TRAINING_CONFIG.epochs),
    learningRate: numberOption(options, 'learning-rate', DEFAULT_TRAINING_CONFIG.learningRate),
    weightDecay: numberOption(options, 'weight-decay', DEFAULT_TRAINING_CONFIG.weightDecay),
    reportEvery: numberOption(options, 'report-every', DEFAULT_TRAINING_CONFIG.reportEvery),
  };

  const datasetPath = options.dataset || DEFAULT_DATASET_PATH;
  const exportPath = options.out || DEFAULT_EXPORT_PATH;

  const dataset = loadJsonlDataset(datasetPath);
  const datasetSummary = summarizeLabels(dataset);
  const split = stratifiedSplit(dataset, {
    trainRatio: trainingConfig.trainRatio,
    seed: RANDOM_SEED,
  });

  const preprocessor = fitPreprocessor(split.train, {
    maxFeatures: trainingConfig.maxFeatures,
    ngramRange: trainingConfig.ngramRange,
  });

  const trainVectors = vectorizeRows(split.train, preprocessor);
  const testVectors = vectorizeRows(split.test, preprocessor);

  const xTrain = Tensor.fromFloat32(trainVectors.matrix, [split.train.length, trainVectors.featureCount]);
  const yTrain = Tensor.fromFloat32(trainVectors.labels, [split.train.length, 1]);

  const initialWeights = new Float32Array(trainVectors.featureCount);
  for (let index = 0; index < initialWeights.length; index += 1) {
    initialWeights[index] = ((index % 13) - 6) * 0.0005;
  }

  const weight = new Parameter(
    Tensor.fromFloat32(initialWeights, [trainVectors.featureCount, 1]).setRequiresGrad(true),
    'weight',
  );
  const bias = new Parameter(
    Tensor.fromFloat32(new Float32Array([0]), [1]).setRequiresGrad(true),
    'bias',
  );
  const optimizer = new Adam([weight, bias], {
    lr: trainingConfig.learningRate,
    weightDecay: trainingConfig.weightDecay,
  });

  for (let epoch = 1; epoch <= trainingConfig.epochs; epoch += 1) {
    optimizer.zeroGrad();
    const logits = xTrain.matmul(weight.value).add(bias.value);
    const loss = binaryCrossEntropyLoss(framework, logits, yTrain);
    loss.backward();
    optimizer.step(0);

    if (epoch === 1 || epoch % trainingConfig.reportEvery === 0 || epoch === trainingConfig.epochs) {
      process.stdout.write(`epoch ${epoch}/${trainingConfig.epochs} loss=${loss.item().toFixed(5)}\n`);
    }
  }

  const learnedWeights = Array.from(weight.value.toFloat32());
  const learnedBias = bias.value.toFloat32()[0];
  const probabilities = predictMatrix(
    testVectors.matrix,
    split.test.length,
    testVectors.featureCount,
    learnedWeights,
    learnedBias,
  );
  const labelArray = Array.from(testVectors.labels);
  const calibration = deriveThresholds(probabilities, labelArray);
  const evaluation = evaluateModel(probabilities, labelArray, calibration);

  const artifact = modelArtifact({
    weights: learnedWeights,
    bias: learnedBias,
    preprocessor,
    calibration,
    evaluation,
    trainingConfig,
    datasetSummary,
    trainCount: split.train.length,
    testCount: split.test.length,
  });

  const writtenPath = writeJson(exportPath, artifact);
  process.stdout.write(`exported browser model to ${writtenPath}\n`);
}

function migrateThresholds(currentModel) {
  const thresholds = currentModel.inference?.thresholds || DEFAULT_RUNTIME_THRESHOLDS;
  return {
    ...currentModel,
    schema_version: normalizeSchemaVersion(currentModel.schema_version),
    preprocessing: {
      ...currentModel.preprocessing,
      numerical_feature_names: currentModel.preprocessing?.numerical_feature_names || NUMERICAL_FEATURE_NAMES,
    },
    inference: {
      positive_label: 1,
      default_filter_mode: 'aggressive',
      fallback_thresholds: DEFAULT_RUNTIME_THRESHOLDS,
      ...currentModel.inference,
      thresholds,
    },
  };
}

function migrateCommand(options) {
  const inputPath = path.resolve(options.input || 'extension/model/clarigo_model.json');
  const outputPath = path.resolve(options.out || inputPath);
  const currentModel = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  const migrated = migrateThresholds(currentModel);
  writeJson(outputPath, migrated);
  process.stdout.write(`migrated model metadata at ${outputPath}\n`);
}

function calibrateExistingBrowserModel(options) {
  const modelPath = path.resolve(options.model || 'extension/model/clarigo_model.json');
  const outputPath = path.resolve(options.out || modelPath);
  const datasetPath = path.resolve(options.dataset || DEFAULT_DATASET_PATH);
  const ClarigoClassifier = require(path.resolve(repoRoot, 'extension', 'model', 'clarigo_classifier.js'));
  const classifier = new ClarigoClassifier();

  classifier.model = JSON.parse(fs.readFileSync(modelPath, 'utf8'));
  classifier.isLoaded = true;

  const dataset = loadJsonlDataset(datasetPath);
  const probabilities = dataset.map((row) => classifier.predict(row.title, row.channelName || '', {
    threshold: 0.5,
    suppressWarnings: true,
  }).probability);
  const labels = dataset.map((row) => row.label);
  const calibration = deriveThresholds(probabilities, labels);
  const evaluation = evaluateModel(probabilities, labels, calibration);

  const updatedModel = {
    ...classifier.model,
    schema_version: normalizeSchemaVersion(classifier.model.schema_version),
    preprocessing: {
      ...classifier.model.preprocessing,
      numerical_feature_names: classifier.model.preprocessing?.numerical_feature_names || NUMERICAL_FEATURE_NAMES,
    },
    inference: {
      positive_label: 1,
      default_filter_mode: 'aggressive',
      fallback_thresholds: DEFAULT_RUNTIME_THRESHOLDS,
      ...(classifier.model.inference || {}),
      thresholds: calibration.thresholds,
      metrics_by_mode: evaluation,
    },
    calibration_dataset: {
      rows: dataset.length,
      source: datasetPath,
      calibrated_at: new Date().toISOString(),
    },
  };

  writeJson(outputPath, updatedModel);
  process.stdout.write(`calibrated model thresholds at ${outputPath}\n`);
}

async function main() {
  const { command, options } = parseArgs(process.argv.slice(2));

  if (command === 'build-framework') {
    ensureFrameworkVendor(Boolean(options['force']));
    process.stdout.write('framework vendor build is ready\n');
    return;
  }

  if (command === 'migrate-browser-model') {
    migrateCommand(options);
    return;
  }

  if (command === 'calibrate-browser-model') {
    calibrateExistingBrowserModel(options);
    return;
  }

  if (command === 'train') {
    await trainCommand(options);
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
