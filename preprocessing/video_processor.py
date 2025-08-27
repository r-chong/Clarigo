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
    main()