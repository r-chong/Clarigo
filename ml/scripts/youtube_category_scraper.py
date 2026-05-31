"""Scrape YouTube video metadata by category via the YouTube Data API v3.

Finds videos in one or more category IDs (via search.list) and hydrates full
metadata (via videos.list), writing RICH, IMMUTABLE raw records to
ml/data/raw_data/. Each record keeps everything we might want later
(description, tags, stats, categoryId) so the data can be RE-LABELED under a
future label definition without re-scraping.

Why search + hydrate (not chart=mostPopular)? The mostPopular chart only exists
for some categories (Music/Gaming/Entertainment/Sports). Education (27) and
Science & Technology (28) have NO popular chart and return HTTP 404, so we use
search.list and then videos.list for rich fields.

Why query SEEDS? search.list returns nothing for a `videoCategoryId` unless a
query term `q` is also given. So we sweep a list of seed queries (subjects /
topics) within each category. Using many diverse queries also surfaces many
different channels, which helps the model generalize instead of memorizing a
few channel names. Seed lists live in ml/labeling/seed_queries_*.txt and are
meant to be edited.

Quota note (free 10,000 units/day): search.list costs 100 units per page of 50
results; videos.list costs 1 unit per 50 hydrated. So each seed query (1 page)
costs ~100 units -> ~100 queries/day within the free quota. The YouTube API
charges quota, not money.

Implicit labels: the category a video came from is a weak signal, stored as
`category_label_hint` (1 = likely educational, 0 = likely not, null = unknown).
This is NOT the authoritative label — that is assigned by the labeling layer
(category fast-path or the Gemini labeler) with provenance + version.

Setup:
    1. Get a YouTube Data API v3 key (Google Cloud console).
    2. Put it in a .env at the repo root:  YOUTUBE_API_KEY=...
       (or export it as an environment variable).

Usage (from repo root):
    python ml/scripts/youtube_category_scraper.py --categories 27,28 --max 200
    python ml/scripts/youtube_category_scraper.py --categories 20,24,23 --max 200
    python ml/scripts/youtube_category_scraper.py --categories 27 --dry-run

Common category IDs: 27 Education, 28 Science & Technology, 20 Gaming,
24 Entertainment, 23 Comedy, 22 People & Blogs, 26 Howto & Style, 25 News.
"""

from __future__ import annotations

import argparse
import json
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

import lang_filter

REPO_ROOT = Path(__file__).resolve().parents[2]
RAW_DIR = REPO_ROOT / "ml" / "data" / "raw_data"
LABELING_DIR = REPO_ROOT / "ml" / "labeling"
SEARCH_URL = "https://www.googleapis.com/youtube/v3/search"
VIDEOS_URL = "https://www.googleapis.com/youtube/v3/videos"

# Weak, configurable mapping from category -> implicit label hint. Edit freely;
# this is only a starting signal, not ground truth.
DEFAULT_EDU_CATEGORIES = {27, 28}          # Education, Science & Technology
DEFAULT_NON_EDU_CATEGORIES = {20, 24, 23}  # Gaming, Entertainment, Comedy


def rel(path: Path) -> str:
    """Repo-relative path for display, falling back to absolute."""
    try:
        return str(path.resolve().relative_to(REPO_ROOT))
    except ValueError:
        return str(path)


def load_env_key(name: str = "YOUTUBE_API_KEY") -> str | None:
    """Return the API key from the environment or a repo-root .env file."""
    import os

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


def category_hint(category_id: int, edu: set[int], non_edu: set[int]):
    if category_id in edu:
        return 1
    if category_id in non_edu:
        return 0
    return None


def build_search_url(api_key: str, category_id: int, region: str, order: str,
                     query: str, page_token: str | None,
                     relevance_language: str = "en") -> str:
    params = {
        "part": "snippet",
        "type": "video",
        "q": query,
        "videoCategoryId": str(category_id),
        "regionCode": region,
        "order": order,
        "maxResults": "50",
        "key": api_key,
    }
    # Bias results toward a language (soft, not a hard filter). Empty disables it.
    if relevance_language:
        params["relevanceLanguage"] = relevance_language
    if page_token:
        params["pageToken"] = page_token
    return f"{SEARCH_URL}?{urllib.parse.urlencode(params)}"


def build_videos_url(api_key: str, video_ids: list[str]) -> str:
    params = {
        "part": "snippet,contentDetails,statistics",
        "id": ",".join(video_ids),
        "maxResults": "50",
        "key": api_key,
    }
    return f"{VIDEOS_URL}?{urllib.parse.urlencode(params)}"


def fetch_page(url: str) -> dict:
    req = urllib.request.Request(url, headers={"Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        raise SystemExit(
            f"YouTube API HTTP {exc.code}: {body}\n"
            "Check the key, that the YouTube Data API v3 is enabled, and quota."
        )
    except urllib.error.URLError as exc:
        raise SystemExit(f"Network error reaching YouTube API: {exc.reason}")


def to_record(item: dict, queried_category: int, hint, scraped_at: str) -> dict:
    snippet = item.get("snippet", {})
    stats = item.get("statistics", {})
    content = item.get("contentDetails", {})
    video_id = item.get("id", "")
    channel_id = snippet.get("channelId", "")
    return {
        "videoId": video_id,
        "title": snippet.get("title", ""),
        "channelName": snippet.get("channelTitle", ""),
        "channelId": channel_id,
        "channelUrl": f"https://www.youtube.com/channel/{channel_id}" if channel_id else "",
        "videoUrl": f"https://www.youtube.com/watch?v={video_id}" if video_id else "",
        "description": snippet.get("description", ""),
        "tags": snippet.get("tags", []),
        "categoryId": int(snippet.get("categoryId", queried_category)),
        "queriedCategoryId": queried_category,
        "duration": content.get("duration", ""),
        "viewCount": int(stats["viewCount"]) if stats.get("viewCount") else None,
        "likeCount": int(stats["likeCount"]) if stats.get("likeCount") else None,
        "publishedAt": snippet.get("publishedAt", ""),
        "defaultLanguage": snippet.get("defaultLanguage", ""),
        "defaultAudioLanguage": snippet.get("defaultAudioLanguage", ""),
        "category_label_hint": hint,
        "source": "youtube_api_search",
        "scraped_at": scraped_at,
    }


def search_video_ids(api_key: str, category_id: int, region: str, order: str,
                     query: str, max_results: int, dry_run: bool,
                     relevance_language: str = "en") -> list[str]:
    """Collect up to max_results video IDs for one (category, query) via search.list.

    Note: the Search API caps total results per query at ~500 regardless of
    paging, so very large per-query targets will plateau there.
    """
    ids: list[str] = []
    page_token: str | None = None
    while len(ids) < max_results:
        url = build_search_url(api_key, category_id, region, order, query,
                               page_token, relevance_language)
        if dry_run:
            print(f"[dry-run] SEARCH {url.replace(api_key, '***KEY***')}")
            break
        data = fetch_page(url)
        for item in data.get("items", []):
            vid = item.get("id", {}).get("videoId")
            if vid:
                ids.append(vid)
                if len(ids) >= max_results:
                    break
        page_token = data.get("nextPageToken")
        if not page_token:
            break
    return ids


def hydrate_videos(api_key: str, video_ids: list[str], dry_run: bool) -> list[dict]:
    """Fetch full metadata for video IDs via videos.list (50 at a time)."""
    items: list[dict] = []
    for start in range(0, len(video_ids), 50):
        chunk = video_ids[start: start + 50]
        url = build_videos_url(api_key, chunk)
        if dry_run:
            print(f"[dry-run] VIDEOS {url.replace(api_key, '***KEY***')}")
            continue
        data = fetch_page(url)
        items.extend(data.get("items", []))
    return items


def is_english_record(rec: dict) -> bool:
    return lang_filter.is_probably_english(
        rec.get("title", ""),
        rec.get("channelName", ""),
        default_language=rec.get("defaultLanguage", ""),
        default_audio_language=rec.get("defaultAudioLanguage", ""),
    )


def scrape_category(api_key: str, category_id: int, region: str, order: str,
                    queries: list[str], max_per_query: int, edu: set[int],
                    non_edu: set[int], dry_run: bool,
                    relevance_language: str = "en",
                    keep_non_english: bool = False) -> tuple[list[dict], int]:
    """Return (records, dropped_non_english) for one category."""
    hint = category_hint(category_id, edu, non_edu)
    scraped_at = datetime.now(timezone.utc).isoformat()

    all_ids: list[str] = []
    seen_ids: set[str] = set()
    for query in queries:
        ids = search_video_ids(api_key, category_id, region, order, query,
                               max_per_query, dry_run, relevance_language)
        for vid in ids:
            if vid not in seen_ids:
                seen_ids.add(vid)
                all_ids.append(vid)
        if dry_run:
            break  # one representative SEARCH line is enough

    if dry_run:
        hydrate_videos(api_key, ["VIDEO_ID_1", "VIDEO_ID_2"], dry_run)
        return [], 0

    items = hydrate_videos(api_key, all_ids, dry_run)
    records = [to_record(item, category_id, hint, scraped_at) for item in items]
    if keep_non_english:
        return records, 0
    english = [r for r in records if is_english_record(r)]
    return english, len(records) - len(english)


def load_queries_for(hint, args) -> list[str]:
    """Resolve the seed query list for a category, from --queries, a file, or
    the default education/general seed list based on the category hint."""
    if args.queries:
        return [q.strip() for q in args.queries.split(",") if q.strip()]
    if args.queries_file:
        path = args.queries_file
    else:
        name = "seed_queries_education.txt" if hint == 1 else "seed_queries_general.txt"
        path = LABELING_DIR / name
    if not path.exists():
        raise SystemExit(f"Seed query file not found: {path}. "
                         "Provide --queries or --queries-file.")
    return [line.strip() for line in path.read_text(encoding="utf-8").splitlines()
            if line.strip() and not line.startswith("#")]


def write_records(records: list[dict], out_path: Path) -> int:
    """Append records, de-duplicating by videoId against existing content."""
    out_path.parent.mkdir(parents=True, exist_ok=True)
    seen: set[str] = set()
    if out_path.exists():
        for line in out_path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line:
                try:
                    seen.add(json.loads(line).get("videoId", ""))
                except json.JSONDecodeError:
                    continue
    added = 0
    with out_path.open("a", encoding="utf-8") as fh:
        for rec in records:
            vid = rec.get("videoId", "")
            if vid and vid in seen:
                continue
            seen.add(vid)
            fh.write(json.dumps(rec, ensure_ascii=False) + "\n")
            added += 1
    return added


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--categories", required=True,
                        help="Comma-separated YouTube category IDs, e.g. 27,28")
    parser.add_argument("--region", default="US", help="ISO region code (default US).")
    parser.add_argument("--order", default="viewCount",
                        choices=["relevance", "viewCount", "date", "rating", "title"],
                        help="search.list ordering (default viewCount).")
    parser.add_argument("--queries", default=None,
                        help="Comma-separated seed query terms (overrides --queries-file).")
    parser.add_argument("--queries-file", type=Path, default=None,
                        help="File with one seed query per line. Default depends on the "
                             "category hint: education vs non-education seed list.")
    parser.add_argument("--max-per-query", type=int, default=50,
                        help="Max videos per (category, query) page (default 50 = 1 page).")
    parser.add_argument("--relevance-language", default="en",
                        help="Bias search toward this language (ISO code; default 'en'). "
                             "Pass '' to disable. Soft hint, not a hard filter.")
    parser.add_argument("--keep-non-english", action="store_true",
                        help="Do NOT drop records that look non-English at intake "
                             "(default: drop them via lang_filter).")
    parser.add_argument("--out", type=Path, default=None,
                        help="Output JSONL path (default ml/data/raw_data/api_<cats>_<date>.jsonl).")
    parser.add_argument("--edu-categories", default=None,
                        help="Override edu hint categories (comma-separated).")
    parser.add_argument("--non-edu-categories", default=None,
                        help="Override non-edu hint categories (comma-separated).")
    parser.add_argument("--dry-run", action="store_true",
                        help="Print request URLs without calling the API or writing.")
    args = parser.parse_args()

    categories = [int(c) for c in args.categories.split(",") if c.strip()]
    edu = ({int(c) for c in args.edu_categories.split(",")}
           if args.edu_categories else DEFAULT_EDU_CATEGORIES)
    non_edu = ({int(c) for c in args.non_edu_categories.split(",")}
               if args.non_edu_categories else DEFAULT_NON_EDU_CATEGORIES)

    api_key = None if args.dry_run else load_env_key()
    if not args.dry_run and not api_key:
        sys.exit("Missing YOUTUBE_API_KEY (set it in .env at the repo root or as an env var). "
                 "Use --dry-run to preview requests without a key.")

    if args.out is None:
        stamp = datetime.now().strftime("%Y-%m-%d")
        cats = "-".join(str(c) for c in categories)
        out_path = RAW_DIR / f"api_{cats}_{stamp}.jsonl"
    else:
        out_path = args.out

    total_added = 0
    total_dropped = 0
    for category_id in categories:
        hint = category_hint(category_id, edu, non_edu)
        queries = load_queries_for(hint, args)
        recs, dropped = scrape_category(api_key or "DRYRUN", category_id, args.region,
                                        args.order, queries, args.max_per_query,
                                        edu, non_edu, args.dry_run,
                                        args.relevance_language, args.keep_non_english)
        if args.dry_run:
            continue
        added = write_records(recs, out_path)
        print(f"category {category_id}: {len(queries)} queries, kept {len(recs)} "
              f"(dropped {dropped} non-English), added {added} new "
              f"(hint={hint}) -> {rel(out_path)}")
        total_added += added
        total_dropped += dropped

    if not args.dry_run:
        print(f"\nDone. Added {total_added} new records "
              f"(dropped {total_dropped} non-English) to {rel(out_path)}")
        print("Next: assign labels with")
        print("  python ml/scripts/apply_category_labels.py   (fast, implicit)")
        print("  python ml/scripts/gemini_labeler.py          (LLM, versioned)")


if __name__ == "__main__":
    main()
