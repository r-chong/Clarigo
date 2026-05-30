"""Copy the browser model + classifier from `ml/js_model/` into the extension
bundle at `extension/model/`.

`ml/js_model/` is the source of truth produced by `model_to_js_converter.py`
(model JSON) plus the hand-written `clarigo_classifier.js`. The extension can
only load files inside `extension/`, so this step mirrors them across.

Run after every retrain/convert:
    python ml/scripts/model_to_js_converter.py
    python ml/scripts/copy_model_to_extension.py
"""

from __future__ import annotations

import shutil
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
SRC_DIR = REPO_ROOT / "ml" / "js_model"
DST_DIR = REPO_ROOT / "extension" / "model"

FILES = ["clarigo_model.json", "clarigo_classifier.js"]


def main() -> None:
    DST_DIR.mkdir(parents=True, exist_ok=True)
    for name in FILES:
        src = SRC_DIR / name
        if not src.exists():
            raise SystemExit(
                f"Missing source file: {src}\n"
                "Run `python ml/scripts/model_to_js_converter.py` first."
            )
        dst = DST_DIR / name
        shutil.copyfile(src, dst)
        size_kb = round(dst.stat().st_size / 1024, 1)
        print(f"copied {name} -> {dst.relative_to(REPO_ROOT)} ({size_kb} KB)")
    print("Extension bundle updated.")


if __name__ == "__main__":
    main()
