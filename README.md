# Clarigo

Clarigo comes from the Esperanto language and means “the act of clarifying” or “making clear.” With this extension, you can curb your YouTube usage while not limiting educational content.

Features will include:

-   Smart timer to limit your non-educational YouTube usage
-   Hide non-educational content from your homepage, subscriptions, and search results
-   Whitelist and blacklist channels
-   More TBD

# Content Script

-   [ ] Add a content script stub that logs window.location on YouTube pages
-   [ ] Write a helper to extract video metadata (title, URL, channel name)
-   [ ] Stub out a function to call POST /classify-video with example payload
-   [ ] Create a small util to hide a video DOM element (e.g. display: none)

# Popup UI

-   [ ] Build a static React component for the timer display (no logic yet)
-   [ ] Build a static React component for whitelist/blacklist forms
-   [ ] Wire up LocalStorage helpers: getPrefs() / setPrefs()

# Backend (phase 1)

-   [ ] Collect & prep a tiny dataset of ~100 “educational” and ~100 “non-educational” - thumbnails
-   [ ] Resize all to 224×224 and normalize pixel values to [0, 1]
-   [ ] Split into train/validation (e.g. 80/20), no fancy stratification yet
-   [ ] Build a toy CNN from scratch
-   [ ] Run & inspect basic training
-   [ ] Log train/val loss and accuracy each epoch (print or matplotlib)
-   [ ] Manually review a few misclassified images to sanity-check
-   [ ] Stop once you see valid learning (loss ↓ and accuracy ↑)

# Styling and Assets

-   [ ] Define a minimal color palette in a shared CSS/SCSS file
-   [ ] Add basic CSS reset & font rules for the popup
