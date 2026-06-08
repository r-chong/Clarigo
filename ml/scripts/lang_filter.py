"""Lightweight English-vs-not filtering for video metadata.

Why this exists: the scraper's `regionCode` is geographic, not linguistic, so a
US search still returns plenty of non-English videos. An English title/channel
TF-IDF model gains nothing from them, so we discard them at intake and again when
building the training set.

What it catches (and what it doesn't):
  * RELIABLY drops non-Latin scripts: CJK, Cyrillic, Arabic, Devanagari,
    Hangul, Hiragana/Katakana, Thai, Hebrew, Greek, etc. This is the "simple
    non-English character" check.
  * Does NOT catch Latin-script languages (Spanish, French, Portuguese, German).
    A character check can't distinguish those from English. Catching them needs
    real language identification (e.g. fastText/langdetect) — a future upgrade.

Signals, in priority order:
  1. An explicit YouTube language tag (`defaultAudioLanguage` / `defaultLanguage`),
     when present, is authoritative: keep iff it starts with "en".
  2. Otherwise, fall back to a script heuristic on title + channel: reject when
     the share of non-Latin alphabetic characters exceeds `max_non_latin_ratio`.

Can be run directly to AUDIT an existing file without modifying it:
    python ml/scripts/lang_filter.py ml/data/raw_data/api_27-28_2026-05-31.jsonl
    python ml/scripts/lang_filter.py ml/data/processed_data/master_broad_v1.csv
"""

from __future__ import annotations

import unicodedata

DEFAULT_MAX_NON_LATIN_RATIO = 0.20


def _script_of(ch: str) -> str | None:
    """Return the Unicode script family of an alphabetic char, else None.

    Uses the character's Unicode name prefix, e.g. "LATIN", "CYRILLIC", "CJK",
    "HIRAGANA", "ARABIC", "DEVANAGARI", "HANGUL". Non-letters return None so
    digits, punctuation, spaces and emoji don't affect the ratio.
    """
    if not ch.isalpha():
        return None
    try:
        name = unicodedata.name(ch)
    except ValueError:
        return "OTHER"
    return name.split(" ", 1)[0]


def non_latin_ratio(text: str) -> float:
    """Fraction of alphabetic characters that are NOT Latin script (0.0–1.0).

    Accented Latin (é, ñ, ü, ç) counts as Latin, so ordinary English/European
    spellings are not penalized.
    """
    latin = 0
    non_latin = 0
    for ch in text:
        script = _script_of(ch)
        if script is None:
            continue
        if script == "LATIN":
            latin += 1
        else:
            non_latin += 1
    total = latin + non_latin
    return non_latin / total if total else 0.0


def is_probably_english(
    title: str = "",
    channel: str = "",
    *,
    default_language: str = "",
    default_audio_language: str = "",
    max_non_latin_ratio: float = DEFAULT_MAX_NON_LATIN_RATIO,
) -> bool:
    """Best-effort English check. Conservative: when unsure, keeps the row."""
    # 1) Trust an explicit language tag if the video declares one.
    for lang in (default_audio_language, default_language):
        if lang:
            return lang.strip().lower().startswith("en")

    # 2) Otherwise judge by script. Title is the most reliable field; channel
    #    name adds a little signal. Nothing to judge -> don't drop.
    text = f"{title or ''} {channel or ''}".strip()
    if not text:
        return True
    return non_latin_ratio(text) <= max_non_latin_ratio


def _safe(text: str) -> str:
    """Make text printable on consoles with a limited codec (e.g. Windows cp1252)."""
    import sys

    enc = sys.stdout.encoding or "utf-8"
    return str(text).encode(enc, errors="replace").decode(enc, errors="replace")


def _audit(path: str) -> None:
    """Print how many records the filter would drop, with a few examples."""
    import csv
    import json
    from pathlib import Path

    p = Path(path)
    rows: list[dict] = []
    if p.suffix.lower() == ".csv":
        with p.open(encoding="utf-8-sig", newline="") as fh:
            rows = list(csv.DictReader(fh))
    else:
        for line in p.read_text(encoding="utf-8-sig").splitlines():
            line = line.strip().lstrip("\ufeff")
            if line:
                try:
                    rows.append(json.loads(line))
                except json.JSONDecodeError:
                    continue

    dropped = []
    for r in rows:
        ok = is_probably_english(
            r.get("title", ""),
            r.get("channelName", "") or r.get("channel", ""),
            default_language=r.get("defaultLanguage", "") or "",
            default_audio_language=r.get("defaultAudioLanguage", "") or "",
        )
        if not ok:
            dropped.append(r.get("title", ""))

    total = len(rows)
    print(f"{path}")
    print(f"  records: {total}")
    print(f"  would drop as non-English: {len(dropped)} "
          f"({(len(dropped) / total * 100 if total else 0):.1f}%)")
    for title in dropped[:15]:
        print(f"    - {_safe(title)}")
    if len(dropped) > 15:
        print(f"    ... and {len(dropped) - 15} more")


if __name__ == "__main__":
    import sys

    if len(sys.argv) < 2:
        sys.exit("Usage: python ml/scripts/lang_filter.py <file.jsonl|file.csv> [...]")
    for arg in sys.argv[1:]:
        _audit(arg)
