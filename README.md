# Clarigo — Educational Video Classification

Clarigo classifies YouTube videos as **educational (1)** or **non-educational (0)**
from their metadata (title, channel, and engineered features), and ships that
classifier inside a Chrome extension that filters your YouTube feed in real time.

Inference runs **entirely client-side** in the browser — no network calls, no
servers — so it stays private and fast. The Python side handles data collection,
labeling, training, and exporting the model to a browser-ready format.

## Repository structure

```
Clarigo/
├── extension/                     # Chrome extension (Manifest V3)
│   ├── manifest.json
│   ├── background.js / content.js / youtube-dom.js / content.css
│   ├── popup.* / options.html / onboarding.* / welcome.html
│   └── model/                     # SHIPPED model (generated, copied from ml/js_model)
│       ├── clarigo_model.json     #   weights, vocab, scaler params
│       └── clarigo_classifier.js  #   JS inference (must match Python exactly)
│
├── ml/
│   ├── scripts/
│   │   ├── youtube_category_scraper.py   # scrape rich, immutable raw metadata (YouTube API)
│   │   ├── apply_category_labels.py      # fast weak labels from category hint (free)
│   │   ├── gemini_labeler.py             # LLM "silver" labels (Gemini API)
│   │   ├── build_broad_dataset.py        # normalize + merge (gemini > category) -> master_broad_v1
│   │   ├── model_to_js_converter.py      # joblib model -> browser JSON
│   │   ├── copy_model_to_extension.py    # publish js_model/ -> extension/model/
│   │   ├── parity_test.py + parity_runner.mjs  # assert Python == JS predictions
│   │   └── preprocessing/labeling_processor.py # title/channel normalization (imported)
│   │
│   ├── labeling/                  # data-pipeline docs + label spec
│   │   ├── label_definition.md    # the "broad educational" definition + LABEL_VERSION
│   │   ├── seed_queries_education.txt / seed_queries_general.txt
│   │   └── README.md              # full Phase 1 pipeline walkthrough
│   │
│   ├── data/
│   │   ├── raw_data/              # immutable API scrapes (api_*.jsonl)
│   │   ├── labeled_data/          # api_category_labeled.jsonl, gemini_labeled.jsonl
│   │   ├── normalized_broad/      # intermediate normalized labeled records
│   │   ├── processed_data/        # master_broad_v1.{csv,jsonl}  <- current training set
│   │   └── legacy/                # FROZEN original STEM-strict pipeline (raw/normalized/labeled/processed)
│   │
│   ├── notebooks/educational_video_classification.ipynb   # EDA + training
│   ├── js_model/                  # source-of-truth converted model + JS classifier + test page
│   └── trained_models/            # *.joblib + model_metadata.json
│
├── .env.example                   # YOUTUBE_API_KEY / GEMINI_API_KEY template
├── requirements.txt
├── ROADMAP.md                     # phased plan (current state -> productized extension)
└── README.md
```

## Quick start

### 1. Install dependencies

```bash
pip install -r requirements.txt
```

### 2. (Optional) load the extension

In Chrome: `chrome://extensions` → enable Developer mode → **Load unpacked** →
select the `extension/` folder. The shipped model in `extension/model/` is used
directly; no build step is needed just to try it.

### 3. Train / iterate on the model

```bash
jupyter notebook ml/notebooks/educational_video_classification.ipynb
```

## Data pipeline (broad-v1)

The full walkthrough lives in [`ml/labeling/README.md`](ml/labeling/README.md).
The design principle is **re-labelable by construction**: raw scrapes are
immutable and rich, and labels are a separate, versioned layer with provenance,
so the "educational" definition can change without re-scraping.

```bash
# 0. one-time: cp .env.example .env  and fill in API keys

# 1. scrape rich, immutable raw metadata (preview with --dry-run, no key needed)
python ml/scripts/youtube_category_scraper.py --categories 27,28   # educational
python ml/scripts/youtube_category_scraper.py --categories 24,20   # non-educational

# 2. label  (pick one or both; both stamp source/version/confidence)
python ml/scripts/apply_category_labels.py          # free, weak, from category hint
python ml/scripts/gemini_labeler.py --limit 50      # LLM "silver" labels (sample first)

# 3. normalize + merge with precedence (gemini > category) -> current training set
python ml/scripts/build_broad_dataset.py            # -> ml/data/processed_data/master_broad_v1.csv
```

## Model export & browser parity

The browser classifier must produce **identical** predictions to the Python
model. After retraining:

```bash
python ml/scripts/model_to_js_converter.py    # joblib -> ml/js_model/clarigo_model.json
python ml/scripts/parity_test.py              # asserts Python == JS on samples
python ml/scripts/copy_model_to_extension.py  # publish to extension/model/
```

`parity_test.py` guards against train/serve skew (e.g. TF-IDF normalization or
keyword-counting differences between scikit-learn and the JS implementation).

## Features

**Text (TF-IDF):** combined title + channel name, 1–2 grams, English stop words
removed, raw term counts × IDF, L2-normalized (matched exactly in JS).

**Numerical:** title length, title word count, channel word count, digits-in-title
flag, uppercase ratio, and educational-keyword count.

## A note on the two label definitions

- **Legacy (STEM-strict):** the original ~3k hand-labeled videos and their
  `master_dataset.csv` are **frozen** in `ml/data/legacy/`. They were labeled
  under a narrower definition and are kept for provenance, not rebuilt.
- **Current (broad-v1):** the scaled, API-collected, LLM/category-labeled data
  built into `master_broad_v1.csv`.

These are kept **separate on purpose** to avoid mixing label definitions in one
training set. See `ml/labeling/label_definition.md` for the active definition.

## License

For educational and research purposes.
