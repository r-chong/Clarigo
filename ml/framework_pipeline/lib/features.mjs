import {
  EDUCATIONAL_KEYWORDS,
  NUMERICAL_FEATURE_NAMES,
  STOP_WORDS,
} from './defaults.mjs';

export function preprocessText(text) {
  return (text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function tokenize(text) {
  return preprocessText(text)
    .split(' ')
    .filter((token) => token && !STOP_WORDS.has(token));
}

export function createNGrams(tokens, n) {
  if (n === 1) return tokens;

  const grams = [];
  for (let index = 0; index <= tokens.length - n; index += 1) {
    grams.push(tokens.slice(index, index + n).join(' '));
  }
  return grams;
}

export function extractRawExample(row) {
  const titleClean = preprocessText(row.title);
  const channelClean = preprocessText(row.channelName);
  const combinedText = `${titleClean} ${channelClean}`.trim();

  const titleTokens = titleClean ? titleClean.split(' ').filter(Boolean) : [];
  const channelTokens = channelClean ? channelClean.split(' ').filter(Boolean) : [];

  const educationalKeywordCount = EDUCATIONAL_KEYWORDS.reduce((count, keyword) => {
    return count + (combinedText.includes(keyword) ? 1 : 0);
  }, 0);

  return {
    ...row,
    titleClean,
    channelClean,
    combinedText,
    tokens: tokenize(combinedText),
    rawNumerical: [
      titleTokens.length,
      channelTokens.length,
      titleClean.length,
      channelClean.length,
      educationalKeywordCount,
    ],
  };
}

export function fitVocabulary(examples, { maxFeatures, ngramRange }) {
  const documentFrequency = new Map();

  for (const example of examples) {
    const seen = new Set();
    for (let n = ngramRange[0]; n <= ngramRange[1]; n += 1) {
      for (const gram of createNGrams(example.tokens, n)) {
        if (!gram || seen.has(gram)) continue;
        seen.add(gram);
        documentFrequency.set(gram, (documentFrequency.get(gram) || 0) + 1);
      }
    }
  }

  const sortedTerms = [...documentFrequency.entries()]
    .sort((left, right) => {
      if (right[1] !== left[1]) return right[1] - left[1];
      return left[0].localeCompare(right[0]);
    })
    .slice(0, maxFeatures);

  const vocabulary = {};
  const idfValues = new Array(sortedTerms.length).fill(0);
  const featureNames = new Array(sortedTerms.length).fill('');
  const totalDocuments = Math.max(1, examples.length);

  sortedTerms.forEach(([term, frequency], index) => {
    vocabulary[term] = index;
    featureNames[index] = term;
    idfValues[index] = Math.log((1 + totalDocuments) / (1 + frequency)) + 1;
  });

  return {
    tfidf: {
      vocabulary,
      idfValues,
      ngramRange,
    },
    textFeatureNames: featureNames,
  };
}

export function fitNumericalScaler(examples) {
  const means = new Array(NUMERICAL_FEATURE_NAMES.length).fill(0);
  const variances = new Array(NUMERICAL_FEATURE_NAMES.length).fill(0);
  const rowCount = Math.max(1, examples.length);

  for (const example of examples) {
    example.rawNumerical.forEach((value, index) => {
      means[index] += value;
    });
  }

  for (let index = 0; index < means.length; index += 1) {
    means[index] /= rowCount;
  }

  for (const example of examples) {
    example.rawNumerical.forEach((value, index) => {
      const centered = value - means[index];
      variances[index] += centered * centered;
    });
  }

  for (let index = 0; index < variances.length; index += 1) {
    variances[index] /= rowCount;
  }

  const scales = variances.map((value) => {
    const std = Math.sqrt(value);
    return Number.isFinite(std) && std > 1e-6 ? std : 1;
  });

  return {
    mean: means,
    var: variances,
    scale: scales,
  };
}

export function fitPreprocessor(rows, config) {
  const examples = rows.map(extractRawExample);
  const vocabulary = fitVocabulary(examples, config);
  const numericalScaler = fitNumericalScaler(examples);

  return {
    educationalKeywords: [...EDUCATIONAL_KEYWORDS],
    tfidf: vocabulary.tfidf,
    textFeatureNames: vocabulary.textFeatureNames,
    numericalScaler,
  };
}

function textToTfIdf(tokens, tfidfConfig) {
  const { vocabulary, idfValues, ngramRange } = tfidfConfig;
  const termFrequency = new Map();
  const tokenCount = Math.max(1, tokens.length);

  for (let n = ngramRange[0]; n <= ngramRange[1]; n += 1) {
    for (const gram of createNGrams(tokens, n)) {
      const index = vocabulary[gram];
      if (index === undefined) continue;
      termFrequency.set(index, (termFrequency.get(index) || 0) + 1);
    }
  }

  const vector = new Float32Array(idfValues.length);
  for (const [index, count] of termFrequency.entries()) {
    vector[index] = (count / tokenCount) * idfValues[index];
  }
  return vector;
}

function normalizeNumerical(rawValues, scaler) {
  const normalized = new Float32Array(rawValues.length);
  rawValues.forEach((value, index) => {
    normalized[index] = (value - scaler.mean[index]) / scaler.scale[index];
  });
  return normalized;
}

export function vectorizeRows(rows, preprocessor) {
  const examples = rows.map(extractRawExample);
  const featureCount = preprocessor.textFeatureNames.length + NUMERICAL_FEATURE_NAMES.length;
  const matrix = new Float32Array(examples.length * featureCount);
  const labels = new Float32Array(examples.length);

  examples.forEach((example, rowIndex) => {
    const textVector = textToTfIdf(example.tokens, preprocessor.tfidf);
    const numerical = normalizeNumerical(example.rawNumerical, preprocessor.numericalScaler);
    const offset = rowIndex * featureCount;

    matrix.set(textVector, offset);
    matrix.set(numerical, offset + textVector.length);
    labels[rowIndex] = example.label;
  });

  return {
    examples,
    matrix,
    labels,
    featureCount,
  };
}
