import json
import unicodedata
import string
import re
import os
import tempfile

def strip_unicode(input_path, output_path, channel_key='channelName', title_key='title'):
    """
    Normalize unicode in channelName and title fields for each JSON object in a jsonl file.
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

def remove_punctuations_and_lowercase(input_path, output_path, channel_key='channelName', title_key='title'):
    """
    Remove punctuation, emojis, and lowercase channelName and title fields for each JSON object in a jsonl file.
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

def process_single_file(input_file_path, output_file_path):
    """
    Process a single JSONL file by applying both normalization functions sequentially.
    """
    try:
        # Create a temporary file for intermediate processing
        with tempfile.NamedTemporaryFile(mode='w+', suffix='.jsonl', delete=False, encoding='utf-8') as temp_file:
            temp_path = temp_file.name
        
        # Step 1: Apply unicode normalization
        print(f"Step 1: Applying unicode normalization to {os.path.basename(input_file_path)}...")
        strip_unicode(input_file_path, temp_path)
        
        # Step 2: Apply punctuation removal and lowercasing
        print(f"Step 2: Applying punctuation removal and lowercasing to {os.path.basename(input_file_path)}...")
        remove_punctuations_and_lowercase(temp_path, output_file_path)
        
        # Clean up temporary file
        os.unlink(temp_path)
        
        print(f"Successfully processed {os.path.basename(input_file_path)} -> {os.path.basename(output_file_path)}")
        
    except Exception as e:
        print(f"Error processing {input_file_path}: {e}")
        # Clean up temp file if it exists
        if 'temp_path' in locals() and os.path.exists(temp_path):
            os.unlink(temp_path)

def process_all_labeled_data():
    """
    Process all JSONL files in the labeled_data folder and save results to normalized folder.
    """
    # Define paths. The ml/ root is two levels up (ml/scripts/preprocessing/).
    ml_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    labeled_data_dir = os.path.join(ml_root, 'data', 'labeled_data')
    normalized_dir = os.path.join(ml_root, 'data', 'normalized')
    
    # Create normalized directory if it doesn't exist
    os.makedirs(normalized_dir, exist_ok=True)
    
    try:
        # Get all JSONL files from labeled_data directory
        jsonl_files = [f for f in os.listdir(labeled_data_dir) if f.endswith('.jsonl')]
        
        if not jsonl_files:
            print("No JSONL files found in labeled_data directory.")
            return
        
        print(f"Found {len(jsonl_files)} JSONL files to process:")
        for file in jsonl_files:
            print(f"  - {file}")
        print()
        
        # Process each file
        for filename in jsonl_files:
            input_path = os.path.join(labeled_data_dir, filename)
            output_path = os.path.join(normalized_dir, filename)
            
            process_single_file(input_path, output_path)
        
        print(f"\nProcessing complete! All files saved to: {normalized_dir}")
        
    except Exception as e:
        print(f"Error during batch processing: {e}")

if __name__ == "__main__":
    process_all_labeled_data()