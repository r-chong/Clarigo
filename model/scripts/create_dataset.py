import csv
from youtube_client.client import fetch_video_metadata, category_mapping
# from labeller.youtube_labeling import LFS, lf_by_category  # etc.

def main():
    # 1) TODO: load your positive/negative ID lists
    # ids = load_ids_somehow()

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
            writer.writerow({"id": v["id"], "text": text, "label": 0}) # does this always make it labeled 0?

if __name__ == "__main__":
    main()