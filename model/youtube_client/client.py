"""
This file handles the functions that were previously all in one file
- category_mapping(), fetch_video_metadata()
"""

import sys
print(sys.path)

import os
from dotenv import load_dotenv
print(f"Current working directory: {os.getcwd()}")
print(f"Loading .env from: {os.path.abspath('.env')}")
load_dotenv()

import re
from functools import lru_cache
from googleapiclient.discovery import build

def get_youtube_client():
    return build("youtube", "v3", developerKey=YOUTUBE_API_KEY)

scopes = ["https://www.googleapis.com/auth/youtube.readonly"]

YOUTUBE_API_KEY = os.environ.get("YOUTUBE_API_KEY")

if not YOUTUBE_API_KEY:
    raise RuntimeError("Set YOUTUBE_API_KEY in your .env")

@lru_cache(maxsize=1)
def category_mapping(region_code="US"):
    """
    category_mapping(region_code) maps YouTube category IDs to their human-readable titles
    Used instead of a constant dict as there's a chance that YouTube categories change
    example output: {'1': 'Film & Animation', '2': 'Autos & Vehicles', ...}
    """
    yt = get_youtube_client()
    response = yt.videoCategories().list(part="snippet", regionCode=region_code).execute()
    
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
    resp = yt.videos().list(part="snippet", id=",".join(video_ids)).execute()
    vids = []

    # TODO: batch in groups of 50, calling this endpoint: `videos.list?part=snippet`

    for item in resp.get("items", []):
        sn = item["snippet"]
        vids.append({
            "id":          item["id"],
            "title":       re.sub(r"\s+", " ", sn["title"]).strip(),
            "description": re.sub(r"\s+", " ", sn["description"]).strip(),
            "categoryId":  sn["categoryId"],
            "tags":        ";".join(sn.get("tags", [])),
            "channelTitle": sn["channelTitle"],
        })
    return vids
