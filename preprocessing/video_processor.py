import json
import unicodedata
import string
import re

def strip_unicode(input_path, output_path, channel_key='channel name', title_key='video title'):
    """
    Normalize unicode in channel name and video title fields for each JSON object in a jsonl file.
    Writes output to a new jsonl file.
    """
    with open(input_path, 'r', encoding='utf-8') as infile, open(output_path, 'w', encoding='utf-8') as outfile:
        for idx, line in enumerate(infile, 1):
            try:
                obj = json.loads(line)
            except json.JSONDecodeError as e:
                print(f"Skipping invalid JSON on line {idx}: {e}")
                continue
            if channel_key in obj:
                obj[channel_key] = unicodedata.normalize('NFKC', obj[channel_key])
            if title_key in obj:
                obj[title_key] = unicodedata.normalize('NFKC', obj[title_key])
            outfile.write(json.dumps(obj, ensure_ascii=False) + '\n')

def remove_emojis(text):
    emoji_pattern = re.compile("["
        u"\U0001F600-\U0001F64F"  # emoticons
        u"\U0001F300-\U0001F5FF"  # symbols & pictographs
        u"\U0001F680-\U0001F6FF"  # transport & map
        u"\U0001F1E0-\U0001F1FF"  # flags
        "]+", flags=re.UNICODE)
    return emoji_pattern.sub(r'', text)

def remove_punctuations_and_lowercase(input_path, output_path, channel_key='channel name', title_key='video title'):
    """
    Remove punctuation, emojis, and lowercase channel name and video title fields for each JSON object in a jsonl file.
    Writes output to a new jsonl file.
    """
    def clean(text):
        text = remove_emojis(text)
        text = ''.join(ch for ch in text if ch not in string.punctuation)
        return text.lower()

    with open(input_path, 'r', encoding='utf-8') as infile, open(output_path, 'w', encoding='utf-8') as outfile:
        for idx, line in enumerate(infile, 1):
            try:
                obj = json.loads(line)
            except json.JSONDecodeError as e:
                print(f"Skipping invalid JSON on line {idx}: {e}")
                continue
            if channel_key in obj:
                obj[channel_key] = clean(obj[channel_key])
            if title_key in obj:
                obj[title_key] = clean(obj[title_key])
            outfile.write(json.dumps(obj, ensure_ascii=False) + '\n')
import pandas as pd
import os
import json 
import argparse

# load a single jsonl file into a pandas dataframe
def load_single_raw_jsonl_file(file_name: str):
    current_dir = os.path.dirname(os.path.abspath(__file__))
    # Go up one level to get to the project root, then into data/raw_data
    project_root = os.path.dirname(current_dir)
    data_dir = os.path.join(project_root, "data", "raw_data")
    file_path = os.path.join(data_dir, file_name)
    df = pd.read_json(file_path, lines=True)
    return df

def main():

    # argparse
    parser = argparse.ArgumentParser(description="Process raw jsonl files.")
    parser.add_argument("--raw_jsonl_file", type=str, help="Name of the input raw jsonl file.")
    args = parser.parse_args()

    # load in the file
    project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    output_path = os.path.join(project_root, "data", "processed_data", "processed.jsonl")
    df = load_single_raw_jsonl_file(args.raw_jsonl_file)
    
    # load existing processed data (handle empty/missing file)
    try:
        processed_df = pd.read_json(output_path, lines=True)
        if processed_df.empty:
            processed_df = pd.DataFrame()  # Ensure empty DataFrame
    except (FileNotFoundError, ValueError):
        # File doesn't exist or is empty
        processed_df = pd.DataFrame()

    # remove the shorts
    df_no_shorts = df.query('isShort==False')  # Keep only non-shorts
    
    # keep only the specified fields
    columns_to_keep = ['title', 'videoUrl', 'channelName', 'channelUrl', 'videoId']
    df_filtered = df_no_shorts[columns_to_keep].copy()
    
    print(f"Original rows: {len(df)}")
    print(f"After removing shorts: {len(df_no_shorts)}")
    print(f"After filtering columns: {len(df_filtered)}")

    # append to processed JSONL file
    processed_df = pd.concat([processed_df, df_filtered])
    processed_df = processed_df.drop_duplicates(subset=['videoId'])
    processed_df.to_json(output_path, orient='records', lines=True, mode='w')
    print(f"Appended {len(df_filtered)} rows to {output_path}")

if __name__ == "__main__":
    # main()
    strip_unicode("data/labeled_data/1001-1300.jsonl", "test.jsonl")
    remove_punctuations_and_lowercase("test.jsonl", "test2.jsonl")