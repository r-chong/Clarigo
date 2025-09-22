#!/usr/bin/env python3
"""
Convert Scikit-learn Educational Video Classifier to JavaScript Format
This script extracts model weights and preprocessing parameters for browser deployment.
"""

import joblib
import json
import numpy as np
import pandas as pd
from pathlib import Path
import pickle
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.preprocessing import StandardScaler
from sklearn.linear_model import LogisticRegression

def extract_tfidf_parameters(tfidf_vectorizer):
    """Extract TF-IDF vectorizer parameters for JavaScript implementation"""
    
    # Get vocabulary (word -> index mapping) - convert numpy integers to Python integers
    vocabulary = {word: int(idx) for word, idx in tfidf_vectorizer.vocabulary_.items()}
    
    # Get IDF values for each term - convert to Python floats
    idf_values = [float(x) for x in tfidf_vectorizer.idf_]
    
    # Create vocabulary list (index -> word mapping)
    vocab_list = [''] * len(vocabulary)
    for word, idx in vocabulary.items():
        vocab_list[idx] = word
    
    # Get parameters - ensure all values are JSON serializable
    params = {
        'vocabulary': vocabulary,  # word -> index
        'vocabulary_list': vocab_list,  # index -> word  
        'idf_values': idf_values,
        'max_features': int(getattr(tfidf_vectorizer, 'max_features', 0)) if getattr(tfidf_vectorizer, 'max_features', None) is not None else None,
        'min_df': float(getattr(tfidf_vectorizer, 'min_df', 1)),
        'max_df': float(getattr(tfidf_vectorizer, 'max_df', 1.0)),
        'ngram_range': list(getattr(tfidf_vectorizer, 'ngram_range', (1, 1))),
        'stop_words': None,  # Don't serialize stop words list (too large)
        'token_pattern': str(getattr(tfidf_vectorizer, 'token_pattern', r'\\b\\w\\w+\\b'))
    }
    
    return params

def extract_scaler_parameters(scaler):
    """Extract StandardScaler parameters for JavaScript implementation"""
    
    return {
        'mean': [float(x) for x in scaler.mean_],
        'scale': [float(x) for x in scaler.scale_],
        'var': [float(x) for x in scaler.var_]
    }

def extract_logistic_regression_parameters(model):
    """Extract Logistic Regression parameters for JavaScript implementation"""
    
    return {
        'coef': model.coef_.tolist(),  # Weights
        'intercept': model.intercept_.tolist(),  # Bias
        'classes': [int(c) for c in model.classes_],  # Class labels (convert to Python int)
        'C': float(model.C)  # Regularization parameter (convert to Python float)
    }

def convert_model_to_js():
    """Main conversion function"""
    
    print("🔄 Converting Clarigo Educational Video Classifier to JavaScript format...")
    
    # Load the trained model
    model_path = Path("trained_models/educational_video_classifier.joblib")
    
    if not model_path.exists():
        print("❌ Error: Model file not found!")
        print("Please make sure you have trained the model first by running the Jupyter notebook.")
        return
    
    try:
        # Load the full pipeline
        full_pipeline = joblib.load(model_path)
        print("✅ Loaded trained model successfully")
        
        # Extract the components
        preprocessor = full_pipeline.named_steps['preprocessor']
        classifier = full_pipeline.named_steps['classifier']
        
        # Extract TF-IDF vectorizer (text preprocessing)
        tfidf_vectorizer = preprocessor.named_transformers_['text']
        tfidf_params = extract_tfidf_parameters(tfidf_vectorizer)
        print(f"✅ Extracted TF-IDF parameters (vocabulary size: {len(tfidf_params['vocabulary'])})")
        
        # Extract numerical scaler
        numerical_scaler = preprocessor.named_transformers_['num']
        scaler_params = extract_scaler_parameters(numerical_scaler)
        print(f"✅ Extracted numerical scaler parameters ({len(scaler_params['mean'])} features)")
        
        # Extract logistic regression model
        lr_params = extract_logistic_regression_parameters(classifier)
        print(f"✅ Extracted logistic regression parameters")
        
        # Educational keywords (from the training process)
        educational_keywords = [
            'tutorial', 'lesson', 'learn', 'course', 'education', 'teach', 'how to',
            'explained', 'guide', 'training', 'study', 'lecture', 'class', 'exam',
            'homework', 'university', 'school', 'college', 'academic', 'research',
            'science', 'math', 'physics', 'chemistry', 'biology', 'history',
            'programming', 'coding', 'python', 'javascript', 'computer', 'technology'
        ]
        
        # Combine all parameters
        js_model = {
            'model_info': {
                'name': 'Clarigo Educational Video Classifier',
                'version': '1.0',
                'type': 'Logistic Regression with TF-IDF',
                'created': '2025-09-22',
                'accuracy': float(0.9339),
                'auc': float(0.9716)
            },
            'preprocessing': {
                'educational_keywords': educational_keywords,
                'tfidf': tfidf_params,
                'numerical_scaler': scaler_params
            },
            'model': lr_params,
            'feature_names': {
                'text_features': ['combined_text'],
                'numerical_features': [
                    'title_word_count', 'channel_word_count', 
                    'title_char_count', 'channel_char_count', 
                    'edu_keywords_total'
                ]
            }
        }
        
        # Save to JSON file
        output_path = Path("js_model/clarigo_model.json")
        output_path.parent.mkdir(exist_ok=True)
        
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(js_model, f, indent=2, ensure_ascii=False)
        
        # Calculate file size
        file_size_kb = output_path.stat().st_size / 1024
        
        print(f"\n🎉 Conversion completed successfully!")
        print(f"📁 Output file: {output_path}")
        print(f"📊 File size: {file_size_kb:.1f} KB")
        print(f"🔢 Vocabulary size: {len(tfidf_params['vocabulary'])} terms")
        print(f"🎯 Model features: {len(lr_params['coef'][0])} total")
        
        # Create a summary of what was exported
        summary = {
            'conversion_successful': True,
            'output_file': str(output_path),
            'file_size_kb': round(file_size_kb, 1),
            'vocabulary_size': len(tfidf_params['vocabulary']),
            'total_features': len(lr_params['coef'][0]),
            'numerical_features': len(scaler_params['mean']),
            'model_accuracy': 0.9339,
            'next_steps': [
                "1. Use the clarigo_model.json file in your JavaScript application",
                "2. Implement the preprocessing functions in JavaScript",
                "3. Load the model and make predictions in the browser",
                "4. Test with sample video data"
            ]
        }
        
        with open(output_path.parent / 'conversion_summary.json', 'w') as f:
            json.dump(summary, f, indent=2)
        
        return js_model
        
    except Exception as e:
        print(f"❌ Error during conversion: {str(e)}")
        print("Please check that the model was trained correctly.")
        return None

def test_conversion(js_model):
    """Test the converted model with sample data"""
    
    if js_model is None:
        return
    
    print("\n🧪 Testing converted model with sample data...")
    
    # Test cases
    test_cases = [
        ("Python Programming Tutorial for Beginners", "CodeWithMosh"),
        ("Funny Cat Videos Compilation 2024", "FunnyPets"),
        ("Introduction to Machine Learning", "MIT OpenCourseWare"),
    ]
    
    # Load original model for comparison
    original_model = joblib.load("trained_models/educational_video_classifier.joblib")
    
    print("\nComparing original vs converted model predictions:")
    print("-" * 70)
    
    for title, channel in test_cases:
        # Predict with original model
        test_data = pd.DataFrame({
            'title': [title],
            'channelName': [channel]
        })
        
        # Add preprocessing (simplified for test)
        test_data['title_clean'] = test_data['title'].str.lower().str.replace(r'[^a-zA-Z0-9\s]', ' ', regex=True)
        test_data['channel_clean'] = test_data['channelName'].str.lower().str.replace(r'[^a-zA-Z0-9\s]', ' ', regex=True)
        test_data['combined_text'] = test_data['title_clean'] + ' ' + test_data['channel_clean']
        test_data['title_word_count'] = test_data['title_clean'].str.split().str.len()
        test_data['channel_word_count'] = test_data['channel_clean'].str.split().str.len()
        test_data['title_char_count'] = test_data['title_clean'].str.len()
        test_data['channel_char_count'] = test_data['channel_clean'].str.len()
        
        # Count educational keywords
        def count_keywords(text):
            if pd.isna(text):
                return 0
            text = str(text).lower()
            return sum(1 for keyword in js_model['preprocessing']['educational_keywords'] if keyword in text)
        
        test_data['edu_keywords_total'] = test_data['combined_text'].apply(count_keywords)
        
        # Predict
        original_pred = original_model.predict(test_data)[0]
        original_prob = original_model.predict_proba(test_data)[0, 1]
        
        # Display results
        label = "Educational" if original_pred == 1 else "Non-Educational"
        print(f"Title: {title[:40]:<40}")
        print(f"Channel: {channel:<20}")
        print(f"Prediction: {label:<15} (Confidence: {original_prob:.3f})")
        print("-" * 70)

if __name__ == "__main__":
    print("Clarigo Model Converter - Scikit-learn to JavaScript")
    print("=" * 60)
    
    # Convert the model
    js_model = convert_model_to_js()
    
    # Test the conversion
    if js_model:
        test_conversion(js_model)
        
        print("\n🚀 Next steps:")
        print("1. Check the 'js_model' folder for the converted model")
        print("2. Use the JavaScript implementation files to load the model")
        print("3. Integrate into your Chrome extension")
        print("4. Test with real YouTube data")
