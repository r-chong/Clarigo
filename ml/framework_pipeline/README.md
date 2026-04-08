# Clarigo Framework Pipeline

This directory contains the `mni-ml/framework` training and export path for Clarigo.

## What It Does

- Builds a vendored local copy of the sibling `../framework` TypeScript and native CPU backend into Clarigo-owned paths.
- Trains a linear browser-exportable classifier on `ml/data/processed_data/master_dataset.jsonl`.
- Exports a browser model artifact with schema versioning and calibrated thresholds for:
  - `aggressive`
  - `balanced`
  - `conservative`

## Commands

```bash
node ml/framework_pipeline/cli.mjs build-framework
node ml/framework_pipeline/cli.mjs train --out extension/model/clarigo_model.json
node ml/framework_pipeline/cli.mjs migrate-browser-model --input extension/model/clarigo_model.json
```

## Notes

- The vendored framework build output is ignored via `.gitignore`.
- The first milestone intentionally trains a linear model so the Chrome extension can keep browser-native inference.
- The exported model format is backward-compatible at runtime: the extension can still load older artifacts and fall back to default thresholds when needed.
