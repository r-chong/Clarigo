"""Train/serve parity test: scikit-learn pipeline vs. the in-browser JS classifier.

This guards against silent train/serve skew. It feeds identical (title, channel)
pairs through:
  1. the trained scikit-learn pipeline (`*.joblib`) -- the source of truth, and
  2. the shipped `clarigo_classifier.js` (run under Node via parity_runner.mjs),
then asserts the predicted probabilities agree within tolerance.

Run after any change to feature engineering, the converter, or the JS classifier:
    python ml/scripts/parity_test.py

Requires Node.js on PATH (for the JS side).
"""

from __future__ import annotations

import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path

import joblib
import pandas as pd

REPO_ROOT = Path(__file__).resolve().parents[2]
MODEL_JOBLIB = REPO_ROOT / "ml" / "trained_models" / "educational_video_classifier.joblib"
RUNNER = REPO_ROOT / "ml" / "scripts" / "parity_runner.mjs"

# Tolerance on educational-probability agreement. The JS TF-IDF tokenizes by
# splitting on spaces while scikit-learn uses a regex token_pattern; for clean
# alphanumeric metadata these agree to well within this bound.
PROB_TOL = 1e-6

# Keep in sync with the notebook + model_to_js_converter.py.
EDUCATIONAL_KEYWORDS = [
    "tutorial", "lesson", "learn", "course", "education", "teach", "how to",
    "explained", "guide", "training", "study", "lecture", "class", "exam",
    "homework", "university", "school", "college", "academic", "research",
    "science", "math", "physics", "chemistry", "biology", "history",
    "programming", "coding", "python", "javascript", "computer", "technology",
]

# (title, channel) pairs. Includes the keyword-in-both-fields case that the old
# JS implementation got wrong (e.g. "python" in title AND channel -> counts 2).
SAMPLES = [
    ("Python Programming Tutorial for Beginners", "CodeWithMosh"),
    ("Funny Cat Compilation 2024", "LOL Pets"),
    ("Introduction to Calculus - Limits Explained", "Khan Academy"),
    ("MrBeast $1,000,000 Challenge!!!", "MrBeast"),
    ("Learn Python Fast", "Python Programming"),  # keyword in title AND channel
    ("The History of Ancient Rome Documentary", "CrashCourse"),
    ("Minecraft Speedrun World Record", "Dream"),
    ("Linear Algebra Lecture 1: Vectors", "MIT OpenCourseWare"),
    ("Top 10 Pranks Gone Wrong", "PrankZone"),
    ("How to Solve Quadratic Equations Step by Step", "Math Antics"),
]


def preprocess_text(text: str) -> str:
    """Mirror of the notebook's preprocess_text()."""
    if text is None:
        return ""
    text = str(text).lower()
    text = re.sub(r"[^a-zA-Z0-9\s]", " ", text)
    return " ".join(text.split())


def count_keywords(text: str) -> int:
    return sum(1 for kw in EDUCATIONAL_KEYWORDS if kw in text)


def build_features(title: str, channel: str) -> dict:
    title_clean = preprocess_text(title)
    channel_clean = preprocess_text(channel)
    return {
        "combined_text": f"{title_clean} {channel_clean}",
        "title_word_count": len(title_clean.split()),
        "channel_word_count": len(channel_clean.split()),
        "title_char_count": len(title_clean),
        "channel_char_count": len(channel_clean),
        "edu_keywords_total": count_keywords(title_clean) + count_keywords(channel_clean),
    }


def sklearn_probabilities(pipeline) -> list[float]:
    rows = [build_features(t, c) for t, c in SAMPLES]
    frame = pd.DataFrame(rows)
    proba = pipeline.predict_proba(frame)[:, 1]
    return [float(p) for p in proba]


def js_results() -> list[dict]:
    inputs = [{"title": t, "channelName": c} for t, c in SAMPLES]
    with tempfile.NamedTemporaryFile(
        "w", suffix=".json", delete=False, encoding="utf-8"
    ) as fh:
        json.dump(inputs, fh)
        inputs_path = fh.name
    try:
        out = subprocess.run(
            ["node", str(RUNNER), inputs_path],
            capture_output=True, text=True, check=True,
        )
    except FileNotFoundError:
        sys.exit("Node.js not found on PATH. Install Node to run the parity test.")
    except subprocess.CalledProcessError as exc:
        sys.exit(f"JS runner failed:\n{exc.stderr}")
    finally:
        Path(inputs_path).unlink(missing_ok=True)
    return json.loads(out.stdout)


def main() -> None:
    if not MODEL_JOBLIB.exists():
        sys.exit(f"Trained model not found: {MODEL_JOBLIB}")

    pipeline = joblib.load(MODEL_JOBLIB)
    py_probs = sklearn_probabilities(pipeline)
    js = js_results()

    print(f"{'title':45.45} | {'py_prob':>8} | {'js_prob':>8} | {'diff':>9} | ok")
    print("-" * 90)

    failures = 0
    for (title, _channel), py_p, js_r in zip(SAMPLES, py_probs, js):
        js_p = js_r["probability"]
        diff = abs(py_p - js_p)
        ok = diff <= PROB_TOL and (py_p >= 0.5) == (js_r["prediction"] == 1)
        if not ok:
            failures += 1
        print(f"{title:45.45} | {py_p:8.4f} | {js_p:8.4f} | {diff:9.2e} | {'OK' if ok else 'FAIL'}")

    print("-" * 90)
    if failures:
        sys.exit(f"PARITY FAILED: {failures}/{len(SAMPLES)} samples exceed tolerance {PROB_TOL:.0e}")
    print(f"PARITY OK: all {len(SAMPLES)} samples agree within {PROB_TOL:.0e}")


if __name__ == "__main__":
    main()
