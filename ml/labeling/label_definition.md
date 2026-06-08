<!--
LABEL_VERSION: broad-v1
-->

# Clarigo Label Definition
**Version:** `broad-v1`

## Task

Classify a YouTube video as **educational (`1`)** or **non-educational (`0`)**
using its title and channel name only.

## Definition (broad "educational")

A video is **educational (`1`)** if its **primary purpose is to teach, explain,
or instruct** so that a viewer comes away understanding a concept or able to do
something. When classifying a video, please ask the question "Would a reasonable student / learner watch this video as an effective means to learn? Would they watch this video to study?" 

This is intentionally **broad** and spans subjects:

- STEM: math, science, engineering, programming, data, etc.
- Humanities & social science: history, economics, philosophy, civics, law.
- Languages and test prep.
- Practical how-to & skills: cooking technique, repair, software walkthroughs,
  music theory/instrument lessons, art technique, personal finance literacy.
- Academic lectures, courses, structured explainers, and documentaries that
  are framed to teach.

A video is **non-educational (`0`)** if its primary purpose is entertainment,
promotion, or personal expression rather than teaching (anything that is not defined as Educational):

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

Use only the title and channel provided. Do not infer video content beyond what metadata suggests.
Shorts can be 0 or 1; judge by intent, not format. #shorts alone doesn't mean non-educational.

## Output contract (for automated labelers)

For each input record, return:

- `label`: `1` or `0`
- `confidence`: float in `[0, 1]` (the model's certainty in the label)
- optional `reason`: one short clause explaining the decision

Records below the configured confidence threshold are routed to a human review
queue rather than trusted blindly.
