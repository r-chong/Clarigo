#!/usr/bin/env python3
"""
Dataset Builder for Clarigo Educational Video Classification
Combines all normalized JSONL files into a master dataset for ML training.
"""

import json
import pandas as pd
import os
from pathlib import Path
import logging

# Set up logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class DatasetBuilder:
    def __init__(self, normalized_data_dir=None, output_dir=None):
        # Get the script's directory and go up one level to find the project root
        script_dir = Path(__file__).parent
        project_root = script_dir.parent
        
        # Set default paths relative to project root
        if normalized_data_dir is None:
            normalized_data_dir = project_root / "data" / "normalized"
        if output_dir is None:
            output_dir = project_root / "data" / "processed_data"
            
        self.normalized_data_dir = Path(normalized_data_dir)
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(exist_ok=True)
        
    def load_jsonl_file(self, file_path):
        """Load a JSONL file and return a list of dictionaries."""
        data = []
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                for line_num, line in enumerate(f, 1):
                    line = line.strip()
                    if line:
                        try:
                            data.append(json.loads(line))
                        except json.JSONDecodeError as e:
                            logger.warning(f"Error parsing line {line_num} in {file_path}: {e}")
            logger.info(f"Loaded {len(data)} records from {file_path}")
        except FileNotFoundError:
            logger.error(f"File not found: {file_path}")
        except Exception as e:
            logger.error(f"Error reading {file_path}: {e}")
        
        return data
    
    def combine_all_files(self):
        """Combine all JSONL files in the normalized directory."""
        all_data = []
        
        # Get all JSONL files in the normalized directory
        jsonl_files = list(self.normalized_data_dir.glob("*.jsonl"))
        jsonl_files.sort()  # Sort for consistent ordering
        
        logger.info(f"Found {len(jsonl_files)} JSONL files to process")
        
        for file_path in jsonl_files:
            logger.info(f"Processing {file_path.name}...")
            file_data = self.load_jsonl_file(file_path)
            all_data.extend(file_data)
        
        logger.info(f"Combined dataset contains {len(all_data)} total records")
        return all_data
    
    def create_dataframe(self, data):
        """Convert list of dictionaries to pandas DataFrame with basic validation."""
        df = pd.DataFrame(data)
        
        # Basic data validation
        logger.info("Dataset Overview:")
        logger.info(f"Total records: {len(df)}")
        logger.info(f"Columns: {list(df.columns)}")
        
        # Check for missing values
        missing_counts = df.isnull().sum()
        if missing_counts.any():
            logger.warning("Missing values found:")
            for col, count in missing_counts[missing_counts > 0].items():
                logger.warning(f"  {col}: {count} missing values")
        
        # Check label distribution
        if 'label' in df.columns:
            label_counts = df['label'].value_counts()
            logger.info("Label distribution:")
            logger.info(f"  Non-educational (0): {label_counts.get(0, 0)} ({label_counts.get(0, 0)/len(df)*100:.1f}%)")
            logger.info(f"  Educational (1): {label_counts.get(1, 0)} ({label_counts.get(1, 0)/len(df)*100:.1f}%)")
        
        # Check for duplicates
        duplicates = df.duplicated(subset=['videoId']).sum()
        if duplicates > 0:
            logger.warning(f"Found {duplicates} duplicate videoIds")
            # Remove duplicates, keeping first occurrence
            df = df.drop_duplicates(subset=['videoId'], keep='first')
            logger.info(f"After removing duplicates: {len(df)} records")
        
        return df
    
    def save_dataset(self, df, filename="master_dataset.csv"):
        """Save the combined dataset to CSV format."""
        output_path = self.output_dir / filename
        df.to_csv(output_path, index=False, encoding='utf-8')
        logger.info(f"Master dataset saved to {output_path}")
        
        # Also save as JSONL for compatibility
        jsonl_path = self.output_dir / filename.replace('.csv', '.jsonl')
        with open(jsonl_path, 'w', encoding='utf-8') as f:
            for _, row in df.iterrows():
                json.dump(row.to_dict(), f, ensure_ascii=False)
                f.write('\n')
        logger.info(f"Master dataset also saved as JSONL to {jsonl_path}")
        
        return output_path
    
    def build_master_dataset(self):
        """Main method to build the master dataset."""
        logger.info("Starting dataset building process...")
        
        # Combine all files
        combined_data = self.combine_all_files()
        
        if not combined_data:
            logger.error("No data found. Exiting.")
            return None
        
        # Create DataFrame
        df = self.create_dataframe(combined_data)
        
        # Save dataset
        output_path = self.save_dataset(df)
        
        logger.info("Dataset building completed successfully!")
        return output_path, df

def main():
    """Main function to run the dataset builder."""
    builder = DatasetBuilder()
    output_path, df = builder.build_master_dataset()
    
    if output_path:
        print(f"\nMaster dataset created successfully!")
        print(f"Location: {output_path}")
        print(f"Total records: {len(df)}")
        print(f"Educational videos: {(df['label'] == 1).sum()}")
        print(f"Non-educational videos: {(df['label'] == 0).sum()}")
        print(f"\nReady for machine learning!")

if __name__ == "__main__":
    main()
