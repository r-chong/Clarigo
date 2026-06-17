"""Compare fastText and logistic-regression classifiers on the same validation set.

Rebuilds the train/valid split from ``master_broad_v1.jsonl`` using the same
rules as ``ml/fasttext/export_fasttext.py`` (non-empty title+channel, seed=42,
20% holdout). fastText is evaluated on raw combined text; LR uses the full
notebook feature set (TF-IDF + numerical/keyword features).

Usage (from repo root):
    python ml/scripts/compare_models.py
    python ml/scripts/compare_models.py --disagreements-out ml/data/review_queue/model_disagreements.csv
"""

from __future__ import annotations

import argparse
import csv
import json
import sys
from pathlib import Path

import fasttext
import joblib
import numpy as np
import pandas as pd
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    confusion_matrix,
    f1_score,
    roc_auc_score,
)
from sklearn.model_selection import train_test_split

REPO_ROOT = Path(__file__).resolve().parents[2]
MASTER = REPO_ROOT / "ml/data/processed_data/master_broad_v1.jsonl"
FASTTEXT_MODEL = REPO_ROOT / "ml/trained_models/clarigo_broad_v1.bin"
LR_MODEL = REPO_ROOT / "ml/trained_models/educational_video_classifier.joblib"
METADATA = REPO_ROOT / "ml/trained_models/model_metadata.json"

sys.path.insert(0, str(REPO_ROOT / "ml/scripts/preprocessing"))
import labeling_processor  # noqa: E402

DEFAULT_KEYWORDS = [
    "tutorial", "lesson", "learn", "course", "education", "teach", "how to",
    "explained", "guide", "training", "study", "lecture", "class", "exam",
    "homework", "university", "school", "college", "academic", "research",
    "science", "math", "physics", "chemistry", "biology", "history",
    "programming", "coding", "python", "javascript", "computer", "technology",
]


def load_keywords() -> list[str]:
    if METADATA.exists():
        meta = json.loads(METADATA.read_text(encoding="utf-8"))
        kws = meta.get("preprocessing", {}).get("educational_keywords")
        if kws:
            return kws
    return DEFAULT_KEYWORDS


def count_keywords(text: str, keywords: list[str]) -> int:
    if not text:
        return 0
    return sum(1 for kw in keywords if kw in text)


def build_lr_frame(rows: list[dict], keywords: list[str]) -> pd.DataFrame:
    records = []
    for r in rows:
        title_clean = labeling_processor.clean_text(r.get("title"))
        channel_clean = labeling_processor.clean_text(r.get("channelName"))
        combined = f"{title_clean} {channel_clean}".strip()
        records.append(
            {
                "combined_text": combined,
                "title_word_count": len(title_clean.split()) if title_clean else 0,
                "channel_word_count": len(channel_clean.split()) if channel_clean else 0,
                "title_char_count": len(title_clean),
                "channel_char_count": len(channel_clean),
                "edu_keywords_total": count_keywords(title_clean, keywords)
                + count_keywords(channel_clean, keywords),
            }
        )
    return pd.DataFrame(records)


def load_valid_rows(
    master_path: Path, test_size: float, seed: int
) -> list[dict]:
    rows = [
        json.loads(line)
        for line in master_path.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]
    usable: list[dict] = []
    for r in rows:
        text = f"{r['title']} {r['channelName']}".strip()
        if not text:
            continue
        usable.append({**r, "_ft_text": text})

    _train, valid = train_test_split(
        usable,
        test_size=test_size,
        random_state=seed,
        stratify=[r["label"] for r in usable],
    )
    return valid


def fasttext_predict(texts: list[str], model) -> tuple[np.ndarray, np.ndarray]:
    """Match evaluate_fasttext.py: k=1 for labels (k=2 probs are unreliable on this model)."""
    pred_labels, pred_probs = model.predict(texts, k=1)
    y_pred = np.zeros(len(texts), dtype=int)
    y_prob = np.zeros(len(texts), dtype=float)
    for i, (labels, probs) in enumerate(zip(pred_labels, pred_probs)):
        winner = labels[0]
        conf = float(probs[0])
        y_pred[i] = int(winner.replace("__label__", ""))
        y_prob[i] = conf if winner == "__label__1" else 1.0 - conf
    return y_pred, y_prob


def summarize(name: str, y_true: np.ndarray, y_pred: np.ndarray, y_prob: np.ndarray) -> dict:
    return {
        "model": name,
        "n": len(y_true),
        "accuracy": accuracy_score(y_true, y_pred),
        "auc": roc_auc_score(y_true, y_prob),
        "f1_macro": f1_score(y_true, y_pred, average="macro"),
        "f1_weighted": f1_score(y_true, y_pred, average="weighted"),
    }


def print_metrics_block(name: str, y_true: np.ndarray, y_pred: np.ndarray) -> None:
    print(f"\n=== {name} ===")
    print(
        classification_report(
            y_true, y_pred, target_names=["non-edu (0)", "edu (1)"], digits=4
        )
    )
    print("confusion matrix (rows=true, cols=pred):")
    print(confusion_matrix(y_true, y_pred))


def write_disagreements(
    path: Path,
    rows: list[dict],
    y_true: np.ndarray,
    ft_pred: np.ndarray,
    ft_prob: np.ndarray,
    lr_pred: np.ndarray,
    lr_prob: np.ndarray,
) -> int:
    path.parent.mkdir(parents=True, exist_ok=True)
    fieldnames = [
        "videoId",
        "title",
        "channelName",
        "label",
        "label_source",
        "fasttext_pred",
        "fasttext_prob_edu",
        "lr_pred",
        "lr_prob_edu",
        "fasttext_correct",
        "lr_correct",
    ]
    disagreements = 0
    with path.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=fieldnames)
        writer.writeheader()
        for r, yt, fp, fpr, lp, lpr in zip(
            rows, y_true, ft_pred, ft_prob, lr_pred, lr_prob
        ):
            if int(fp) == int(lp):
                continue
            disagreements += 1
            writer.writerow(
                {
                    "videoId": r.get("videoId", ""),
                    "title": r.get("title", ""),
                    "channelName": r.get("channelName", ""),
                    "label": int(yt),
                    "label_source": r.get("label_source", ""),
                    "fasttext_pred": int(fp),
                    "fasttext_prob_edu": f"{fpr:.4f}",
                    "lr_pred": int(lp),
                    "lr_prob_edu": f"{lpr:.4f}",
                    "fasttext_correct": int(fp) == int(yt),
                    "lr_correct": int(lp) == int(yt),
                }
            )
    return disagreements


def main() -> None:
    parser = argparse.ArgumentParser(description="Compare fastText vs logistic regression.")
    parser.add_argument("--master", type=Path, default=MASTER)
    parser.add_argument("--fasttext-model", type=Path, default=FASTTEXT_MODEL)
    parser.add_argument("--lr-model", type=Path, default=LR_MODEL)
    parser.add_argument("--test-size", type=float, default=0.2)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument(
        "--disagreements-out",
        type=Path,
        default=None,
        help="Optional CSV path for rows where models disagree.",
    )
    parser.add_argument(
        "--show-disagreements",
        type=int,
        default=15,
        help="Print this many disagreement examples to stdout (0 to skip).",
    )
    args = parser.parse_args()

    if not args.master.exists():
        sys.exit(f"Master dataset not found: {args.master}")
    if not args.fasttext_model.exists():
        sys.exit(f"fastText model not found: {args.fasttext_model}")
    if not args.lr_model.exists():
        sys.exit(f"LR model not found: {args.lr_model}")

    valid_rows = load_valid_rows(args.master, args.test_size, args.seed)
    y_true = np.array([int(r["label"]) for r in valid_rows], dtype=int)
    ft_texts = [r["_ft_text"] for r in valid_rows]

    print(f"Validation set: {len(valid_rows)} rows")
    print(f"  non-edu (0): {(y_true == 0).sum()}  edu (1): {(y_true == 1).sum()}")
    print(f"  master: {args.master.relative_to(REPO_ROOT)}")
    print(f"  split: test_size={args.test_size}, seed={args.seed}")

    ft_model = fasttext.load_model(str(args.fasttext_model))
    lr_pipeline = joblib.load(args.lr_model)
    keywords = load_keywords()
    lr_frame = build_lr_frame(valid_rows, keywords)

    ft_pred, ft_prob = fasttext_predict(ft_texts, ft_model)
    lr_pred = lr_pipeline.predict(lr_frame).astype(int)
    lr_prob = lr_pipeline.predict_proba(lr_frame)[:, 1]

    ft_summary = summarize("fastText", y_true, ft_pred, ft_prob)
    lr_summary = summarize("Logistic Regression", y_true, lr_pred, lr_prob)
    agreement = float((ft_pred == lr_pred).mean())

    print("\n=== Summary (same validation set) ===")
    print(f"{'metric':<16} {'fastText':>12} {'logistic reg':>14}")
    print("-" * 44)
    for key in ("accuracy", "auc", "f1_macro", "f1_weighted"):
        print(
            f"{key:<16} {ft_summary[key]:12.4f} {lr_summary[key]:14.4f}"
        )
    print(f"{'agreement':<16} {agreement:12.4f}")

    print_metrics_block("fastText", y_true, ft_pred)
    print_metrics_block("Logistic Regression", y_true, lr_pred)

    disagree_mask = ft_pred != lr_pred
    n_disagree = int(disagree_mask.sum())
    print(f"\n=== Model agreement ===")
    print(f"Agree on {len(valid_rows) - n_disagree}/{len(valid_rows)} ({agreement:.1%})")
    print(f"Disagree on {n_disagree} rows")

    if n_disagree:
        ft_wins = int(((ft_pred == y_true) & (lr_pred != y_true)).sum())
        lr_wins = int(((lr_pred == y_true) & (ft_pred != y_true)).sum())
        both_wrong = int(((ft_pred != y_true) & (lr_pred != y_true)).sum())
        print(f"  fastText correct, LR wrong: {ft_wins}")
        print(f"  LR correct, fastText wrong: {lr_wins}")
        print(f"  both wrong: {both_wrong}")

        by_source: dict[str, int] = {}
        for r, disagree in zip(valid_rows, disagree_mask):
            if disagree:
                src = str(r.get("label_source", "unknown"))
                by_source[src] = by_source.get(src, 0) + 1
        print("  disagreements by label_source:")
        for src, count in sorted(by_source.items(), key=lambda x: -x[1]):
            print(f"    {src}: {count}")

    if args.disagreements_out:
        written = write_disagreements(
            args.disagreements_out,
            valid_rows,
            y_true,
            ft_pred,
            ft_prob,
            lr_pred,
            lr_prob,
        )
        print(f"\nWrote {written} disagreements to {args.disagreements_out}")

    if args.show_disagreements and n_disagree:
        print(f"\n=== Sample disagreements (up to {args.show_disagreements}) ===")
        shown = 0
        for r, yt, fp, fpr, lp, lpr in zip(
            valid_rows, y_true, ft_pred, ft_prob, lr_pred, lr_prob
        ):
            if int(fp) == int(lp):
                continue
            title = str(r.get("title", ""))[:60]
            channel = str(r.get("channelName", ""))[:30]
            print(
                f"  label={yt} ft={int(fp)}({fpr:.2f}) lr={int(lp)}({lpr:.2f}) "
                f"[{r.get('label_source', '')}] {title!r} | {channel!r}"
            )
            shown += 1
            if shown >= args.show_disagreements:
                break


if __name__ == "__main__":
    main()
