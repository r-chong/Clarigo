"""Assign weak labels to scraped raw videos using their category hint.

This is the FAST path: it turns `category_label_hint` (set by the scraper from
the YouTube category a video came from) into an authoritative-shaped label so
you can build a large training set immediately, without paying for LLM calls.

These labels are weak/noisy by design. Provenance is stamped so you can later
re-label the same raw videos with the Gemini labeler (or humans) and tell the
sources apart:
    label_source  = "category"
    label_version = "cat-v1"
    label_confidence = 0.6   (a fixed, modest weak-supervision confidence)

Records whose hint is null (unknown category) are skipped.

Usage (from repo root):
    python ml/scripts/apply_category_labels.py
    python ml/scripts/apply_category_labels.py --in ml/data/raw_data/api_27-28_2026-05-31.jsonl
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
RAW_DIR = REPO_ROOT / "ml" / "data" / "raw_data"
LABELED_DIR = REPO_ROOT / "ml" / "data" / "labeled_data"


def rel(path: Path) -> str:
    """Repo-relative path for display, falling back to absolute."""
    try:
        return str(path.resolve().relative_to(REPO_ROOT))
    except ValueError:
        return str(path)

LABEL_SOURCE = "category"
LABEL_VERSION = "cat-v1"
WEAK_CONFIDENCE = 0.6


def iter_records(paths: list[Path]):
    for path in paths:
        for line in path.read_text(encoding="utf-8-sig").splitlines():
            line = line.strip().lstrip("\ufeff")
            if not line:
                continue
            try:
                yield json.loads(line)
            except json.JSONDecodeError:
                continue


def to_labeled(rec: dict) -> dict | None:
    hint = rec.get("category_label_hint")
    if hint is None:
        return None
    return {
        "videoId": rec.get("videoId", ""),
        "title": rec.get("title", ""),
        "channelName": rec.get("channelName", ""),
        "channelUrl": rec.get("channelUrl", ""),
        "videoUrl": rec.get("videoUrl", ""),
        "categoryId": rec.get("categoryId"),
        "label": int(hint),
        "label_source": LABEL_SOURCE,
        "label_version": LABEL_VERSION,
        "label_confidence": WEAK_CONFIDENCE,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--in", dest="inputs", nargs="*", default=None,
                        help="Raw JSONL file(s). Default: all ml/data/raw_data/api_*.jsonl")
    parser.add_argument("--out", type=Path,
                        default=LABELED_DIR / "api_category_labeled.jsonl",
                        help="Output labeled JSONL path.")
    args = parser.parse_args()

    if args.inputs:
        paths = [Path(p) for p in args.inputs]
    else:
        paths = sorted(RAW_DIR.glob("api_*.jsonl"))
    paths = [p for p in paths if p.exists()]
    if not paths:
        raise SystemExit(f"No raw API files found. Run the scraper first (looked in {RAW_DIR}).")

    args.out.parent.mkdir(parents=True, exist_ok=True)
    seen: set[str] = set()
    kept, skipped = 0, 0
    with args.out.open("w", encoding="utf-8") as fh:
        for rec in iter_records(paths):
            labeled = to_labeled(rec)
            if labeled is None:
                skipped += 1
                continue
            vid = labeled["videoId"]
            if vid and vid in seen:
                continue
            seen.add(vid)
            fh.write(json.dumps(labeled, ensure_ascii=False) + "\n")
            kept += 1

    print(f"Wrote {kept} labeled records ({skipped} skipped: no category hint) "
          f"-> {rel(args.out)}")
    print("Next: build the broad-v1 dataset (normalizes + merges with precedence):")
    print("  python ml/scripts/build_broad_dataset.py")


if __name__ == "__main__":
    main()
