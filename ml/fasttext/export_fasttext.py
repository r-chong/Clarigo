# Take the master_broad_v1.jsonl and convert into the final data that fasttext will train on
from pathlib import Path
import json
import argparse
from sklearn.model_selection import train_test_split
REPO_ROOT = Path(__file__).resolve().parents[2]
MASTER = REPO_ROOT / "ml/data/processed_data/master_broad_v1.jsonl"
OUT_DIR = REPO_ROOT / "ml/data/fasttext"

def to_fasttext_line(label: int, text: str) -> str:
    return f"__label__{label} {text}"

def main():
    # add some Command Line Arguments
    parser = argparse.ArgumentParser()
    parser.add_argument("--test-size", type = float, default = 0.2)
    parser.add_argument("--seed", type=int, default = 42)
    args = parser.parse_args()

    rows = [json.loads(line) for line in MASTER.read_text().splitlines() if line.strip()]

    lines = []

    for r in rows:
        text = f"{r['title']} {r['channelName']}".strip()
        if not text:
            continue
        lines.append((r["label"], to_fasttext_line(r["label"], text)))
    train, valid = train_test_split(
        lines, test_size=args.test_size, random_state=args.seed,
        stratify=[lbl for lbl, _ in lines],
    )
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUT_DIR / "train.txt").write_text("\n".join(l for _, l in train) + "\n")
    (OUT_DIR / "valid.txt").write_text("\n".join(l for _, l in valid) + "\n")
    print(f"train={len(train)} valid={len(valid)}")


if __name__ == "__main__":
    main()