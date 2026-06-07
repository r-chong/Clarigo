"""Evaluate a trained fastText classifier on the validation set."""

from __future__ import annotations

from pathlib import Path

import fasttext
from sklearn.metrics import classification_report, confusion_matrix

REPO_ROOT = Path(__file__).resolve().parents[2]
VALID = REPO_ROOT / "ml/data/fasttext/valid.txt"
MODEL = REPO_ROOT / "ml/trained_models/clarigo_broad_v1.bin"


def parse_valid_line(line: str) -> tuple[str, str] | None:
    line = line.strip()
    if not line:
        return None
    label_token, text = line.split(" ", 1)
    return label_token.replace("__label__", ""), text.strip()


def main() -> None:
    model = fasttext.load_model(str(MODEL))

    n, precision, recall = model.test(str(VALID))
    print(f"model.test: n={n} precision@1={precision:.4f} recall@1={recall:.4f}\n")

    y_true: list[str] = []
    texts: list[str] = []
    for line in VALID.read_text(encoding="utf-8").splitlines():
        parsed = parse_valid_line(line)
        if parsed is None:
            continue
        true_label, text = parsed
        y_true.append(true_label)
        texts.append(text)

    pred_labels, _ = model.predict(texts, k=1)
    y_pred = [label[0].replace("__label__", "") for label in pred_labels]

    print(classification_report(y_true, y_pred, target_names=["non-edu (0)", "edu (1)"]))
    print("confusion matrix (rows=true, cols=pred):")
    print(confusion_matrix(y_true, y_pred))

    print("\nspot checks:")
    samples = [
        "introduction to calculus limits explained khan academy",
        "funny cat compilation 2024 lol pets",
        "minecraft speedrun world record dream",
    ]
    sample_preds, _ = model.predict(samples, k=1)
    for text, pred in zip(samples, sample_preds):
        print(f"  {pred[0]}: {text}")


if __name__ == "__main__":
    main()
