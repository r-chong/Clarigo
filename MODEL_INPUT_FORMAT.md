# Clarigo Educational Video Classifier - Model Input Format Specification

## Overview

This document specifies the exact input format and preprocessing requirements for the Clarigo Educational Video Classifier. The model classifies YouTube videos as educational (1) or non-educational (0) based on video titles and channel names.

## Model Specifications

- **Model Type**: Logistic Regression with TF-IDF text features
- **Training Date**: 2025-09-02
- **Model Size**: 173KB
- **Accuracy**: 93.4% (Test Set)
- **ROC-AUC**: 0.972

## Required Input Data

### Primary Inputs
The model requires exactly **2 pieces of information** for each video:

| Field | Type | Description | Required | Example |
|-------|------|-------------|----------|---------|
| `title` | String | Video title as displayed on YouTube | Yes | "Python Programming Tutorial for Beginners" |
| `channelName` | String | Channel name as displayed on YouTube | Yes | "CodeWithMosh" |

### Input Validation
- **Missing Values**: Both fields are required. If either is missing or null, prediction quality will be degraded
- **Data Types**: Both inputs should be strings
- **Length Limits**: No strict limits, but optimal performance with typical YouTube titles (1-100 characters)
- **Special Characters**: All special characters are handled by preprocessing

## Preprocessing Pipeline

### 1. Text Preprocessing Function
```python
def preprocess_text(text):
    """Clean and preprocess text for feature extraction"""
    if pd.isna(text):
        return ""
    
    # Convert to lowercase
    text = str(text).lower()
    
    # Remove special characters but keep spaces and alphanumeric
    text = re.sub(r'[^a-zA-Z0-9\s]', ' ', text)
    
    # Remove extra whitespace
    text = ' '.join(text.split())
    
    return text
```

**Preprocessing Steps:**
1. Convert to lowercase
2. Remove all special characters (punctuation, symbols) except spaces
3. Collapse multiple spaces into single spaces
4. Trim leading/trailing whitespace

**Examples:**
- Input: `"Python Programming Tutorial for Beginners!"`
- Output: `"python programming tutorial for beginners"`

- Input: `"Learn Machine Learning - Part 1 (2024)"`
- Output: `"learn machine learning part 1 2024"`

### 2. Feature Engineering

The model generates **6 features** from the input:

#### Text Features (1 feature)
| Feature | Description | Processing |
|---------|-------------|------------|
| `combined_text` | Concatenated cleaned title + channel | `title_clean + ' ' + channel_clean` |

#### Numerical Features (5 features)
| Feature | Description | Data Type | Typical Range |
|---------|-------------|-----------|---------------|
| `title_word_count` | Number of words in cleaned title | Integer | 1-20 |
| `channel_word_count` | Number of words in cleaned channel | Integer | 1-10 |
| `title_char_count` | Number of characters in cleaned title | Integer | 5-150 |
| `channel_char_count` | Number of characters in cleaned channel | Integer | 3-50 |
| `edu_keywords_total` | Count of educational keywords found | Integer | 0-5 |

### 3. Educational Keywords Detection

The model counts occurrences of **32 educational keywords** in the combined text:

```python
educational_keywords = [
    'tutorial', 'lesson', 'learn', 'course', 'education', 'teach', 'how to',
    'explained', 'guide', 'training', 'study', 'lecture', 'class', 'exam',
    'homework', 'university', 'school', 'college', 'academic', 'research',
    'science', 'math', 'physics', 'chemistry', 'biology', 'history',
    'programming', 'coding', 'python', 'javascript', 'computer', 'technology'
]
```

**Keyword Matching Rules:**
- Case-insensitive substring matching
- Counts total occurrences across title and channel
- Multiple instances of same keyword count separately
- Phrases like "how to" count as one keyword

## TF-IDF Text Processing

### Configuration
- **Max Features**: 5,000 most important terms
- **N-gram Range**: Unigrams (1) and Bigrams (1,2)
- **Min Document Frequency**: 2 (terms must appear in at least 2 documents)
- **Max Document Frequency**: 0.8 (ignore terms in >80% of documents)
- **Stop Words**: English stop words removed
- **Token Pattern**: Only alphanumeric tokens (`\b[a-zA-Z][a-zA-Z0-9]*\b`)

### Vocabulary Size
- **Training Vocabulary**: 3,687 unique terms
- **Final Feature Vector**: 3,687 TF-IDF values + 5 numerical features = 3,692 total features

## Input Data Structure

### For Single Prediction
```python
# Input format
video_data = {
    'title': 'Python Programming Tutorial for Beginners',
    'channelName': 'CodeWithMosh'
}
```

### For Batch Prediction
```python
# Input format for multiple videos
videos_data = [
    {'title': 'Python Programming Tutorial for Beginners', 'channelName': 'CodeWithMosh'},
    {'title': 'Funny Cat Videos Compilation 2024', 'channelName': 'FunnyPets'},
    {'title': 'Introduction to Machine Learning', 'channelName': 'MIT OpenCourseWare'}
]
```

### DataFrame Format (Python)
```python
import pandas as pd

df = pd.DataFrame({
    'title': ['Python Programming Tutorial for Beginners', 'Funny Cat Videos Compilation 2024'],
    'channelName': ['CodeWithMosh', 'FunnyPets']
})
```

## Model Output

### Prediction Format
```python
# Single prediction output
prediction = 1  # 0 = Non-Educational, 1 = Educational
probability = 0.986  # Confidence score (0.0 - 1.0)

# Complete output structure
result = {
    'prediction': 1,
    'label': 'Educational',
    'confidence': 0.986,
    'probabilities': {
        'non_educational': 0.014,
        'educational': 0.986
    }
}
```

## Data Quality Requirements

### Optimal Input Characteristics
- **Title Length**: 20-100 characters (typical YouTube titles)
- **Channel Length**: 5-30 characters (typical channel names)
- **Language**: English text (model trained on English content)
- **Content Type**: YouTube video metadata

### Expected Performance by Input Quality

| Input Quality | Expected Accuracy | Notes |
|---------------|-------------------|-------|
| High-quality YouTube data | 93%+ | Clean titles, established channels |
| Moderate-quality data | 85-92% | Some missing info, unusual formatting |
| Low-quality data | 70-84% | Significant missing data, non-English |

## Common Edge Cases

### Handling Missing/Invalid Data
```python
# Missing title
{'title': None, 'channelName': 'CodeWithMosh'}  # Will use empty string for title

# Missing channel
{'title': 'Python Tutorial', 'channelName': None}  # Will use empty string for channel

# Empty strings
{'title': '', 'channelName': 'CodeWithMosh'}  # Valid but lower confidence

# Special characters
{'title': 'Python Tutorial!!! (2024)', 'channelName': 'Code@Academy'}  # Handled by preprocessing
```

### International Content
- **Non-English**: Model may work but accuracy will be lower
- **Mixed Languages**: English portions will be processed, others ignored
- **Special Characters**: Unicode characters removed during preprocessing

## Implementation Examples

### JavaScript (for Chrome Extension)
```javascript
function preprocessText(text) {
    if (!text) return "";
    return text.toLowerCase()
               .replace(/[^a-zA-Z0-9\s]/g, ' ')
               .replace(/\s+/g, ' ')
               .trim();
}

function extractFeatures(title, channelName) {
    const titleClean = preprocessText(title);
    const channelClean = preprocessText(channelName);
    const combinedText = titleClean + ' ' + channelClean;
    
    return {
        combined_text: combinedText,
        title_word_count: titleClean.split(' ').length,
        channel_word_count: channelClean.split(' ').length,
        title_char_count: titleClean.length,
        channel_char_count: channelClean.length,
        edu_keywords_total: countEducationalKeywords(combinedText)
    };
}
```

### Python (for Server/API)
```python
def prepare_video_for_prediction(title, channel_name):
    """Prepare video data in the exact format expected by the model"""
    
    # Create DataFrame with the required structure
    data = pd.DataFrame({
        'title': [title],
        'channelName': [channel_name],
        'title_clean': [preprocess_text(title)],
        'channel_clean': [preprocess_text(channel_name)]
    })
    
    # Add derived features
    data['combined_text'] = data['title_clean'] + ' ' + data['channel_clean']
    data['title_word_count'] = data['title_clean'].str.split().str.len()
    data['channel_word_count'] = data['channel_clean'].str.split().str.len()
    data['title_char_count'] = data['title_clean'].str.len()
    data['channel_char_count'] = data['channel_clean'].str.len()
    data['edu_keywords_total'] = data['combined_text'].apply(count_educational_keywords)
    
    return data
```

## Version Information

- **Document Version**: 1.0
- **Model Version**: educational_video_classifier.joblib (2025-09-02)
- **Last Updated**: September 22, 2025
- **Compatibility**: Chrome Extension, Python API, JavaScript implementations

## Contact & Support

For questions about model input format or implementation:
- Review the Jupyter notebook: `model/educational_video_classification.ipynb`
- Check prediction script: `predict_video.py`
- Examine model metadata: `model/trained_models/model_metadata.json`
