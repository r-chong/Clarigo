// 1. Create a class to hold your classifier
class MyClarigoClassifier {
    constructor() {
        // Initialize variables here

    }
    
    // 2. Your preprocessing function
    preprocessText(text) {

        if (!text) {
            return '';
        }

        // Lowercase
        text = text.toLowerCase();

        // Remove special characters
        text = text.replace(/[^a-zA-Z0-9\s]/g, ' ');

        // Collapse multiple spaces
        text = text.replace(/\s+/g, ' ');

        // Remove leading/trailing spaces
        text = text.trim();

        return text;
    }

}
const classifier = new MyClarigoClassifier();
console.log("Test 1:", classifier.preprocessText('Hello, World!'));
console.log("Test 2:", classifier.preprocessText('Python Tutorial - Learn Programming!!! 🐍'));
console.log("Test 3:", classifier.preprocessText('CodeWith_Mosh'));
console.log("Test 4:", classifier.preprocessText('   Multiple    Spaces   '));