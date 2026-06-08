# Clarigo Educational Video Classifier - JavaScript Implementation

Convert and run your trained scikit-learn model in the browser without TensorFlow.js!

## End-to-End Workflow (retrain → ship)

Run all commands from the repo root with the project virtualenv active. After
retraining the model in `ml/notebooks/educational_video_classification.ipynb`
(which writes `ml/trained_models/educational_video_classifier.joblib`):

```bash
# 1. Export the trained pipeline to browser-ready JSON (ml/js_model/clarigo_model.json)
python ml/scripts/model_to_js_converter.py

# 2. Verify the JS classifier matches scikit-learn exactly (REQUIRED before shipping)
python ml/scripts/parity_test.py

# 3. Copy model + classifier into the extension bundle (extension/model/)
python ml/scripts/copy_model_to_extension.py
```

The parity test (step 2) feeds identical inputs through scikit-learn and the
shipped `clarigo_classifier.js` (via Node) and fails if predicted probabilities
diverge. Always keep it green — a failure means the browser is no longer running
the model you trained.

> **Version pinning matters.** The committed `.joblib` was serialized with the
> exact library versions in `requirements.txt` (notably `scikit-learn==1.7.1`).
> Loading it under a different scikit-learn version raises
> `InconsistentVersionWarning` and can silently change results. Retrain if you
> intentionally upgrade.

### Source of truth

`ml/js_model/` is canonical: `model_to_js_converter.py` regenerates
`clarigo_model.json` there, and `clarigo_classifier.js` is hand-maintained
there. `extension/model/` is a generated copy — never edit it directly; edit in
`ml/js_model/` and re-run the copy script.

## 🚀 Quick Start

### Step 1: Convert Your Model
Run from the repo root (uses the trained `.joblib` in `ml/trained_models/`):
```bash
python ml/scripts/model_to_js_converter.py
```

This creates:
- `ml/js_model/clarigo_model.json` - Your converted model (weights, vocabulary, parameters)
- `ml/js_model/conversion_summary.json` - Conversion details

### Step 2: Use in JavaScript
```javascript
// Load the classifier
const classifier = new ClarigoClassifier();
await classifier.loadModel('./clarigo_model.json');

// Make predictions
const result = classifier.predict(
    'Python Programming Tutorial for Beginners',
    'CodeWithMosh'
);

console.log(result);
// Output: {
//   prediction: 1,
//   label: 'Educational',
//   probability: 0.986,
//   confidence: 0.986
// }
```

### Step 3: Test the Implementation
Open `test_model.html` in your browser to verify everything works correctly.

## 📁 Files Overview

| File | Purpose |
|------|---------|
| `model_to_js_converter.py` | Converts scikit-learn model to JavaScript format |
| `clarigo_classifier.js` | JavaScript implementation of the classifier |
| `clarigo_model.json` | Converted model data (created after conversion) |
| `test_model.html` | Interactive test interface |
| `README.md` | This documentation |

## 🔧 How It Works

### Conversion Process
1. **Extract Model Weights**: Gets logistic regression coefficients and intercept
2. **Export TF-IDF Vocabulary**: Saves word-to-index mapping and IDF values
3. **Save Preprocessing**: Captures text cleaning and feature engineering logic
4. **Export Scaler**: Saves numerical feature normalization parameters

### JavaScript Implementation
1. **Text Preprocessing**: Cleans and normalizes video titles/channels
2. **Feature Engineering**: Creates TF-IDF vectors and numerical features
3. **Prediction**: Applies logistic regression math in pure JavaScript
4. **No Dependencies**: Works in any modern browser without external libraries

## 🎯 Model Performance

- **Original Accuracy**: 93.4%
- **File Size**: ~500KB (model + code)
- **Prediction Speed**: < 1ms per video
- **Browser Compatibility**: All modern browsers (ES6+)

## 📊 Features Implemented

### Text Features
- ✅ TF-IDF vectorization (5000 features max)
- ✅ Unigrams and bigrams (1,2 n-gram range)
- ✅ Text preprocessing (lowercase, special character removal)
- ✅ Stop word handling

### Numerical Features
- ✅ Word count features (title, channel)
- ✅ Character count features  
- ✅ Educational keyword counting (32 keywords)
- ✅ Feature normalization (StandardScaler equivalent)

### Model Implementation
- ✅ Logistic regression prediction
- ✅ Probability calculation (sigmoid function)
- ✅ Binary classification (threshold = 0.5)
- ✅ Confidence scoring

## Chrome Extension Build

Before loading the extension, copy the classifier and model into the extension bundle (from repo root):

```bash
python ml/scripts/copy_model_to_extension.py
```

This copies `clarigo_model.json` and `clarigo_classifier.js` from `ml/js_model/` to `extension/model/`.

## 🌐 Chrome Extension Integration

### Basic Integration
```javascript
// In your Chrome extension content script
const classifier = new ClarigoClassifier();
await classifier.loadModel(chrome.runtime.getURL('model/clarigo_model.json'));

// Extract video data from YouTube DOM
function classifyVideo(videoElement) {
    const title = videoElement.querySelector('#video-title').textContent;
    const channel = videoElement.querySelector('#channel-name').textContent;
    
    const result = classifier.predict(title, channel);
    
    // Update UI based on prediction
    if (result.prediction === 1) {
        videoElement.classList.add('educational-video');
        // Add educational badge
    }
}
```

### Manifest.json Setup
```json
{
    "manifest_version": 3,
    "name": "Clarigo Educational Video Detector",
    "permissions": ["activeTab"],
    "content_scripts": [{
        "matches": ["*://www.youtube.com/*"],
        "js": ["model/clarigo_classifier.js", "content.js"]
    }],
    "web_accessible_resources": [{
        "resources": ["model/clarigo_model.json"],
        "matches": ["*://www.youtube.com/*"]
    }]
}
```

## 📋 API Reference

### ClarigoClassifier Class

#### Methods

##### `loadModel(modelPath)`
Loads the converted model from JSON file.
- **Parameters**: `modelPath` (string) - Path to clarigo_model.json
- **Returns**: Promise<boolean> - Success status

##### `predict(title, channelName)`
Predicts if a video is educational.
- **Parameters**: 
  - `title` (string) - Video title
  - `channelName` (string) - Channel name
- **Returns**: Object with prediction results

##### `predictBatch(videos)`
Predicts multiple videos at once.
- **Parameters**: `videos` (Array) - Array of {title, channelName} objects
- **Returns**: Array of prediction results

##### `getModelInfo()`
Returns model metadata and statistics.
- **Returns**: Object with model information

#### Prediction Result Format
```javascript
{
    prediction: 1,              // 0 or 1
    label: 'Educational',       // 'Educational' or 'Non-Educational'
    probability: 0.986,         // Educational probability (0-1)
    confidence: 0.986,          // Confidence in prediction (0-1)
    probabilities: {
        educational: 0.986,
        nonEducational: 0.014
    },
    debug: {
        titleClean: "python programming tutorial for beginners",
        channelClean: "codewithmosh",
        combinedText: "python programming tutorial for beginners codewithmosh",
        eduKeywords: 2,
        featureCount: 3692
    }
}
```

## 🔍 Debugging & Troubleshooting

### Common Issues

1. **Model not loading**: Check file path and ensure clarigo_model.json exists
2. **Poor predictions**: Verify input text quality and check debug output
3. **Browser errors**: Ensure modern browser with ES6 support

### Debug Information
Enable debug output to see:
- Cleaned text after preprocessing
- Educational keywords found
- Feature vector size
- Raw numerical features

### Performance Monitoring
```javascript
const start = performance.now();
const result = classifier.predict(title, channel);
const duration = performance.now() - start;
console.log(`Prediction took ${duration.toFixed(2)}ms`);
```

## 🆚 Comparison: TensorFlow.js vs This Approach

| Aspect | TensorFlow.js | This Implementation |
|--------|---------------|-------------------|
| **File Size** | ~2-5MB | ~500KB |
| **Dependencies** | TensorFlow.js library | None |
| **Loading Time** | 2-5 seconds | < 500ms |
| **Prediction Speed** | 5-10ms | < 1ms |
| **Model Support** | Limited sklearn support | Perfect sklearn compatibility |
| **Customization** | Limited | Full control |
| **Debugging** | Difficult | Easy |

## 🚀 Next Steps

1. **Test Conversion**: Run the converter and test with sample data
2. **Integrate with Extension**: Add to your Chrome extension
3. **Performance Tune**: Monitor and optimize for your use case
4. **Scale Up**: Handle batch processing for many videos
5. **Add Features**: Extend with additional educational indicators

## 📞 Support

If you encounter issues:
1. Check the test HTML file works correctly
2. Verify your original model was trained properly
3. Ensure input data format matches expectations
4. Review browser console for error messages

The converted model maintains the same accuracy as your original scikit-learn model while running efficiently in any browser!
