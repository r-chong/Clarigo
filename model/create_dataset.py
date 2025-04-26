import re
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
# helper functions
# ------------------------------------------------
def list_to_string(lst):
    """
    Converts a Python list (possibly containing dicts/lists) into a
    single string, with a consistent ordering.
    """
    return ", ".join(lst)

def get_youtube_client():
    """
    get_youtube_client() is essentially a helper/wrapper function that just returns the line googleapiclient.discovery.build("youtube", "v3", developerKey=…)
    it spins up a “YouTube service” object that knows how to call any of the v3 API endpoints (videos.list, search.list, videoCategories.list, etc.).
    """
    return build("youtube", "v3", developerKey=YOUTUBE_API_KEY)

def clean_whitespace(s: str) -> str:
    # collapse ANY whitespace (spaces, tabs, newlines) into single spaces
    return re.sub(r"\s+", " ", s).strip()

