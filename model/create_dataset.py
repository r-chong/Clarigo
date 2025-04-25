from dotenv import load_dotenv
import os
import csv
import json

# Google auth stuff
from googleapiclient.discovery import build


scopes = ["https://www.googleapis.com/auth/youtube.readonly"]

load_dotenv()  # take environment variables

YOUTUBE_API_KEY = os.environ.get("YOUTUBE_API_KEY")

if not YOUTUBE_API_KEY:
    raise RuntimeError("Set YOUTUBE_API_KEY in your .env")


# ------------------------------------------------
# helper function
# ------------------------------------------------
def list_to_string(lst):
    """
    Converts a Python list (possibly containing dicts/lists) into a
    single string, with a consistent ordering.
    """
    return ", ".join(lst)


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
            "id": item["id"],                                   # str
            "title": snip["title"],                             # str
            "description": snip["description"],                 # str
            "categoryId": snip["categoryId"],                   # str
            "tags": list_to_string(snip.get("tags", [])),     # list[str]
            "channelTitle": snip["channelTitle"]                # str
        })
    return vids

def main():
    # category map
    categories = category_mapping(region_code="US")
    print("Loaded categories: ", categories)

    # TODO: extract lists from positive (educational) and negative (non-educational) video_ids.txt files

    ids = ["6dTyOl1fmDo",
            "UN8Vp1uugW4",
            "f4pQrebE6jc",
            "2xxziIWmaSA",
            "LbT1yp6quS8",
            "MlK6SIjcjE8",
            "MSq-KGj_cnY",
            "T4IX36sP_0c",
            "T4IX36sP_0c",
            "kVrFjcq0qiw",
            "PZ7lDrwYdZc",
            "9Rc_EjPZgB8",
            "kQ8DGP9p2LY",
            "1_H7InPMjaY",
            "lHafBjtTyKQ",
            "fW8amMCVAJQ",
            "6Sl7xxisVZo",
            "W9uKzPFS1CI",
            "Unzc731iCUY",
            "QFvqStqPCRU",
            "QtOumf09MEQ",
            "qLBImHhCXSw",
            "Acl6owhFMHQ",
            "DmEND-q0LyU",
            "ay15dc2cvm0",
            "TKYZTbyQQHY",
            "yDETVPFdbT4",
            "48HMCy5F6Vg",
            "Lf_BUdx26XU",
            "AOqC3L4NQ2c",
            "6jDSEhU-feI",
            "cUnNUgsgthk",
            "qxuPnBJCTM4",
            "AcRSJEhFZ-s",
            "g4OBUupicWg",
            "1Vo2dVyzoYA",
            "r6Ss6dvGTIw",
            "Gytu2rI8_lI",
            "hlMa4IF8OxY",
            "xa6me8wou_k",
            "yk6wbvNPZW0",
            "UCxHB1tzero",
            "p-0SOWbzUYI",
            "Qhsf8Ez679Q",
            "QrxPuk0JefA",
            "b78W32I69VA",
            "r5Iy3v1co0A",
            "pg827uDPFqA",
            "-5nhdEDGaws",
            "aSuQ_wF_Rb8",
        ]
    # pull metadata

    print(len(ids))
    vids = fetch_video_metadata(ids)

    with open('output.csv', mode="w", newline="", encoding="utf-8") as csvfile:
        writer = csv.writer(csvfile)
        
        writer.writerow(["id", "title", "category","channelTitle","tags"])  # header
        for v in vids:
            # get the category. fallback is "Unknown"
            cur_tags = []
            cur_category = categories.get(v["categoryId"], "Unknown")

            # TODO: write to CSV file for dataset

            if "tags" in v:
                cur_tags = v["tags"]
            else:
                cur_tags = []

            writer.writerow([v['id'], v['title'], cur_category, v['channelTitle'], cur_tags])
            # print(f"{v['id']}: {v['title']} [{cur_category}]")

if __name__ == "__main__":
    main()