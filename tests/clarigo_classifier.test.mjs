import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const ClarigoClassifier = require(path.join(repoRoot, 'extension', 'model', 'clarigo_classifier.js'));

function loadClassifier(modelPath) {
  const classifier = new ClarigoClassifier();
  classifier.model = JSON.parse(fs.readFileSync(modelPath, 'utf8'));
  classifier.isLoaded = true;
  return classifier;
}

test('classifier exposes schema version and distinct filter thresholds', () => {
  const classifier = loadClassifier(path.join(repoRoot, 'extension', 'model', 'clarigo_model.json'));
  const info = classifier.getModelInfo();
  const thresholds = classifier.getThresholds();

  assert.ok(info.schemaVersion >= 2);
  assert.ok(thresholds.aggressive > thresholds.balanced);
  assert.ok(thresholds.conservative < thresholds.balanced);
});

test('filter mode changes threshold without changing raw probability', () => {
  const classifier = loadClassifier(path.join(repoRoot, 'extension', 'model', 'clarigo_model.json'));
  const aggressive = classifier.predict('easy python fundamentals', 'easydatascience', {
    filterMode: 'aggressive',
    suppressWarnings: true,
  });
  const conservative = classifier.predict('easy python fundamentals', 'easydatascience', {
    filterMode: 'conservative',
    suppressWarnings: true,
  });

  assert.equal(aggressive.probability, conservative.probability);
  assert.ok(aggressive.threshold > conservative.threshold);
  assert.equal(aggressive.filterMode, 'aggressive');
  assert.equal(conservative.filterMode, 'conservative');
});
