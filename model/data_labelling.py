
# Snorkel imports
# Snorkel is a library that allows us to Build Training Sets Programmatically
import json
from snorkel.labeling import LabelModel, PandasLFApplier, labeling_function

# -----------------------------------------------------------------------------
# 0. Load our labelling config from JSON
# -----------------------------------------------------------------------------
CONFIG_PATH = "./data/labeling_config.json"

with open(CONFIG_PATH, "r", encoding="utf-8") as f:
    cfg = json.load(f)

NON_EDU_CHANNELS = set(cfg["non_edu_channels"])
EDU_KEYWORDS    = cfg["keywords"]["edu"]
NON_EDU_KEYWORDS = cfg["keywords"]["non_edu"]

# -----------------------------------------------------------------------------
# 0. Snorkel label definitions
# -----------------------------------------------------------------------------
ABSTAIN = -1
EDU     =  1
NON_EDU =  0

@labeling_function()
def lf_by_category(x):
    return EDU if x["category"] in ["Education", "Science & Technology"] else ABSTAIN

@labeling_function()
def lf_title_keywords(x):
    title = x["title"].lower()
    return EDU if any(k in title for k in EDU_KEYWORDS) else ABSTAIN

@labeling_function()
def lf_description_keywords(x):
    desc = x["description"].lower()
    return EDU if any(k in desc for k in EDU_KEYWORDS) else ABSTAIN

@labeling_function()
def lf_entertainment_keywords(x):
    title = x["title"].lower()
    return NON_EDU if any(k in title for k in NON_EDU_KEYWORDS) else ABSTAIN

@labeling_function()
def lf_channel_pattern(x):
    return NON_EDU if x["channelTitle"] in NON_EDU_CHANNELS else ABSTAIN

lfs = [lf_by_category, lf_title_keywords, lf_entertainment_keywords, lf_channel_pattern]