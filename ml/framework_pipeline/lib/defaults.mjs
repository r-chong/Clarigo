export const MODEL_SCHEMA_VERSION = 2;
export const RANDOM_SEED = 42;
export const DEFAULT_DATASET_PATH = 'ml/data/processed_data/master_dataset.jsonl';
export const DEFAULT_EXPORT_PATH = 'ml/framework_pipeline/artifacts/clarigo_browser_model.json';

export const DEFAULT_TRAINING_CONFIG = {
  trainRatio: 0.8,
  maxFeatures: 5000,
  ngramRange: [1, 2],
  epochs: 220,
  learningRate: 0.035,
  weightDecay: 0.0015,
  reportEvery: 20,
};

export const DEFAULT_RUNTIME_THRESHOLDS = {
  aggressive: 0.72,
  balanced: 0.58,
  conservative: 0.48,
};

export const NUMERICAL_FEATURE_NAMES = [
  'title_word_count',
  'channel_word_count',
  'title_char_count',
  'channel_char_count',
  'edu_keywords_total',
];

export const EDUCATIONAL_KEYWORDS = [
  'tutorial',
  'lesson',
  'learn',
  'course',
  'education',
  'teach',
  'how to',
  'explained',
  'guide',
  'training',
  'study',
  'lecture',
  'class',
  'exam',
  'homework',
  'university',
  'school',
  'college',
  'academic',
  'research',
  'science',
  'math',
  'physics',
  'chemistry',
  'biology',
  'history',
  'programming',
  'coding',
  'python',
  'javascript',
  'computer',
  'technology',
];

export const STOP_WORDS = new Set([
  'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and',
  'any', 'are', 'as', 'at', 'be', 'because', 'been', 'before', 'being', 'below',
  'between', 'both', 'but', 'by', 'can', 'did', 'do', 'does', 'doing', 'down',
  'during', 'each', 'few', 'for', 'from', 'further', 'had', 'has', 'have', 'having',
  'he', 'her', 'here', 'hers', 'herself', 'him', 'himself', 'his', 'how', 'i',
  'if', 'in', 'into', 'is', 'it', 'its', 'itself', 'just', 'me', 'more', 'most',
  'my', 'myself', 'no', 'nor', 'not', 'now', 'of', 'off', 'on', 'once', 'only',
  'or', 'other', 'our', 'ours', 'ourselves', 'out', 'over', 'own', 'same', 'she',
  'should', 'so', 'some', 'such', 'than', 'that', 'the', 'their', 'theirs',
  'them', 'themselves', 'then', 'there', 'these', 'they', 'this', 'those', 'through',
  'to', 'too', 'under', 'until', 'up', 'very', 'was', 'we', 'were', 'what', 'when',
  'where', 'which', 'while', 'who', 'whom', 'why', 'with', 'would', 'you', 'your',
  'yours', 'yourself', 'yourselves',
]);
