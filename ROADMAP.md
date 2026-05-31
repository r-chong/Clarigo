# Clarigo Roadmap: From Logistic Regression to Context-Aware, In-Browser Classification

This roadmap turns a high-level strategy discussion into a concrete, phased plan for evolving Clarigo's classifier from a TF-IDF + logistic regression baseline into a more robust, **semantically-aware** model that still runs **natively in the browser** with imperceptible latency.

---

## 1. Where We Are Today (Baseline)

| Area | Current State |
|------|---------------|
| **Model** | `LogisticRegression` + TF-IDF (5k features, 1–2 grams) + 5 numeric features |
| **Dataset** | ~3,024 hand/GPT-labeled videos (title + channel metadata) |
| **Performance** | ~93% test accuracy, ~0.97 ROC-AUC (notebook) |
| **Training** | `ml/notebooks/educational_video_classification.ipynb` (scikit-learn) |
| **In-browser inference** | Pure-JS reimplementation in `ml/js_model/clarigo_classifier.js` (copied to `extension/model/`) reading `clarigo_model.json` |
| **Extension** | MV3 content script fades non-educational feed items (`opacity: 0.1`); popup toggle + onboarding present |

> **Layout note:** the repo was refactored into `extension/` (the Chrome extension) and `ml/` (data, notebooks, scripts, model artifacts). The earlier `src/` and `model/` paths are gone.

### Known limitations driving this roadmap
- **No semantic understanding** — relies on exact keyword/n-gram matches. "Introduction to Calculus" vs "Funny Math Fails" look similar by vocabulary.
- **Hand-labeling doesn't scale** — 3k samples is a ceiling on accuracy.

### Phase 0 findings (now resolved — see Section 5)
- ~~`src/background.js` missing~~ → **false alarm**: `extension/background.js` exists and is correct.
- ~~`.joblib` not committed~~ → **already committed** at `ml/trained_models/educational_video_classifier.joblib`.
- **`model_to_js_converter.py` was genuinely missing** → recreated; regenerates the committed model JSON bit-for-bit (all params match to 0.0).
- **Two real train/serve skews found and fixed** in the JS classifier:
  1. `edu_keywords_total` was counted on the combined string instead of per-field-summed (under-counted keywords appearing in both title and channel).
  2. **TF-IDF math was wrong** — JS divided term frequency by document length and skipped L2 normalization, so the browser ran a meaningfully *different* model than the one trained. Now matches scikit-learn exactly (raw count × idf, L2-normalized, with stopword removal before n-grams and `token_pattern` filtering).
- A **Python↔JS parity test** now guards against regressions (all 10 sample inputs agree to machine precision).

---

## 2. Guiding Constraints

Every decision below is filtered through three hard constraints:

1. **Runs 100% client-side** — no inference server, preserves user privacy (a stated project value).
2. **Imperceptible latency** — feed items are scored as the user scrolls; budget is single-digit milliseconds per item, model load under ~1–2s.
3. **Small footprint** — the model ships inside a Chrome extension; multi-hundred-MB models are off the table.

---

## 3. Strategic Goals

- **G1 — Scale the dataset** from ~3k hand-labeled to **20k–50k** semi-supervised samples.
- **G2 — Upgrade the architecture** from logistic regression to a model that captures **semantic meaning**.
- **G3 — Keep it browser-native** with a reproducible Python → ONNX/TFJS → extension export pipeline.
- **G4 — Productize the extension** (popup, settings, persistence, Web Store readiness).

---

## 4. Architecture Options (Decision Matrix)

The core technical fork is **which model architecture** replaces logistic regression. Three candidates, in order of recommendation:

| Option | What it is | Footprint | Semantic quality | Browser runtime | Effort |
|--------|-----------|-----------|------------------|-----------------|--------|
| **A. Transformers.js** (DistilBERT/TinyBERT, fine-tuned → ONNX) | Tiny transformer running via WASM/WebGPU | ~15–60 MB | **Highest** (true context) | `@xenova/transformers` in service worker | High |
| **B. TensorFlow.js + 1D-CNN** | Word embeddings + 1D convolution over text | ~2–10 MB | Medium-high (local context patterns) | `@tensorflow/tfjs` | Medium |
| **C. FastText → WASM** | Compressed n-gram/subword linear classifier | ~1–5 MB | Medium (better than LR, subword-aware) | FastText compiled to WASM | Medium-low |

### Recommendation: a two-track approach
- **Track 1 (fast win): Option C or B.** FastText or a 1D-CNN is a low-risk, high-ROI upgrade over logistic regression with a tiny footprint. Ship this first to validate the expanded dataset and export pipeline.
- **Track 2 (ceiling-raiser): Option A.** Fine-tune a TinyBERT/DistilBERT and benchmark it against Track 1. Adopt only if the accuracy gain justifies the larger footprint and load time.

> **Decision gate:** Don't commit to a single architecture until Phase 2 benchmarks all viable candidates on the *same* expanded dataset and measures real in-browser load + inference time.

---

## 5. Phased Plan

### Phase 0 — Stabilize the Foundation (prerequisite) — ✅ COMPLETE
*Goal: a clean, reproducible baseline before changing anything substantive.*

- [x] Confirm MV3 service worker — `extension/background.js` exists and registers correctly (was a false alarm).
- [x] Recreate the export script — `ml/scripts/model_to_js_converter.py` regenerates `clarigo_model.json` from the committed `.joblib`; output matches the previously shipped model bit-for-bit.
- [x] Audit and fix the **`edu_keywords_total` skew** — JS now counts keywords per-field and sums, matching Python.
- [x] **Bonus skew found & fixed:** JS TF-IDF now uses raw-count × idf with L2 normalization, stopword removal before n-grams, and `token_pattern` filtering — exactly matching scikit-learn. (The old JS ran a different model than was trained.)
- [x] Add a **parity test** — `ml/scripts/parity_test.py` + `ml/scripts/parity_runner.mjs` assert Python and JS agree; all 10 samples match to machine precision.
- [x] Add a **copy step** — `ml/scripts/copy_model_to_extension.py` syncs `ml/js_model/` → `extension/model/`.
- [x] **Pin dependencies** (`requirements.txt`, notably `scikit-learn==1.7.1` to match the serialized model) and **document** the retrain → export → parity → copy workflow in `ml/js_model/README.md`.

**Exit criteria (met):** Retraining and re-exporting is a documented, repeatable set of commands; Python and JS agree on predictions to machine precision, enforced by an automated parity test.

**New build/ship commands (from repo root):**
```bash
python ml/scripts/model_to_js_converter.py    # joblib -> ml/js_model/clarigo_model.json
python ml/scripts/parity_test.py              # assert JS == scikit-learn (requires Node)
python ml/scripts/copy_model_to_extension.py  # sync into extension/model/
```

---

### Phase 1 — Scale the Dataset (G1) — 🚧 IN PROGRESS (scaffolding built; needs API keys to run)
*Goal: 20k–50k labeled samples without manual grind.*

**Decisions locked:** broad "educational" definition · YouTube category scrape as the first source · Gemini for LLM labeling.

#### Design decision: re-labelable by construction
The label definition is **provisional and expected to change**, so the pipeline separates immutable rich raw data from a versioned label layer:
- Raw scrapes keep description/tags/stats/`categoryId` (`ml/data/raw_data/`) — never need re-scraping.
- The definition lives in **`ml/labeling/label_definition.md`** with a `LABEL_VERSION` token.
- Every label carries provenance: `label_source`, `label_version`, `label_confidence`.
- Changing the definition = bump `LABEL_VERSION` and re-run the labeler. See **`ml/labeling/README.md`** for the full data flow.

#### 1a. Strategic scraping (YouTube Data API) — ✅ built & running
- [x] `ml/scripts/youtube_category_scraper.py` — collects by **Category ID** via **seed-query search + videos.list hydration** (mostPopular 404s on edu categories; `videoCategoryId` needs a query term). Stores rich metadata + weak `category_label_hint`. Dependency-free (stdlib), key-ready (`YOUTUBE_API_KEY`), `--dry-run` works without a key.
- [x] Seed-query lists (`ml/labeling/seed_queries_education.txt` / `seed_queries_general.txt`) — diverse subjects for channel diversity; editable.
- [x] **First real scrape done:** 2,492 videos (1,500 edu cat 27 / 992 non-edu cat 24) → `ml/data/raw_data/api_27-24_2026-05-31.jsonl`.
- [ ] Scale up: more categories (28, 20, 23) and deeper paging across days (free quota ~5k videos/day).

#### 1b. Labeling — ✅ built; category labels applied, Gemini pending billing
- [x] **Fast/implicit:** `ml/scripts/apply_category_labels.py` — ran on the 2,492 scraped videos → `ml/data/labeled_data/api_category_labeled.jsonl` (weak `cat-v1` labels, no LLM cost).
- [x] **Authoritative (silver):** `ml/scripts/gemini_labeler.py` — Gemini batch labeler under the versioned definition, emits `label`/`confidence`/`reason`, routes low-confidence to a **review queue**, is **resumable**, stamps `label_version`. Verified end-to-end (SDK/key/prompt all work).
- [ ] **Gemini blocked on billing:** API returns `429 limit: 0` (free tier disabled for the project). Enable billing on the Cloud project (cost < $1 for this batch), then run `gemini_labeler.py`.
- [ ] **Spot-check** category + Gemini labels vs human judgment to estimate noise.

#### 1c. External dataset blending (optional)
- [ ] Pull topic-classification datasets from Hugging Face and extract science/education classes to enrich vocabulary.
- [ ] **Caveat:** domain mismatch (news/QA vs YouTube titles). Blend behind a measurement, not by default.

#### 1d. Label-source precedence — ✅ done
- [x] `ml/scripts/build_broad_dataset.py` concatenates label sources **highest-precedence-first (gemini > category)** and de-dupes by `videoId` keeping the first, so authoritative labels supersede weak ones. Builds a **separate** `ml/data/processed_data/master_broad_v1.csv` (decision: keep broad-v1 apart from the legacy STEM-strict `master_dataset.csv`).
- [x] First build: **2,492 rows** (1,500 edu / 992 non-edu), all `category` source so far.

**Exit criteria:** 20k+ labeled rows in `master_broad_v1.csv` with a documented label-quality estimate. (Currently 2,492; scale scraping + add Gemini labels.)

**Phase 1 commands (from repo root, after `cp .env.example .env`):**
```bash
python ml/scripts/youtube_category_scraper.py --categories 27,28   # edu (+ 24,20 non-edu)
python ml/scripts/apply_category_labels.py        # fast weak labels, AND/OR:
python ml/scripts/gemini_labeler.py               # LLM labels (needs billing)
python ml/scripts/build_broad_dataset.py          # separate broad-v1 master, gemini>category
```

---

### Phase 2 — Upgrade & Benchmark the Model (G2)
*Goal: pick the best architecture empirically.*

- [ ] Re-train the **logistic regression baseline** on the expanded dataset (establishes the bar to beat).
- [ ] Implement and train candidate models on the **same splits**:
  - [ ] FastText classifier
  - [ ] 1D-CNN (Keras/TF, embeddings over tokenized title+channel)
  - [ ] Fine-tuned TinyBERT/DistilBERT
- [ ] Evaluate each on a **shared held-out set** with consistent metrics: accuracy, ROC-AUC, precision/recall, and **confusion on hard cases** (e.g. "Funny Math Fails").
- [ ] Measure **deployment cost** for each: exported size, browser load time, per-item inference time.
- [ ] Produce a comparison table and pick the winner via the Section 4 decision gate.

**Exit criteria:** A chosen architecture with documented accuracy *and* in-browser performance numbers that beat the LR baseline within the Section 2 constraints.

---

### Phase 3 — Browser Export Pipeline (G3)
*Goal: get the chosen model running in the extension reproducibly.*

- [ ] Implement the export path for the chosen architecture:
  - **Transformers.js:** fine-tune in Python → export to **ONNX** → load with `@xenova/transformers`.
  - **TFJS:** convert SavedModel/Keras → TFJS format.
  - **FastText:** compile to **WASM**, ship compressed model.
- [ ] Introduce a real **JS build step** (bundler) — current vanilla-JS, no-`package.json` setup won't cleanly host these runtimes.
- [ ] Run inference in the **service worker** to keep the content script light; message-pass scores back to `content.js`.
- [ ] Benchmark cold-load and warm-inference in a real Chrome profile; confirm latency budget.
- [ ] Re-run the **parity test** (Phase 0) against the new model.

**Exit criteria:** The new model classifies live YouTube feed items in-browser, within latency budget, matching offline evaluation.

---

### Phase 4 — Productize the Extension (G4)
*Goal: ship-ready UX (tracks existing `TODO.md`).*

- [ ] **Popup** with on/off toggle and current-page stats.
- [ ] **Settings page**: filtering aggressiveness, hide vs. fade vs. label, category preferences.
- [ ] **Persistent settings** via `chrome.storage`.
- [ ] **Welcome/onboarding** page.
- [ ] Real icons + proper styling.
- [ ] Manifest metadata, screenshots, and privacy disclosures for **Chrome Web Store** submission.

**Exit criteria:** Installable, configurable, persistent extension ready for store review.

---

### Phase 5 — Stretch Goals
- [ ] **Active learning loop**: surface uncertain predictions for user feedback to continuously improve labels.
- [ ] **Per-user personalization**: lightweight on-device fine-tuning/adjustment of thresholds based on user behavior (a `TODO.md` stretch goal).
- [ ] Richer features (duration, view count, description) once proven to help.
- [ ] Multi-class topic tagging instead of binary educational/non-educational.

---

## 6. Sequencing & Dependencies

```
Phase 0 (Stabilize)
   │
   ▼
Phase 1 (Scale data) ──► Phase 2 (Benchmark models)
                              │
                              ▼
                         Phase 3 (Browser export)
                              │
                              ▼
                         Phase 4 (Productize) ──► Phase 5 (Stretch)
```

- Phase 0 unblocks everything (reproducible pipeline + parity testing).
- Phase 2 **requires** Phase 1's data to be meaningful.
- Phase 4 can begin UI scaffolding in parallel with Phase 2/3 since it's largely model-agnostic.

---

## 7. Key Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| **LLM label noise** propagates into the model | Human spot-checks + uncertainty routing; treat LLM labels as silver, not gold |
| **Train/serve skew** between Python and JS | Mandatory parity test in Phase 0 and after every export |
| **Transformer too heavy** for the extension | Two-track approach; FastText/CNN as the safe fallback; hard latency/size gates |
| **Label definition drift** (STEM vs broad "educational") | Lock one definition in Phase 1 before mass labeling |
| **External datasets hurt** YouTube accuracy | Blend behind an A/B measurement, not by default |
| **YouTube DOM changes** break scraping | Keep selector fallback lists; centralize selectors for easy updates |

---

## 8. Next Concrete Steps

**Phase 0 done** ✅. **Phase 1 scaffolding built** ✅ (label definition, scraper, two labelers, docs). Remaining to actually scale the data:

1. **Add API keys:** `cp .env.example .env` and fill in `YOUTUBE_API_KEY` + `GEMINI_API_KEY`.
2. **Scrape:** run `youtube_category_scraper.py` across edu (27/28) and non-edu (20/24/23) categories to build the raw pool.
3. **Label:** start with `apply_category_labels.py` (free) and/or `gemini_labeler.py --limit 50` to sanity-check, then scale; spot-check label quality.
4. **Merge with precedence (done ✅):** `build_broad_dataset.py` concatenates gemini > category and de-dupes by `videoId`, so authoritative labels win.
5. **Build + retrain:** `build_broad_dataset.py` → `master_broad_v1.csv`, retrain the notebook, then `model_to_js_converter.py` → `parity_test.py` → `copy_model_to_extension.py`.
6. **(Optional, parallel)** Load the extension unpacked and confirm the corrected TF-IDF improves real-feed filtering vs. the old build.

---

*This roadmap is a living document — revisit the architecture decision gate (Section 4) and risks (Section 7) at the end of each phase.*
