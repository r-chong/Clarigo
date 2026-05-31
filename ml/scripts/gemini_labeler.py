"""Auto-label scraped videos with Google Gemini under the versioned definition.

This is the AUTHORITATIVE (but still "silver") labeling path. It reads the
broad-educational definition from ml/labeling/label_definition.md, asks Gemini
to classify each video by title + channel (+ description when present), and
writes labeled records with full provenance so labels are traceable and the
data can be re-labeled later under a new definition WITHOUT re-scraping:

    label            -> 0 / 1
    label_source     -> "gemini:<model>"
    label_version    -> parsed from label_definition.md (e.g. "broad-v1")
    label_confidence -> 0..1 from the model
    label_reason     -> short rationale

Low-confidence records (below --threshold) are ALSO written to a review queue
for a human to check, instead of being trusted blindly.

The run is resumable: videoIds already present in the output are skipped, so
re-running only labels new items (and won't re-spend on the API).

Setup:
    1. pip install google-genai   (already in requirements.txt)
    2. Put your key in .env at the repo root:  GEMINI_API_KEY=...
    3. Optionally set GEMINI_MODEL (default below); override per-run with --model.

Usage (from repo root):
    python ml/scripts/gemini_labeler.py --dry-run            # preview the prompt, no API call
    python ml/scripts/gemini_labeler.py --limit 50           # label a small sample first
    python ml/scripts/gemini_labeler.py                      # label everything new
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
RAW_DIR = REPO_ROOT / "ml" / "data" / "raw_data"
LABELED_DIR = REPO_ROOT / "ml" / "data" / "labeled_data"
REVIEW_DIR = REPO_ROOT / "ml" / "data" / "review_queue"
DEFINITION_PATH = REPO_ROOT / "ml" / "labeling" / "label_definition.md"

DEFAULT_MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")
DEFAULT_THRESHOLD = 0.7
DEFAULT_BATCH_SIZE = 20


def rel(path: Path) -> str:
    try:
        return str(path.resolve().relative_to(REPO_ROOT))
    except ValueError:
        return str(path)


def load_env_key(name: str = "GEMINI_API_KEY") -> str | None:
    if os.environ.get(name):
        return os.environ[name]
    env_path = REPO_ROOT / ".env"
    if env_path.exists():
        for line in env_path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            if key.strip() == name:
                return value.strip().strip('"').strip("'")
    return None


def parse_label_version(definition_text: str) -> str:
    match = re.search(r"LABEL_VERSION:\s*([^\s]+)", definition_text)
    if match:
        return match.group(1)
    match = re.search(r"\*\*Version:\*\*\s*`([^`]+)`", definition_text)
    return match.group(1) if match else "unknown"


def read_records(paths: list[Path]):
    for path in paths:
        for line in path.read_text(encoding="utf-8-sig").splitlines():
            line = line.strip().lstrip("\ufeff")
            if line:
                try:
                    yield json.loads(line)
                except json.JSONDecodeError:
                    continue


def existing_video_ids(out_path: Path) -> set[str]:
    seen: set[str] = set()
    if out_path.exists():
        for line in out_path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line:
                try:
                    seen.add(json.loads(line).get("videoId", ""))
                except json.JSONDecodeError:
                    continue
    return seen


def build_prompt(definition_text: str, batch: list[dict]) -> str:
    items = []
    for i, rec in enumerate(batch):
        desc = (rec.get("description") or "")[:300]
        items.append({
            "index": i,
            "title": rec.get("title", ""),
            "channel": rec.get("channelName", ""),
            "description": desc,
        })
    return (
        f"{definition_text}\n\n"
        "----\n"
        "Classify EACH item below using the definition above. Respond with ONLY "
        "a JSON array, one object per item, each shaped exactly:\n"
        '{"index": <int>, "label": 0 or 1, "confidence": <float 0..1>, '
        '"reason": "<short clause>"}\n'
        "Do not include any text outside the JSON array.\n\n"
        f"ITEMS:\n{json.dumps(items, ensure_ascii=False, indent=2)}"
    )


def parse_response(text: str) -> list[dict]:
    text = text.strip()
    # Strip markdown fences if the model added them.
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text, flags=re.DOTALL)
    return json.loads(text)


def label_batch(client, model: str, definition_text: str, batch: list[dict]) -> list[dict]:
    prompt = build_prompt(definition_text, batch)
    resp = client.models.generate_content(
        model=model,
        contents=prompt,
        config={"response_mime_type": "application/json", "temperature": 0},
    )
    parsed = parse_response(resp.text)
    by_index = {int(p["index"]): p for p in parsed if "index" in p}
    results = []
    for i, _rec in enumerate(batch):
        p = by_index.get(i, {})
        results.append({
            "label": int(p["label"]) if "label" in p else None,
            "confidence": float(p.get("confidence", 0.0)),
            "reason": str(p.get("reason", "")),
        })
    return results


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--in", dest="inputs", nargs="*", default=None,
                        help="Input JSONL file(s). Default: all ml/data/raw_data/api_*.jsonl")
    parser.add_argument("--out", type=Path, default=LABELED_DIR / "gemini_labeled.jsonl")
    parser.add_argument("--review-out", type=Path,
                        default=REVIEW_DIR / "gemini_low_confidence.jsonl")
    parser.add_argument("--model", default=DEFAULT_MODEL)
    parser.add_argument("--threshold", type=float, default=DEFAULT_THRESHOLD,
                        help="Confidence below this is routed to the review queue.")
    parser.add_argument("--batch-size", type=int, default=DEFAULT_BATCH_SIZE)
    parser.add_argument("--limit", type=int, default=None,
                        help="Only label up to N new records (cost control / testing).")
    parser.add_argument("--dry-run", action="store_true",
                        help="Print the prompt for the first batch and exit (no API call).")
    args = parser.parse_args()

    if not DEFINITION_PATH.exists():
        sys.exit(f"Label definition not found: {rel(DEFINITION_PATH)}")
    definition_text = DEFINITION_PATH.read_text(encoding="utf-8")
    label_version = parse_label_version(definition_text)

    paths = ([Path(p) for p in args.inputs] if args.inputs
             else sorted(RAW_DIR.glob("api_*.jsonl")))
    paths = [p for p in paths if p.exists()]
    if not paths:
        sys.exit(f"No input files found (looked in {rel(RAW_DIR)}). Run the scraper first.")

    already = existing_video_ids(args.out)
    todo: list[dict] = []
    for rec in read_records(paths):
        vid = rec.get("videoId", "")
        if vid and vid in already:
            continue
        todo.append(rec)
        if args.limit and len(todo) >= args.limit:
            break

    if not todo:
        print("Nothing new to label (all input videoIds already in output).")
        return

    if args.dry_run:
        print(f"[dry-run] label_version={label_version} model={args.model} "
              f"threshold={args.threshold}")
        print(f"[dry-run] {len(todo)} records would be labeled. Prompt for first batch:\n")
        print(build_prompt(definition_text, todo[: args.batch_size]))
        return

    api_key = load_env_key()
    if not api_key:
        sys.exit("Missing GEMINI_API_KEY (set it in .env at the repo root or as an env var).")
    try:
        from google import genai
    except ImportError:
        sys.exit("google-genai not installed. Run: pip install google-genai")
    client = genai.Client(api_key=api_key)

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.review_out.parent.mkdir(parents=True, exist_ok=True)

    labeled_count, review_count, failed = 0, 0, 0
    with args.out.open("a", encoding="utf-8") as out_fh, \
            args.review_out.open("a", encoding="utf-8") as review_fh:
        for start in range(0, len(todo), args.batch_size):
            batch = todo[start: start + args.batch_size]
            try:
                results = label_batch(client, args.model, definition_text, batch)
            except Exception as exc:  # noqa: BLE001 - keep going across batches
                failed += len(batch)
                print(f"  batch {start}-{start + len(batch)} failed: {exc}", file=sys.stderr)
                continue

            for rec, res in zip(batch, results):
                if res["label"] is None:
                    failed += 1
                    continue
                out_rec = {
                    "videoId": rec.get("videoId", ""),
                    "title": rec.get("title", ""),
                    "channelName": rec.get("channelName", ""),
                    "channelUrl": rec.get("channelUrl", ""),
                    "videoUrl": rec.get("videoUrl", ""),
                    "categoryId": rec.get("categoryId"),
                    "label": res["label"],
                    "label_source": f"gemini:{args.model}",
                    "label_version": label_version,
                    "label_confidence": round(res["confidence"], 4),
                    "label_reason": res["reason"],
                }
                out_fh.write(json.dumps(out_rec, ensure_ascii=False) + "\n")
                labeled_count += 1
                if res["confidence"] < args.threshold:
                    review_fh.write(json.dumps(out_rec, ensure_ascii=False) + "\n")
                    review_count += 1
            print(f"  labeled {min(start + args.batch_size, len(todo))}/{len(todo)}")
            time.sleep(0.2)  # be gentle on rate limits

    print(f"\nDone. Labeled {labeled_count} (version {label_version}); "
          f"{review_count} flagged for review; {failed} failed.")
    print(f"  labels -> {rel(args.out)}")
    print(f"  review -> {rel(args.review_out)}")
    print("Next: build the broad-v1 dataset (normalizes + merges with precedence):")
    print("  python ml/scripts/build_broad_dataset.py")


if __name__ == "__main__":
    main()
