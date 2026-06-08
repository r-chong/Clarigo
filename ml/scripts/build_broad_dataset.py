"""Build a SEPARATE broad-v1 master dataset from the new API-scraped labels.

Kept deliberately separate from the legacy `master_dataset.csv` (which was
hand-labeled under the older STEM-strict definition) so we never mix two label
definitions in one training set.

Default behaviour (append mode):
  1. Load the existing master_broad_v1.jsonl if present (keeps current rows).
  2. Append rows from labeled sources, adding only videoIds not already present.
     Order: api_category_labeled.jsonl, then gemini_labeled.jsonl.
  3. Normalize title/channelName via labeling_processor for newly appended rows.

Use --rebuild to discard the existing master and merge from --inputs with
precedence instead (first source wins on duplicate videoIds; default order is
gemini > category).

It does NOT touch master_dataset.csv or ml/data/normalized/.

Usage (from repo root):
    python ml/scripts/build_broad_dataset.py
    python ml/scripts/build_broad_dataset.py --append ml/data/labeled_data/gemini_labeled.jsonl
    python ml/scripts/build_broad_dataset.py --rebuild
    python ml/scripts/build_broad_dataset.py --rebuild --inputs ml/data/labeled_data/gemini_labeled.jsonl ml/data/labeled_data/api_category_labeled.jsonl
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

# Used by --rebuild only (precedence: first source wins on duplicate videoIds).
REBUILD_INPUTS = [
    LABELED_DIR / "gemini_labeled.jsonl",
    LABELED_DIR / "api_category_labeled.jsonl",
]

# Default append sources (append mode): existing rows are kept; these add new ids.
DEFAULT_APPEND = [
    LABELED_DIR / "api_category_labeled.jsonl",
    LABELED_DIR / "gemini_labeled.jsonl",
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


def master_jsonl_path(filename: str) -> Path:
    return PROCESSED_DIR / Path(filename).with_suffix(".jsonl").name


def normalize_labeled(src: Path) -> Path:
    """Normalize one labeled file into NORMALIZED_DIR; return normalized path."""
    NORMALIZED_DIR.mkdir(parents=True, exist_ok=True)
    dst = NORMALIZED_DIR / src.name
    labeling_processor.process_single_file(str(src), str(dst))
    return dst


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


def load_base(path: Path) -> list[dict]:
    if path.suffix.lower() == ".csv":
        return pd.read_csv(path).to_dict(orient="records")
    return load_jsonl(path)


def append_labeled(rows: list[dict], sources: list[Path]) -> tuple[int, int]:
    """Append rows from sources; skip videoIds already in rows. Returns appended, skipped."""
    seen = {r.get("videoId", "") for r in rows if r.get("videoId")}
    appended, skipped = 0, 0
    for src in sources:
        normalized = normalize_labeled(src)
        for row in load_jsonl(normalized):
            vid = row.get("videoId", "")
            if not vid or vid in seen:
                skipped += 1
                continue
            seen.add(vid)
            rows.append(row)
            appended += 1
    return appended, skipped


def merge_precedence(sources: list[Path]) -> list[dict]:
    """Merge labeled sources; first occurrence of each videoId wins."""
    normalized = [normalize_labeled(src) for src in sources]
    seen: set[str] = set()
    rows: list[dict] = []
    deduped = 0
    for path in normalized:
        for row in load_jsonl(path):
            vid = row.get("videoId", "")
            if vid and vid in seen:
                deduped += 1
                continue
            if vid:
                seen.add(vid)
            rows.append(row)
    if deduped:
        print(f"  deduped {deduped} duplicate videoIds among inputs")
    return rows


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--rebuild", action="store_true",
                        help="Ignore existing master; merge --inputs with precedence "
                             "(first source wins). Default inputs: gemini then category.")
    parser.add_argument("--inputs", nargs="*", type=Path, default=None,
                        help="Labeled JSONL files for --rebuild (precedence order).")
    parser.add_argument("--base", type=Path, default=None,
                        help="Existing master JSONL/CSV to keep. Default: master_broad_v1.jsonl "
                             "if it exists.")
    parser.add_argument("--append", nargs="*", type=Path, default=None,
                        help="Labeled JSONL file(s) to append (new videoIds only). "
                             "Default: api_category_labeled.jsonl then gemini_labeled.jsonl.")
    parser.add_argument("--filename", default="master_broad_v1.csv",
                        help="Output CSV filename in ml/data/processed_data/.")
    parser.add_argument("--keep-non-english", action="store_true",
                        help="Do NOT drop rows that look non-English "
                             "(default: drop them via lang_filter, title+channel).")
    args = parser.parse_args()

    if args.rebuild:
        inputs = args.inputs if args.inputs else REBUILD_INPUTS
        inputs = [p for p in inputs if p.exists()]
        if not inputs:
            sys.exit("No input files found for --rebuild.")
        print("Rebuild (precedence high -> low):")
        for p in inputs:
            print(f"  {rel(p)}")
        rows = merge_precedence(inputs)
        if not rows:
            sys.exit("No records loaded after normalization.")
    else:
        base_path = args.base
        if base_path is None:
            default_master = master_jsonl_path(args.filename)
            base_path = default_master if default_master.exists() else None

        rows: list[dict] = []
        if base_path is not None:
            if not base_path.exists():
                sys.exit(f"Base file not found: {rel(base_path)}")
            rows = load_base(base_path)
            print(f"Base: {rel(base_path)} ({len(rows)} rows)")
        else:
            print("Base: (none — starting empty master)")

        append_paths = (
            [p for p in args.append if p.exists()]
            if args.append is not None
            else [p for p in DEFAULT_APPEND if p.exists()]
        )
        if not append_paths:
            if not rows:
                sys.exit("No broad-label input files found. Run apply_category_labels.py "
                         "and/or gemini_labeler.py first.")
        else:
            print("Append (new videoIds only):")
            for p in append_paths:
                print(f"  {rel(p)}")
            appended, skipped = append_labeled(rows, append_paths)
            print(f"  appended {appended} rows, skipped {skipped} (already in base)")

    if not rows:
        sys.exit("No records to write.")

    df = pd.DataFrame(rows)
    for col in KEEP_COLUMNS:
        if col not in df.columns:
            df[col] = None
    df = df[KEEP_COLUMNS]
    df = df.sort_values(by="label")

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
    print(f"  rows: {len(df)} (dropped {non_english} non-English)")
    n1 = int((df["label"] == 1).sum())
    n0 = int((df["label"] == 0).sum())
    print(f"  labels: educational(1)={n1}  non-educational(0)={n0}")
    print("  by source:")
    for src, count in df["label_source"].value_counts().items():
        print(f"    {src}: {count}")


if __name__ == "__main__":
    main()
