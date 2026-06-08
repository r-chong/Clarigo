"""Convert the trained scikit-learn pipeline into the browser-ready JSON the
Chrome extension consumes.

The extension cannot run scikit-learn, so `clarigo_classifier.js` reimplements
the math (TF-IDF -> StandardScaler -> logistic regression). This script extracts
every parameter that reimplementation needs out of the fitted joblib pipeline and
writes it to `ml/js_model/clarigo_model.json`.

Pipeline shape (see ml/notebooks/educational_video_classification.ipynb):

    Pipeline([
        ('preprocessor', ColumnTransformer([
            ('text', TfidfVectorizer(...), 'combined_text'),
            ('num',  StandardScaler(),     numerical_features),
        ])),
        ('classifier', LogisticRegression(...)),
    ])

Feature order produced by the ColumnTransformer is ALL text (TF-IDF) features
first, then the 5 numerical features. `clarigo_classifier.js` relies on exactly
that ordering, so do not reorder the transformers without updating the JS.

Usage (from repo root):
    python ml/scripts/model_to_js_converter.py
    python ml/scripts/model_to_js_converter.py --model path/to.joblib --out path/to.json
"""

from __future__ import annotations

import argparse
import json
from datetime import date
from pathlib import Path

import joblib

# Must match `educational_keywords` in the training notebook exactly. These are
# baked into the JSON so the browser counts the same keywords the model trained
# on. If you change this list, you MUST retrain (the scaler stats depend on it).
EDUCATIONAL_KEYWORDS = [
    "tutorial", "lesson", "learn", "course", "education", "teach", "how to",
    "explained", "guide", "training", "study", "lecture", "class", "exam",
    "homework", "university", "school", "college", "academic", "research",
    "science", "math", "physics", "chemistry", "biology", "history",
    "programming", "coding", "python", "javascript", "computer", "technology",
]

# Numerical feature order. MUST match the order the notebook passes to the
# ColumnTransformer AND the order `clarigo_classifier.js` builds them in.
NUMERICAL_FEATURES = [
    "title_word_count",
    "channel_word_count",
    "title_char_count",
    "channel_char_count",
    "edu_keywords_total",
]

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_MODEL = REPO_ROOT / "ml" / "trained_models" / "educational_video_classifier.joblib"
DEFAULT_METADATA = REPO_ROOT / "ml" / "trained_models" / "model_metadata.json"
DEFAULT_OUT = REPO_ROOT / "ml" / "js_model" / "clarigo_model.json"


def _load_performance(metadata_path: Path) -> dict:
    """Best-effort read of accuracy/AUC from the training metadata sidecar."""
    if not metadata_path.exists():
        return {"accuracy": None, "auc": None}
    meta = json.loads(metadata_path.read_text(encoding="utf-8"))
    perf = meta.get("performance", {})
    return {
        "accuracy": perf.get("test_accuracy"),
        "auc": perf.get("test_auc"),
    }


def convert(model_path: Path, metadata_path: Path, out_path: Path) -> dict:
    pipeline = joblib.load(model_path)

    preprocessor = pipeline.named_steps["preprocessor"]
    tfidf = preprocessor.named_transformers_["text"]
    scaler = preprocessor.named_transformers_["num"]
    classifier = pipeline.named_steps["classifier"]

    # TF-IDF: vocabulary is {term -> column index}; idf_values is indexed by that
    # same column index. Cast away numpy types so json.dump is happy.
    vocabulary = {term: int(idx) for term, idx in tfidf.vocabulary_.items()}
    idf_values = [float(v) for v in tfidf.idf_.tolist()]

    performance = _load_performance(metadata_path)

    model_data = {
        "model_info": {
            "name": "Clarigo Educational Video Classifier",
            "version": "1.0",
            "type": "Logistic Regression with TF-IDF",
            "created": date.today().isoformat(),
            "accuracy": performance["accuracy"],
            "auc": performance["auc"],
        },
        "preprocessing": {
            "educational_keywords": EDUCATIONAL_KEYWORDS,
            "tfidf": {
                "vocabulary": vocabulary,
                "idf_values": idf_values,
                "ngram_range": list(tfidf.ngram_range),
                # scikit-learn removes these stop words AFTER tokenizing but
                # BEFORE building n-grams, so bigrams can span a removed word
                # (e.g. "tutorial for beginners" -> "tutorial beginners"). The
                # JS must replicate that to avoid skew, so ship the resolved set.
                "stop_words": sorted(tfidf.get_stop_words() or []),
                "token_pattern": tfidf.token_pattern,
            },
            "numerical_scaler": {
                "mean": [float(v) for v in scaler.mean_.tolist()],
                "scale": [float(v) for v in scaler.scale_.tolist()],
                "var": [float(v) for v in scaler.var_.tolist()],
            },
        },
        "model": {
            "coef": [[float(v) for v in row] for row in classifier.coef_.tolist()],
            "intercept": [float(v) for v in classifier.intercept_.tolist()],
            "classes": [int(c) for c in classifier.classes_.tolist()],
            "C": float(classifier.C),
        },
        "feature_names": {
            "text_features": ["combined_text"],
            "numerical_features": NUMERICAL_FEATURES,
        },
    }

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(model_data, indent=2), encoding="utf-8")

    summary = {
        "conversion_successful": True,
        "output_file": str(out_path.relative_to(REPO_ROOT)),
        "file_size_kb": round(out_path.stat().st_size / 1024, 1),
        "vocabulary_size": len(vocabulary),
        "total_features": len(vocabulary) + len(NUMERICAL_FEATURES),
        "numerical_features": len(NUMERICAL_FEATURES),
        "model_accuracy": performance["accuracy"],
    }
    (out_path.parent / "conversion_summary.json").write_text(
        json.dumps(summary, indent=2), encoding="utf-8"
    )
    return summary


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--model", type=Path, default=DEFAULT_MODEL,
                        help="Path to the trained .joblib pipeline.")
    parser.add_argument("--metadata", type=Path, default=DEFAULT_METADATA,
                        help="Path to model_metadata.json (for accuracy/AUC).")
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT,
                        help="Where to write clarigo_model.json.")
    args = parser.parse_args()

    if not args.model.exists():
        raise SystemExit(f"Model not found: {args.model}\nTrain the notebook first.")

    summary = convert(args.model, args.metadata, args.out)
    print("Conversion complete:")
    print(json.dumps(summary, indent=2))
    print("\nNext: copy into the extension with")
    print("    python ml/scripts/copy_model_to_extension.py")


if __name__ == "__main__":
    main()
