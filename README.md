# Clarigo - Educational Video Classification

A machine learning project that classifies YouTube videos as educational or non-educational based on video metadata using Logistic Regression.

## Project Overview

This project implements a complete ML pipeline to automatically classify YouTube videos into educational (1) vs non-educational (0) categories. The classification is based on video titles, channel names, and other metadata features extracted from YouTube video data.

### Dataset Statistics
- **Total Videos**: 3,024 (after removing missing labels)
- **Educational Videos**: 1,170 (38.7%)
- **Non-Educational Videos**: 1,654 (54.7%)  
- **Features Used**: Video title, channel name, video URL, and engineered numerical features

## Quick Start

### 1. Install Dependencies
```bash
pip install -r requirements.txt
```

### 2. Build Master Dataset
```bash
python dataset_builder.py
```

### 3. Train and Evaluate Model
```bash
jupyter notebook educational_video_classification.ipynb
```

## Project Structure

```
Clarigo/
├── data/
│   ├── normalized/           # Cleaned JSONL files with labels
│   ├── processed_data/       # Master dataset (CSV & JSONL)
│   └── labeled_data/         # Original labeled data
├── preprocessing/            # Data processing scripts
├── dataset_builder.py        # Combines normalized files into master dataset
├── educational_video_classification.ipynb  # Main ML notebook
├── requirements.txt          # Python dependencies
└── README.md                # This file
```

## Features Engineering

The model uses both text and numerical features:

### Text Features (TF-IDF)
- **Combined Text**: Video title + channel name (preprocessed)
- **TF-IDF Parameters**: 5,000 max features, 1-2 ngrams, English stop words removed

### Numerical Features
- Title length (characters)
- Title word count
- Channel word count  
- Presence of numbers in title
- Uppercase ratio in title
- Educational keywords count

### Educational Keywords
The model recognizes educational content through keywords like:
`tutorial`, `learn`, `education`, `course`, `lesson`, `teach`, `training`, `study`, `guide`, `how to`, `explained`, `basics`, `fundamentals`, `programming`, `coding`, `math`, `science`, etc.

## Model Performance

The final Logistic Regression model achieves:

- **Accuracy**: ~87-90% (varies with cross-validation)
- **ROC-AUC**: ~0.93-0.95
- **Cross-validation**: 5-fold CV with stratified sampling
- **Hyperparameter Tuning**: GridSearchCV optimized for ROC-AUC

### Best Parameters (typical)
- `C`: 10.0 (regularization strength)
- `penalty`: 'l2' 
- `solver`: 'liblinear'
- `class_weight`: 'balanced' (handles class imbalance)

## Usage Examples

### Predicting New Videos
```python
import joblib
from pathlib import Path

# Load trained model and pipelines
model = joblib.load('models/logistic_regression_model.pkl')
text_pipeline = joblib.load('models/text_preprocessing_pipeline.pkl')
numerical_pipeline = joblib.load('models/numerical_preprocessing_pipeline.pkl')

# Predict a new video
title = "Python Programming Tutorial for Beginners"
channel = "CodeAcademy"

prediction, probability = predict_video_educational(title, channel, model, text_pipeline, numerical_pipeline)
print(f"Prediction: {'Educational' if prediction == 1 else 'Non-Educational'}")
print(f"Confidence: {probability[1]:.3f}")
```

## Key Insights

1. **Text Features Dominate**: TF-IDF features from titles and channel names are the strongest predictors
2. **Educational Keywords**: Words like "tutorial", "learn", "python", "explained" strongly indicate educational content
3. **Channel Context**: Channel names provide valuable context (e.g., "CodeAcademy" vs "GamerHub")
4. **Title Patterns**: Educational videos often have longer, more descriptive titles
5. **Class Imbalance**: The dataset is slightly imbalanced (54.7% non-educational), handled with balanced class weights

## Recommendations for Improvement

1. **More Data**: Collect additional labeled videos to improve performance
2. **Enhanced Features**: Include video duration, view count, description text
3. **Advanced Models**: Try Random Forest, XGBoost, or Neural Networks
4. **Better Text Processing**: Use pre-trained embeddings (Word2Vec, BERT)
5. **Active Learning**: Implement uncertainty sampling for efficient labeling

## Files Description

- **`dataset_builder.py`**: Combines all normalized JSONL files into a master CSV dataset
- **`educational_video_classification.ipynb`**: Complete ML pipeline with EDA, feature engineering, training, and evaluation
- **`data/normalized/`**: Clean, consistent JSONL files with video metadata and labels
- **`data/processed_data/master_dataset.csv`**: Final combined dataset ready for ML
- **`models/`**: Saved trained models and preprocessing pipelines (created after training)

## Pipeline Overview

**Current Pipeline**: YouTube Metadata web scraper → Primary cleaning → Human labeling → Data normalization → **Machine Learning Classification**

**Due Date**: September 2nd, 2025

## Contributing

This project is part of the Clarigo educational video classification system. To contribute:

1. Ensure consistent data format in normalized files
2. Run the dataset builder before training models
3. Update documentation for any new features or improvements
4. Test model performance with cross-validation

## License

This project is for educational and research purposes.