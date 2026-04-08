import { DEFAULT_RUNTIME_THRESHOLDS } from './defaults.mjs';

function sigmoid(value) {
  return 1 / (1 + Math.exp(-value));
}

export function scoreFeatures(features, weights, bias) {
  let total = bias;
  for (let index = 0; index < features.length; index += 1) {
    total += features[index] * weights[index];
  }
  return sigmoid(total);
}

export function predictMatrix(matrix, rowCount, featureCount, weights, bias) {
  const probabilities = new Array(rowCount);
  for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
    const offset = rowIndex * featureCount;
    probabilities[rowIndex] = scoreFeatures(
      matrix.subarray(offset, offset + featureCount),
      weights,
      bias,
    );
  }
  return probabilities;
}

export function rocAuc(probabilities, labels) {
  const paired = probabilities.map((probability, index) => ({
    probability,
    label: labels[index],
  })).sort((left, right) => right.probability - left.probability);

  let positives = 0;
  let negatives = 0;
  for (const item of paired) {
    if (item.label === 1) positives += 1;
    else negatives += 1;
  }
  if (positives === 0 || negatives === 0) return 0.5;

  let truePositive = 0;
  let falsePositive = 0;
  let lastTruePositiveRate = 0;
  let lastFalsePositiveRate = 0;
  let area = 0;

  for (const item of paired) {
    if (item.label === 1) truePositive += 1;
    else falsePositive += 1;

    const truePositiveRate = truePositive / positives;
    const falsePositiveRate = falsePositive / negatives;
    area += (falsePositiveRate - lastFalsePositiveRate) * (truePositiveRate + lastTruePositiveRate) * 0.5;
    lastTruePositiveRate = truePositiveRate;
    lastFalsePositiveRate = falsePositiveRate;
  }

  return area;
}

export function classificationMetrics(probabilities, labels, threshold) {
  let tp = 0;
  let fp = 0;
  let tn = 0;
  let fn = 0;

  probabilities.forEach((probability, index) => {
    const predicted = probability >= threshold ? 1 : 0;
    const actual = labels[index];

    if (predicted === 1 && actual === 1) tp += 1;
    else if (predicted === 1 && actual === 0) fp += 1;
    else if (predicted === 0 && actual === 0) tn += 1;
    else fn += 1;
  });

  const total = Math.max(1, labels.length);
  const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
  const specificity = tn + fp > 0 ? tn / (tn + fp) : 0;
  const accuracy = (tp + tn) / total;
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;

  return {
    threshold,
    accuracy,
    precision,
    recall,
    specificity,
    f1,
    tp,
    fp,
    tn,
    fn,
  };
}

function fBeta(metrics, beta) {
  const betaSquared = beta * beta;
  const numerator = (1 + betaSquared) * metrics.precision * metrics.recall;
  const denominator = (betaSquared * metrics.precision) + metrics.recall;
  return denominator > 0 ? numerator / denominator : 0;
}

export function deriveThresholds(probabilities, labels) {
  const candidates = [];
  for (let threshold = 0.2; threshold <= 0.9; threshold += 0.01) {
    const rounded = Number(threshold.toFixed(2));
    const metrics = classificationMetrics(probabilities, labels, rounded);
    candidates.push({
      ...metrics,
      fHalf: fBeta(metrics, 0.5),
      fTwo: fBeta(metrics, 2),
    });
  }

  const bestBalanced = [...candidates].sort((left, right) => {
    if (right.f1 !== left.f1) return right.f1 - left.f1;
    if (right.accuracy !== left.accuracy) return right.accuracy - left.accuracy;
    return left.threshold - right.threshold;
  })[0];

  const aggressiveFloor = Number((bestBalanced.threshold + 0.05).toFixed(2));
  const conservativeCeiling = Number((bestBalanced.threshold - 0.05).toFixed(2));

  const aggressivePool = candidates.filter((item) => item.threshold >= aggressiveFloor);
  const aggressive = [...(aggressivePool.length ? aggressivePool : candidates.filter((item) => item.threshold >= bestBalanced.threshold))].sort((left, right) => {
    if (right.fHalf !== left.fHalf) return right.fHalf - left.fHalf;
    if (right.precision !== left.precision) return right.precision - left.precision;
    return right.threshold - left.threshold;
  })[0];

  const conservativePool = candidates.filter((item) => item.threshold <= conservativeCeiling);
  const conservative = [...(conservativePool.length ? conservativePool : candidates.filter((item) => item.threshold <= bestBalanced.threshold))].sort((left, right) => {
    if (right.fTwo !== left.fTwo) return right.fTwo - left.fTwo;
    if (right.recall !== left.recall) return right.recall - left.recall;
    return right.threshold - left.threshold;
  })[0];

  return {
    thresholds: {
      aggressive: aggressive?.threshold ?? DEFAULT_RUNTIME_THRESHOLDS.aggressive,
      balanced: bestBalanced?.threshold ?? DEFAULT_RUNTIME_THRESHOLDS.balanced,
      conservative: conservative?.threshold ?? DEFAULT_RUNTIME_THRESHOLDS.conservative,
    },
    metrics: {
      aggressive: aggressive,
      balanced: bestBalanced,
      conservative: conservative,
    },
  };
}
