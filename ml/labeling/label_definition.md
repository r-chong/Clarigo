<!--
LABEL_VERSION: broad-v1
Bump LABEL_VERSION whenever the definition below changes in a way that could
flip labels. The labeler stamps this version onto every record it produces, so
we can tell which definition any given label came from and safely re-label the
raw data later WITHOUT re-scraping. Keep the version token on its own line in
this exact `LABEL_VERSION: <token>` format — tooling parses it.
-->

# Clarigo Label Definition

**Version:** `broad-v1`
**Status:** intentionally provisional — this definition is expected to be
revisited. Raw scrapes are kept immutable and rich precisely so we can re-run
labeling under a future definition without re-collecting data.

## Task

Classify a YouTube video as **educational (`1`)** or **non-educational (`0`)**
using its title and channel name (and, when available, description/tags).

## Definition (broad "educational")

A video is **educational (`1`)** if its **primary purpose is to teach, explain,
or instruct** so that a viewer comes away understanding a concept or able to do
something. This is intentionally **broad** and spans subjects:

- STEM: math, science, engineering, programming, data, etc.
- Humanities & social science: history, economics, philosophy, civics, law.
- Languages and test prep.
- Practical how-to & skills: cooking technique, repair, software walkthroughs,
  music theory/instrument lessons, art technique, personal finance literacy.
- Academic lectures, courses, structured explainers, and documentaries that
  are framed to teach.

A video is **non-educational (`0`)** if its primary purpose is entertainment,
promotion, or personal expression rather than teaching:

- Entertainment/spectacle: vlogs, challenges, pranks, reactions, gameplay,
  music videos, comedy, sports highlights.
- Promotion/hype: product launches, trailers, "introducing X", marketing.
- Opinion/personal narrative: motivational talks, "how I made $X", career
  storytelling, lifestyle content.
- News/current events not framed as instruction.

## Edge rules (v1)

- **Edutainment** counts as `1` only if a viewer is meaningfully taught a
  concept, not merely shown a cool phenomenon.
- **Tutorials/walkthroughs** count as `1` even if informal, as long as the
  intent is to instruct.
- **Reviews/comparisons** are `0` unless they primarily teach how something
  works or how to use it.
- When genuinely ambiguous, prefer `0` and rely on the confidence score to flag
  it for human review.

## Output contract (for automated labelers)

For each input record, return:

- `label`: `1` or `0`
- `confidence`: float in `[0, 1]` (the model's certainty in the label)
- optional `reason`: one short clause explaining the decision

Records below the configured confidence threshold are routed to a human review
queue rather than trusted blindly.
