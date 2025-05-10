import csv
from youtube_client.client import fetch_video_metadata, category_mapping
from labeller.youtube_labeling import LFS, lf_by_category  # etc.

def main():
    # 1) TODO: load your positive/negative ID lists
    # ids = load_ids_somehow()

    # 2) fetch metadata
    vids = fetch_video_metadata(ids)
    categories = category_mapping()
    
    # 3) write out CSV
    with open("output.csv", "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=["id", "text", "label"])
        writer.writeheader()
        for v in vids:
            # TODO: clean the title and description of whitespace
            cat_name = categories.get(v["categoryId"], "Unknown")
            text  = " ".join([v["title"], cat_name, v["channelTitle"], v["description"], v["tags"]])
            writer.writerow({"id": v["id"], "text": text, "label": 0})

if __name__ == "__main__":
    main()