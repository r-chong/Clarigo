# Phase 1 Data Pipeline (scrape → label → master dataset)

Goal: scale the training set from ~3k hand-labeled videos toward 20k–50k using
the YouTube Data API + LLM weak supervision, **without locking ourselves into
today's label definition.**

## Design principle: re-labelable by construction

The "educational" definition is provisional and **will change**. So:

- **Raw scrapes are immutable and rich.** `youtube_category_scraper.py` keeps
  description, tags, stats, and `categoryId` — everything a future definition
  might need — in `ml/data/raw_data/`.
- **Labels are a separate layer with provenance.** Every labeled record carries
  `label_source`, `label_version`, and `label_confidence`. The definition lives
  in one file, `label_definition.md`, with a `LABEL_VERSION` token.
- **Changing the definition = bump `LABEL_VERSION` and re-run the labeler over
  the same raw data.** No re-scraping. Old labels remain distinguishable by
  their stamped version.

## Data flow

```
youtube_category_scraper.py            # YOUTUBE_API_KEY
   └─> ml/data/raw_data/api_*.jsonl    # immutable, rich, + category_label_hint

   ├─ apply_category_labels.py         # FAST weak labels from category hint
   │     └─> ml/data/labeled_data/api_category_labeled.jsonl   (cat-v1)
   │
   └─ gemini_labeler.py                # GEMINI_API_KEY, AUTHORITATIVE silver labels
         ├─> ml/data/labeled_data/gemini_labeled.jsonl         (broad-v1)
         └─> ml/data/review_queue/gemini_low_confidence.jsonl  (human review)

build_broad_dataset.py                 # normalizes (via labeling_processor) +
   │                                     # merges with precedence (gemini > category)
   ├─> ml/data/normalized_broad/*.jsonl              # intermediate
   └─> ml/data/processed_data/master_broad_v1.csv    (+ .jsonl)
```

Each labeled record looks like:

```json
{"videoId": "...", "title": "...", "channelName": "...", "channelUrl": "...",
 "videoUrl": "...", "categoryId": 27, "label": 1,
 "label_source": "gemini:gemini-2.0-flash", "label_version": "broad-v1",
 "label_confidence": 0.92, "label_reason": "structured tutorial on ..."}
```

## How the scraper finds category videos (important)

`chart=mostPopular` only exists for some categories (Music/Gaming/Entertainment/
Sports) — Education (27) and Science & Tech (28) return **HTTP 404**. And
`search.list` returns **nothing** for a `videoCategoryId` unless a query term is
also given. So the scraper sweeps **seed queries** within each category:

- `ml/labeling/seed_queries_education.txt` — used for edu-hint categories.
- `ml/labeling/seed_queries_general.txt` — used for non-edu-hint categories.

Using many diverse queries also surfaces many different channels, which helps
the model generalize instead of memorizing a few channel names. Edit these
lists freely. The Search API caps each query at ~500 results.

## Commands (from repo root)

```bash
# 0. one-time: cp .env.example .env  and fill in the keys

# 1. scrape (preview first with --dry-run; no key needed for that).
#    Seed queries are auto-selected per category hint.
python ml/scripts/youtube_category_scraper.py --categories 27,28   # educational
python ml/scripts/youtube_category_scraper.py --categories 24,20   # non-educational

# 2a. FAST path — weak labels straight from category (no LLM cost)
python ml/scripts/apply_category_labels.py

# 2b. or/also LLM path — sample first to sanity-check, then scale
python ml/scripts/gemini_labeler.py --dry-run        # inspect the prompt (no key)
python ml/scripts/gemini_labeler.py --limit 50       # cheap sample
python ml/scripts/gemini_labeler.py                  # label everything new

# 3. build the SEPARATE broad-v1 dataset (does NOT touch the legacy
#    master_dataset.csv). Applies precedence: gemini > category.
python ml/scripts/build_broad_dataset.py
# -> ml/data/processed_data/master_broad_v1.csv
```

> The legacy STEM-strict dataset is **frozen** in
> `ml/data/legacy/processed/master_dataset.csv` (built under the old definition).
> We don't rebuild it; the broad-v1 set is kept separate (see "Notes") until we
> decide to re-label everything under one definition.

## Gemini API: billing

Google now requires **billing enabled** on the Cloud project for most Gemini
API usage. Without it the API returns `429 RESOURCE_EXHAUSTED` with `limit: 0`.
`gemini-2.0-flash` is very cheap (labeling a few thousand titles costs well
under $1). Enable billing, or set `GEMINI_MODEL` to a model your project can
access. The labeler is resumable, so re-running only labels what's missing.

## Notes & open items

- **Separate datasets, by design:** the legacy `master_dataset.csv` (now in
  `ml/data/legacy/processed/`) was labeled under the old STEM-strict definition;
  the new data is broad-v1. We keep them apart (`master_broad_v1.csv`) to avoid
  mixing definitions in one training set.
- **Label-source precedence (done):** `build_broad_dataset.py` concatenates
  inputs highest-precedence-first (gemini > category) and de-dupes by `videoId`
  keeping the first, so authoritative Gemini labels supersede weak category
  labels for the same video.
- **Label quality:** category labels are noisy; LLM labels are "silver." Always
  spot-check a sample against human judgment before trusting at scale.
- **Re-labeling:** to adopt a new definition, edit `label_definition.md`, bump
  `LABEL_VERSION`, delete/rename `gemini_labeled.jsonl`, and re-run the labeler,
  then rebuild with `build_broad_dataset.py`.
