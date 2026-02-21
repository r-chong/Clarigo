/**
 * Clarigo Educational Video Classifier - JavaScript Implementation
 * Loads and runs the converted scikit-learn model in the browser
 *
 * --- Public API (extension contract) ---
 * Consumers (e.g. Chrome extension) should rely only on:
 *   - loadModel(modelPath: string) -> Promise<boolean>
 *   - predict(title: string, channelName: string) -> { prediction: 0|1, confidence: number, ... }
 *   - isLoaded: boolean
 */

class ClarigoClassifier {
    constructor() {
        this.model = null;
        this.isLoaded = false;
    }

    /**
     * Load the converted model from JSON file
     * @param {string} modelPath - Path to the clarigo_model.json file
     */
    async loadModel(modelPath = './clarigo_model.json') {
        try {
            console.log('🔄 Loading Clarigo Educational Video Classifier...');
            
            const response = await fetch(modelPath);
            if (!response.ok) {
                throw new Error(`Failed to load model: ${response.status}`);
            }
            
            this.model = await response.json();
            this.isLoaded = true;
            
            console.log('✅ Model loaded successfully!');
            console.log(`📊 Vocabulary size: ${Object.keys(this.model.preprocessing.tfidf.vocabulary).length}`);
            console.log(`🎯 Model accuracy: ${(this.model.model_info.accuracy * 100).toFixed(1)}%`);
            
            return true;
        } catch (error) {
            console.error('❌ Error loading model:', error);
            this.isLoaded = false;
            return false;
        }
    }

    /**
     * Preprocess text (clean and normalize)
     * @param {string} text - Raw text to preprocess
     * @returns {string} - Cleaned text
     */
    preprocessText(text) {
        if (!text) return "";
        
        return text
            .toLowerCase()                           // Convert to lowercase
            .replace(/[^a-zA-Z0-9\s]/g, ' ')        // Remove special characters
            .replace(/\s+/g, ' ')                   // Collapse multiple spaces
            .trim();                                // Remove leading/trailing spaces
    }

    /**
     * Count educational keywords in text
     * @param {string} text - Text to analyze
     * @returns {number} - Number of educational keywords found
     */
    countEducationalKeywords(text) {
        if (!text || !this.model) return 0;
        
        const keywords = this.model.preprocessing.educational_keywords;
        const lowerText = text.toLowerCase();
        
        return keywords.reduce((count, keyword) => {
            return count + (lowerText.includes(keyword) ? 1 : 0);
        }, 0);
    }

    /**
     * Create n-grams from text
     * @param {string[]} tokens - Array of words
     * @param {number} n - N-gram size (1 for unigrams, 2 for bigrams)
     * @returns {string[]} - Array of n-grams
     */
    createNGrams(tokens, n) {
        if (n === 1) return tokens;
        
        const ngrams = [];
        for (let i = 0; i <= tokens.length - n; i++) {
            ngrams.push(tokens.slice(i, i + n).join(' '));
        }
        return ngrams;
    }

    /**
     * Convert text to TF-IDF vector
     * @param {string} text - Text to vectorize
     * @returns {number[]} - TF-IDF vector
     */
    textToTfIdf(text) {
        if (!this.model || !text) {
            return [];
        }

        const { vocabulary, idf_values, ngram_range } = this.model.preprocessing.tfidf;
        const tokens = text.split(' ').filter(token => token.length > 0);
        
        // Create term frequency map
        const termFreq = {};
        
        // Add unigrams and bigrams based on ngram_range
        for (let n = ngram_range[0]; n <= ngram_range[1]; n++) {
            const ngrams = this.createNGrams(tokens, n);
            ngrams.forEach(ngram => {
                if (vocabulary.hasOwnProperty(ngram)) {
                    termFreq[ngram] = (termFreq[ngram] || 0) + 1;
                }
            });
        }

        // Convert to TF-IDF vector
        const tfidfVector = new Array(idf_values.length).fill(0);
        
        for (const [term, freq] of Object.entries(termFreq)) {
            if (vocabulary.hasOwnProperty(term)) {
                const index = vocabulary[term];
                const tf = freq / tokens.length; // Term frequency
                const idf = idf_values[index];   // Inverse document frequency
                tfidfVector[index] = tf * idf;
            }
        }

        return tfidfVector;
    }

    /**
     * Normalize numerical features using the trained scaler
     * @param {number[]} features - Raw numerical features
     * @returns {number[]} - Normalized features
     */
    normalizeNumericalFeatures(features) {
        if (!this.model) return features;

        const { mean, scale } = this.model.preprocessing.numerical_scaler;
        
        return features.map((value, index) => {
            return (value - mean[index]) / scale[index];
        });
    }

    /**
     * Extract all features from video title and channel
     * @param {string} title - Video title
     * @param {string} channelName - Channel name
     * @returns {Object} - Extracted features
     */
    extractFeatures(title, channelName) {
        // Preprocess text
        const titleClean = this.preprocessText(title);
        const channelClean = this.preprocessText(channelName);
        const combinedText = titleClean + ' ' + channelClean;

        // Text features (TF-IDF)
        const textFeatures = this.textToTfIdf(combinedText);

        // Numerical features
        const numericalFeatures = [
            titleClean.split(' ').filter(w => w.length > 0).length,  // title_word_count
            channelClean.split(' ').filter(w => w.length > 0).length, // channel_word_count
            titleClean.length,                                        // title_char_count
            channelClean.length,                                      // channel_char_count
            this.countEducationalKeywords(combinedText)               // edu_keywords_total
        ];

        // Normalize numerical features
        const normalizedNumerical = this.normalizeNumericalFeatures(numericalFeatures);

        return {
            text: textFeatures,
            numerical: normalizedNumerical,
            combined: [...textFeatures, ...normalizedNumerical],
            debug: {
                titleClean,
                channelClean,
                combinedText,
                rawNumerical: numericalFeatures,
                eduKeywords: this.countEducationalKeywords(combinedText)
            }
        };
    }

    /**
     * Apply logistic regression prediction
     * @param {number[]} features - Feature vector
     * @returns {Object} - Prediction results
     */
    predictWithLogisticRegression(features) {
        const { coef, intercept } = this.model.model;
        
        // Calculate linear combination: w·x + b
        const linearCombination = features.reduce((sum, feature, index) => {
            return sum + (feature * coef[0][index]);
        }, intercept[0]);

        // Apply sigmoid function to get probability
        const probability = 1 / (1 + Math.exp(-linearCombination));
        
        // Make binary prediction (threshold = 0.5)
        const prediction = probability >= 0.5 ? 1 : 0;

        return {
            prediction,
            probability,
            confidence: prediction === 1 ? probability : (1 - probability),
            linearCombination
        };
    }

    /**
     * Predict if a video is educational
     * @param {string} title - Video title
     * @param {string} channelName - Channel name
     * @returns {Object} - Prediction results
     */
    predict(title, channelName) {
        if (!this.isLoaded) {
            throw new Error('Model not loaded. Call loadModel() first.');
        }

        if (!title || !channelName) {
            console.warn('Missing title or channel name. Prediction quality may be reduced.');
        }

        // Extract features
        const features = this.extractFeatures(title || '', channelName || '');
        
        // Make prediction
        const result = this.predictWithLogisticRegression(features.combined);

        return {
            prediction: result.prediction,
            label: result.prediction === 1 ? 'Educational' : 'Non-Educational',
            probability: result.probability,
            confidence: result.confidence,
            probabilities: {
                educational: result.probability,
                nonEducational: 1 - result.probability
            },
            debug: {
                ...features.debug,
                featureCount: features.combined.length,
                linearCombination: result.linearCombination
            }
        };
    }

    /**
     * Predict multiple videos at once
     * @param {Array} videos - Array of {title, channelName} objects
     * @returns {Array} - Array of prediction results
     */
    predictBatch(videos) {
        return videos.map(video => ({
            ...video,
            prediction: this.predict(video.title, video.channelName)
        }));
    }

    /**
     * Get model information
     * @returns {Object} - Model metadata
     */
    getModelInfo() {
        if (!this.isLoaded) return null;
        
        return {
            ...this.model.model_info,
            vocabularySize: Object.keys(this.model.preprocessing.tfidf.vocabulary).length,
            totalFeatures: this.model.model.coef[0].length,
            numericalFeatures: this.model.preprocessing.numerical_scaler.mean.length,
            educationalKeywords: this.model.preprocessing.educational_keywords.length
        };
    }
}

// Export for use in different environments
if (typeof module !== 'undefined' && module.exports) {
    // Node.js environment
    module.exports = ClarigoClassifier;
} else if (typeof window !== 'undefined') {
    // Browser environment
    window.ClarigoClassifier = ClarigoClassifier;
}

// Example usage:
/*
// Initialize classifier
const classifier = new ClarigoClassifier();

// Load model
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
//   confidence: 0.986,
//   ...
// }
*/
