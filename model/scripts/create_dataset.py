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
            cat_name = categories.get(v["categoryId"], "Unknown")
            text  = " ".join([v["title"], cat_name, v["channelTitle"], v["description"], v["tags"]])
            writer.writerow({"id": v["id"], "text": text, "label": 0})

if __name__ == "__main__":
    main()

# def main():
#     # category map
#     categories = category_mapping(region_code="US")
#     print("Loaded categories: ", categories)

#     # TODO: extract lists from positive (educational) and negative (non-educational) video_ids.txt files
 
#     # pull metadata

#     print(len(ids))
#     vids = fetch_video_metadata(ids)

#     with open('output.csv', mode="w", newline="", encoding="utf-8") as csvfile:
#         writer = csv.writer(csvfile)
        
#         # fieldnames = ["id", "title", "description", "category","channelTitle","tags","label"]  # header
#         fieldnames = ["id", "text", "label"]
#         writer = csv.DictWriter(csvfile, fieldnames=fieldnames)
#         writer.writeheader()
        
#         for v in vids:
#             # clean description
#             title = clean_whitespace(v["title"])
#             desc  = clean_whitespace(v["description"])
#             tags  = ";".join(v.get("tags", "").split(", "))  # already a string, semicolon-delimited
#             tags  = clean_whitespace(tags)
#             channelTitle = v["channelTitle"]

#             # get the category. fallback is "Unknown"
#             category = categories.get(v["categoryId"], "Unknown")

#             # Decide on your label (you’ll have to assign this yourself,
#             #    e.g. based on a lookup of “educational vs non”)
#             label = 1 if category == "Education" else 0

#             # concatenate with a special token or just spaces
#             text = " ".join([title, category, channelTitle, desc, tags])

#             writer.writerow({
#                 "id":    v["id"],
#                 "text":  text,
#                 "label": label
#             })

# if __name__ == "__main__":
#     main()