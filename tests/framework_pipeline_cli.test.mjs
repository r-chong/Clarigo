import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cliPath = path.join(repoRoot, 'ml', 'framework_pipeline', 'cli.mjs');

test('migrate-browser-model adds schema and inference metadata', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clarigo-cli-'));
  const inputPath = path.join(tempDir, 'input-model.json');
  const outputPath = path.join(tempDir, 'output-model.json');

  fs.writeFileSync(inputPath, JSON.stringify({
    model_info: { name: 'test', accuracy: 1, auc: 1 },
    preprocessing: {
      educational_keywords: [],
      tfidf: { vocabulary: {}, idf_values: [], ngram_range: [1, 2] },
      numerical_scaler: { mean: [0], scale: [1], var: [1] },
    },
    model: {
      coef: [[0]],
      intercept: [0],
      classes: [0, 1],
    },
    feature_names: {
      text_features: [],
      numerical_features: ['title_word_count'],
    },
  }, null, 2));

  execFileSync('node', [cliPath, 'migrate-browser-model', '--input', inputPath, '--out', outputPath], {
    cwd: repoRoot,
    stdio: 'pipe',
  });

  const migrated = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
  assert.equal(migrated.schema_version, 2);
  assert.ok(migrated.inference.thresholds.aggressive > migrated.inference.thresholds.conservative);
  assert.equal(migrated.inference.default_filter_mode, 'aggressive');
});
