from dotenv import load_dotenv
import os

# Google auth stuff
from googleapiclient.discovery import build


scopes = ["https://www.googleapis.com/auth/youtube.readonly"]

load_dotenv()  # take environment variables

YOUTUBE_API_KEY = os.environ.get("YOUTUBE_API_KEY")

if not YOUTUBE_API_KEY:
    raise RuntimeError("Set YOUTUBE_API_KEY in your .env")

# this is essentially a helper/wrapper function that just returns the line googleapiclient.discovery.build("youtube", "v3", developerKey=…)
# it spins up a “YouTube service” object that knows how to call any of the v3 API endpoints (videos.list, search.list, videoCategories.list, etc.).
def get_youtube_client():
    return build("youtube", "v3", developerKey=YOUTUBE_API_KEY)

# ------------------------------------------------
# category mapping
# ------------------------------------------------
# get all possible categories (from `videoCategories.list`) as numbers

def category_mapping(region_code="US"):
    """
    category_mapping(region_code) maps YouTube category IDs to their human-readable titles
    Used instead of a constant dict as there's a chance that YouTube categories change
    example output: {'1': 'Film & Animation', '2': 'Autos & Vehicles', ...}
    """
    yt = get_youtube_client()

    response = yt.videoCategories().list(
        part="snippet",
        regionCode=region_code
    ).execute()

    # put into dict
    return {
        item["id"]: item["snippet"]["title"]
        for item in response.get("items", [])
    }

def fetch_video_metadata(video_ids):
    """
    fetch_video_metadata(video_ids) consumes a list filled with video ids and returns a list of dicts
    with title, description & categoryId.
    """
    yt = get_youtube_client()
    resp = yt.videos().list(
        part="snippet",
        id=",".join(video_ids)
    ).execute()

    # TODO: batch in groups of 50, calling this endpoint: `videos.list?part=snippet`

    vids = []
    for item in resp.get("items", []):
        snip = item["snippet"]
        vids.append({
            "id": item["id"],
            "title": snip["title"],
            "description": snip["description"],
            "categoryId": snip["categoryId"],
        })
    return vids

def main():
    # category map
    categories = category_mapping(region_code="US")
    print("Loaded categories: ", categories)

    # TODO: extract lists from positive (educational) and negative (non-educational) video_ids.txt files

    ids = ["6dTyOl1fmDo"]

    # pull metadata

    vids = fetch_video_metadata(ids)
    for v in vids:
        # get the category. fallback is "Unknown"
        cur_category = categories.get(v["categoryId"], "Unknown")

        # TODO: write to CSV file for dataset

        print(f"{v['id']}: {v['title']} [{cur_category}]")

if __name__ == "__main__":
    main()