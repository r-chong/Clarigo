"""Normalize title/channel text for training.

Matches ``preprocess_text`` in educational_video_classification.ipynb and
``preprocessText`` in extension/model/clarigo_classifier.js so master data,
training, and inference use the same rules.
"""

from __future__ import annotations

import json
import os
import re
import unicodedata

# After lowercasing, keep only ASCII letters, digits, and spaces.
_NON_ALNUM = re.compile(r"[^a-z0-9\s]")
_WHITESPACE = re.compile(r"\s+")


def clean_text(text) -> str:
    """NFKC normalize, lowercase, strip non-alphanumeric, collapse whitespace."""
    if text is None:
        return ""
    text = unicodedata.normalize("NFKC", str(text))
    text = text.lower()
    text = _NON_ALNUM.sub(" ", text)
    return _WHITESPACE.sub(" ", text).strip()


def process_single_file(
    input_file_path,
    output_file_path,
    channel_key: str = "channelName",
    title_key: str = "title",
) -> None:
    """Clean title and channelName for each JSONL record."""
    basename = os.path.basename(input_file_path)
    print(f"Normalizing {basename}...")
    with open(input_file_path, encoding="utf-8") as infile, open(
        output_file_path, "w", encoding="utf-8"
    ) as outfile:
        for idx, line in enumerate(infile, 1):
            try:
                obj = json.loads(line)
            except json.JSONDecodeError as e:
                print(f"Skipping invalid JSON on line {idx}: {e}")
                continue
            if channel_key in obj:
                obj[channel_key] = clean_text(obj[channel_key])
            if title_key in obj:
                obj[title_key] = clean_text(obj[title_key])
            outfile.write(json.dumps(obj, ensure_ascii=False) + "\n")
    print(f"  -> {os.path.basename(output_file_path)}")


def process_all_labeled_data() -> None:
    """Process all JSONL files in labeled_data/ into data/normalized/."""
    ml_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    labeled_data_dir = os.path.join(ml_root, "data", "labeled_data")
    normalized_dir = os.path.join(ml_root, "data", "normalized")
    os.makedirs(normalized_dir, exist_ok=True)

    jsonl_files = [f for f in os.listdir(labeled_data_dir) if f.endswith(".jsonl")]
    if not jsonl_files:
        print("No JSONL files found in labeled_data directory.")
        return

    print(f"Found {len(jsonl_files)} JSONL files to process:")
    for file in jsonl_files:
        print(f"  - {file}")
    print()

    for filename in jsonl_files:
        process_single_file(
            os.path.join(labeled_data_dir, filename),
            os.path.join(normalized_dir, filename),
        )

    print(f"\nProcessing complete! All files saved to: {normalized_dir}")


if __name__ == "__main__":
    process_all_labeled_data()
