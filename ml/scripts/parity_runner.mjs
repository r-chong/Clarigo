// Node harness for the Python<->JS parity test.
//
// Loads the SHIPPED `clarigo_classifier.js` and the converted model JSON, runs
// predictions for a list of {title, channelName} inputs, and prints the results
// as JSON to stdout. `parity_test.py` compares these against scikit-learn.
//
// Usage:
//   node ml/scripts/parity_runner.mjs <inputs.json> [modelPath] [classifierPath]
//
// `inputs.json` is an array of { "title": ..., "channelName": ... }.

import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..", "..");

const inputsPath = process.argv[2];
const modelPath =
  process.argv[3] ?? resolve(repoRoot, "ml", "js_model", "clarigo_model.json");
const classifierPath =
  process.argv[4] ??
  resolve(repoRoot, "ml", "js_model", "clarigo_classifier.js");

if (!inputsPath) {
  console.error("Usage: node parity_runner.mjs <inputs.json> [modelPath] [classifierPath]");
  process.exit(2);
}

// classifier.js is CommonJS (module.exports). Import it via dynamic import,
// which Node resolves through createRequire-style interop for .js files.
const mod = await import(pathToFileURL(classifierPath).href);
const ClarigoClassifier = mod.default ?? mod.ClarigoClassifier ?? globalThis.ClarigoClassifier;

if (typeof ClarigoClassifier !== "function") {
  console.error("Could not load ClarigoClassifier export from", classifierPath);
  process.exit(2);
}

// Bypass loadModel() (which uses fetch + a URL) by injecting the parsed model.
const classifier = new ClarigoClassifier();
classifier.model = JSON.parse(readFileSync(modelPath, "utf-8"));
classifier.isLoaded = true;

const inputs = JSON.parse(readFileSync(inputsPath, "utf-8"));

const results = inputs.map(({ title, channelName }) => {
  const r = classifier.predict(title ?? "", channelName ?? "");
  return {
    title,
    channelName,
    prediction: r.prediction,
    probability: r.probability,
    eduKeywords: r.debug.eduKeywords,
  };
});

process.stdout.write(JSON.stringify(results));
