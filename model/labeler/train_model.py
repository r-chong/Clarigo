"""
- From data/labelling_config.json, we pass in channels that are non-educational, some educational keywords, and some non-educational keywords.
- We create a set of simple rules (like if it  has category education then it is educational, if channel name is in NON_EDU_CHANNELs then non-educational, etc)
- We run the rules over the videos and they vote. 1 is educational, 0 is non-educational, -1 is a non-vote (ABSTAIN)
- After these votes, Snorkel trains a mini model that learns which rules are usually right and which ones are not-so-important. This way we don't need to do as much human labelling
"""
import json
import os
from snorkel.labeling import labeling_function, PandasLFApplier
from snorkel.labeling.model import LabelModel  # Changed import location
import pandas as pd

def predict_single_video(video_data):
    """
    Predict if a single video is educational or not using direct voting from labeling functions
    """
    df = pd.DataFrame([video_data])
    
    # Apply labeling functions
    applier = PandasLFApplier(lfs=LFS)
    L = applier.apply(df)
    
    # Count votes (excluding abstains (-1))
    votes = L[0]  # Get votes for single video
    edu_votes = sum(1 for vote in votes if vote == EDU)
    non_edu_votes = sum(1 for vote in votes if vote == NON_EDU)
    
    # Make decision based on majority
    if edu_votes > non_edu_votes:
        return True
    elif non_edu_votes > edu_votes:
        return False
    else:
        return False  # Default to non-educational if tied


SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))

MODEL_DIR = os.path.dirname(SCRIPT_DIR)

config_path = os.path.join(MODEL_DIR, "data", "labeling_config.json")
# load config
with open(config_path, encoding="utf-8") as f: #removed labeler/ from the start
    cfg = json.load(f)

from youtube_client.client import category_mapping

# map once at import
CAT_MAP = category_mapping(region_code="US")
EDU_IDS = {cid for cid, name in CAT_MAP.items() if name in ("Education", "Science & Technology")}
NON_EDU_CHANNELS = set(cfg["non_edu_channels"])
EDU_CHANNELS =set(cfg["edu_channels"])
EDU_KWDS = cfg["keywords"]["edu"]
NON_EDU_KWDS = cfg["keywords"]["non_edu"]

ABSTAIN, EDU, NON_EDU = -1, 1, 0

# this is a decorator (function that takes another function-as-value and returns a wrapper)
# the decorator is from Snorkel library
@labeling_function()
def lf_by_category(x):
    return EDU if x["categoryId"] in EDU_IDS else ABSTAIN

@labeling_function()
def lf_title_keywords(x):
    t = x["title"].lower()
    return EDU if any(k in t for k in EDU_KWDS) else ABSTAIN

@labeling_function()
def lf_entertainment_keywords(x):
    t = x["title"].lower()
    return NON_EDU if any(k in t for k in NON_EDU_KWDS) else ABSTAIN

@labeling_function()
def lf_channel_pattern(x):
    c = x["channelTitle"].lower().strip()
    return NON_EDU if c in {ch.lower() for ch in NON_EDU_CHANNELS} else ABSTAIN

@labeling_function()
def lf_channel_edu_pattern(x):
    c = x["channelTitle"].lower().strip()
    return EDU if c in {ch.lower() for ch in EDU_CHANNELS} else ABSTAIN

LFS = [lf_by_category, lf_title_keywords, lf_entertainment_keywords, lf_channel_pattern, lf_channel_edu_pattern]
