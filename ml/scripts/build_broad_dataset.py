"""Build a SEPARATE broad-v1 master dataset from the new API-scraped labels.

Kept deliberately separate from the legacy `master_dataset.csv` (which was
hand-labeled under the older STEM-strict definition) so we never mix two label
definitions in one training set.

What it does:
  1. Takes the broad-definition labeled files in PRECEDENCE order (highest
     first): Gemini labels > category labels. When the same videoId appears in
     more than one source, the higher-precedence label wins (Phase 1d).
  2. Normalizes title/channelName with the SAME logic as the legacy pipeline
     (ml/scripts/preprocessing/labeling_processor.py) for consistency.
  3. Writes ml/data/processed_data/master_broad_v1.csv (+ .jsonl), carrying
     label provenance (label_source / label_version / label_confidence).

It does NOT touch master_dataset.csv or ml/data/normalized/.

Usage (from repo root):
    python ml/scripts/build_broad_dataset.py
    python ml/scripts/build_broad_dataset.py --inputs ml/data/labeled_data/gemini_labeled.jsonl ml/data/labeled_data/api_category_labeled.jsonl
    python ml/scripts/build_broad_dataset.py --base ml/data/processed_data/master_broad_v1.jsonl --append ml/data/labeled_data/gemini_labeled.jsonl
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import pandas as pd

import lang_filter

REPO_ROOT = Path(__file__).resolve().parents[2]
LABELED_DIR = REPO_ROOT / "ml" / "data" / "labeled_data"
NORMALIZED_DIR = REPO_ROOT / "ml" / "data" / "normalized_broad"
PROCESSED_DIR = REPO_ROOT / "ml" / "data" / "processed_data"

sys.path.insert(0, str(REPO_ROOT / "ml" / "scripts" / "preprocessing"))
import labeling_processor  # noqa: E402  (reuse the canonical normalization)

# Default inputs in PRECEDENCE order (highest first). Gemini (authoritative
# broad-v1) supersedes weak category labels for the same videoId.
DEFAULT_INPUTS = [
    LABELED_DIR / "gemini_labeled.jsonl",
    LABELED_DIR / "api_category_labeled.jsonl",
]

KEEP_COLUMNS = [
    "label", "title", "videoUrl", "channelName", "channelUrl", "videoId",
    "label_source", "label_version", "label_confidence", "categoryId",
]


def rel(path: Path) -> str:
    try:
        return str(path.resolve().relative_to(REPO_ROOT))
    except ValueError:
        return str(path)


def normalize_inputs(inputs: list[Path]) -> list[Path]:
    """Normalize each labeled file into NORMALIZED_DIR, preserving order."""
    NORMALIZED_DIR.mkdir(parents=True, exist_ok=True)
    out_paths = []
    for src in inputs:
        dst = NORMALIZED_DIR / src.name
        labeling_processor.process_single_file(str(src), str(dst))
        out_paths.append(dst)
    return out_paths


def load_jsonl(path: Path) -> list[dict]:
    rows = []
    for line in path.read_text(encoding="utf-8-sig").splitlines():
        line = line.strip().lstrip("\ufeff")
        if line:
            try:
                rows.append(json.loads(line))
            except json.JSONDecodeError:
                continue
    return rows


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--inputs", nargs="*", type=Path, default=None,
                        help="Labeled JSONL files in precedence order (highest first). "
                             "Default: gemini_labeled.jsonl then api_category_labeled.jsonl.")
    parser.add_argument("--base", type=Path, default=None,
                        help="Existing master JSONL/CSV to keep as-is. With --append, only "
                             "videoIds not already in the base are added.")
    parser.add_argument("--append", nargs="*", type=Path, default=None,
                        help="Labeled JSONL file(s) to add without overwriting existing "
                             "videoIds (use with --base or after --inputs).")
    parser.add_argument("--filename", default="master_broad_v1.csv",
                        help="Output CSV filename in ml/data/processed_data/.")
    parser.add_argument("--keep-non-english", action="store_true",
                        help="Do NOT drop rows that look non-English "
                             "(default: drop them via lang_filter, title+channel).")
    args = parser.parse_args()

    append_paths = [p for p in (args.append or []) if p.exists()]

    if args.base:
        if not args.base.exists():
            sys.exit(f"Base file not found: {rel(args.base)}")
        if args.base.suffix.lower() == ".csv":
            base_df = pd.read_csv(args.base)
            rows = base_df.to_dict(orient="records")
        else:
            rows = load_jsonl(args.base)
        print(f"Base: {rel(args.base)} ({len(rows)} rows)")
    else:
        inputs = args.inputs if args.inputs else DEFAULT_INPUTS
        inputs = [p for p in inputs if p.exists()]
        if not inputs:
            sys.exit("No broad-label input files found. Run apply_category_labels.py "
                     "and/or gemini_labeler.py first.")
        print("Inputs (precedence high -> low):")
        for p in inputs:
            print(f"  {rel(p)}")
        normalized = normalize_inputs(inputs)
        rows = []
        for path in normalized:
            rows.extend(load_jsonl(path))
        if not rows:
            sys.exit("No records loaded after normalization.")
        before = len(rows)
        seen: set[str] = set()
        deduped_base = 0
        unique_rows: list[dict] = []
        for row in rows:
            vid = row.get("videoId", "")
            if vid and vid in seen:
                deduped_base += 1
                continue
            if vid:
                seen.add(vid)
            unique_rows.append(row)
        rows = unique_rows
        if deduped_base:
            print(f"  deduped {deduped_base} duplicate videoIds among inputs")

    if append_paths:
        print("Append (new videoIds only):")
        for p in append_paths:
            print(f"  {rel(p)}")
        seen = {r.get("videoId", "") for r in rows if r.get("videoId")}
        appended, skipped = 0, 0
        for src in append_paths:
            dst = NORMALIZED_DIR / src.name
            labeling_processor.process_single_file(str(src), str(dst))
            for row in load_jsonl(dst):
                vid = row.get("videoId", "")
                if not vid or vid in seen:
                    skipped += 1
                    continue
                seen.add(vid)
                rows.append(row)
                appended += 1
        print(f"  appended {appended} rows, skipped {skipped} (already in base)")

    if not rows:
        sys.exit("No records to write.")

    df = pd.DataFrame(rows)
    for col in KEEP_COLUMNS:
        if col not in df.columns:
            df[col] = None
    df = df[KEEP_COLUMNS]
    df = df.sort_values(by="label")
    deduped = 0

    non_english = 0
    if not args.keep_non_english:
        before_lang = len(df)
        mask = df.apply(
            lambda r: lang_filter.is_probably_english(
                str(r.get("title", "") or ""),
                str(r.get("channelName", "") or ""),
            ),
            axis=1,
        )
        df = df[mask].reset_index(drop=True)
        non_english = before_lang - len(df)

    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    csv_path = PROCESSED_DIR / args.filename
    df.to_csv(csv_path, index=False, encoding="utf-8")
    jsonl_path = csv_path.with_suffix(".jsonl")
    with jsonl_path.open("w", encoding="utf-8") as fh:
        for _, row in df.iterrows():
            json.dump(row.to_dict(), fh, ensure_ascii=False)
            fh.write("\n")

    print(f"\nBuilt {rel(csv_path)}")
    print(f"  rows: {len(df)} (deduped {deduped} cross-source/duplicate videoIds, "
          f"dropped {non_english} non-English)")
    n1 = int((df['label'] == 1).sum())
    n0 = int((df['label'] == 0).sum())
    print(f"  labels: educational(1)={n1}  non-educational(0)={n0}")
    print("  by source:")
    for src, count in df["label_source"].value_counts().items():
        print(f"    {src}: {count}")


if __name__ == "__main__":
    main()
