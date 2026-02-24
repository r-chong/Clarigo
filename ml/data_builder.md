# Clarigo: Automated Dataset Generation Strategy

## Overview
Hand-labeling is a bottleneck. To build a robust, production-ready dataset for Clarigo's Logistic Regression model (and eventually the ONNX model), we need to programmatically generate tens of thousands of rows. 

Since the model relies heavily on text features (`title`, `channel_name`) to remain lightweight on the DOM, we can exploit existing metadata and contextual clues to infer labels without human intervention.

---

## Strategy 1: Repurposing Existing Datasets (Fastest Baseline)
Leverage existing massive datasets that already contain YouTube metadata and map their existing categories to our binary `1` (Educational) and `0` (Non-Educational) labels.

* **Kaggle YouTube Trending Statistics:**
    * **The Data:** Contains `title`, `channel_title`, and `categoryId`.
    * **The Mapping:**
        * `Category 27` (Education), `28` (Science & Technology) -> **Label 1**
        * `Category 20` (Gaming), `24` (Entertainment), `23` (Comedy) -> **Label 0**
* **HowTo100M Dataset:**
    * **The Data:** 1.2 million instructional videos.
    * **The Mapping:** Extract titles and channel names, blanket apply **Label 1**.

---

## Strategy 2: Blanket Channel Scraping (High-Yield Context)
Channel names are one of the strongest predictors in our TF-IDF vectorizer. We can generate highly accurate data by scraping specific, pre-vetted channels.

### Process:
1.  **Curate Seed Lists:**
    * *List A (Educational):* Veritasium, 3Blue1Brown, CrashCourse, freeCodeCamp, etc.
    * *List B (Non-Educational):* MrBeast, IGN, generic gaming/prank channels.
2.  **Scrape via API:** Use the YouTube Data API `search` or `playlistItems` (targeting the channel's "Uploads" playlist) to pull all video titles.
3.  **Auto-Label:** Assign `1` to everything from List A, and `0` to everything from List B.

---

## Strategy 3: API Category ID Scraping (Implicit Labeling)
Instead of searching by keyword, query the YouTube Data API directly using the `videoCategoryId` parameter to build a balanced dataset.

### Process:
1.  **Query Positive Class:** Search for recent videos using `videoCategoryId=27` (Education). Map to `1`.
2.  **Query Negative Class:** Search for recent videos using `videoCategoryId=24` (Entertainment) or `20` (Gaming). Map to `0`.
3.  **Extract:** Save the `title` and `channel_name` to `data/normalized/`.

---

## Strategy 4: LLM Weak Supervision (For the "Grey Area")
To help the model learn the boundary between educational and non-educational content (e.g., "Edutainment" or documentaries), use an LLM as an automated annotator.


### Process:
1.  **Scrape Homepage:** Pull a random sample of raw videos from the YouTube homepage.
2.  **Prompt the LLM:** Pass the metadata to a cheap, fast LLM API (like Gemini Flash) with the prompt: 
    > *"Based on this YouTube title and channel, is this video strictly educational? Reply with 1 for Yes or 0 for No."*
3.  **Train the LR Model:** Use this "silver standard" LLM-labeled data to train the lightweight Logistic Regression model.

---

## Implementation Plan

### Phase 1: The Kaggle Quick-Start
- [ ] Download a Kaggle YouTube Trending dataset.
- [ ] Write a script in `preprocessing/` to filter by `categoryId`, drop unnecessary columns, and map the 1/0 labels.
- [ ] Run through `dataset_builder.py` and test the model's accuracy jump.

### Phase 2: The API Pipeline
- [ ] Set up a Google Cloud Project and get a YouTube Data API key.
- [ ] Write a Python script to execute **Strategy 2** (Blanket Channel Scraping).
- [ ] Append new data to `master_dataset.csv` and retrain.

### Phase 3: Edge Case Refinement
- [ ] Identify misclassifications (e.g., false positives on gaming tutorials).
- [ ] Use **Strategy 4** (LLM Weak Supervision) specifically on tricky keywords to fine-tune the decision boundary.