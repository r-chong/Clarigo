// Listen for messages from the content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "VIDEO_METADATA") {
        // Process the metadata and send it to your ML model
        processVideoMetadata(message.data, sender.tab.id);
        // Keep return true since processVideoMetadata is async
        return true;
    }
});

// Flag to enable testing mode (no actual ML API calls)
const TESTING_MODE = true;

// Function to process video metadata and communicate with ML model
async function processVideoMetadata(metadata, tabId) {
    console.log("Received metadata:", metadata);

    if (TESTING_MODE) {
        // For testing: classify videos based on simple rules
        let isEducational = true;
        let reason = "Educational content";

        // Example test rule: If title contains certain keywords, mark as non-educational
        const nonEducationalKeywords = [
            "prank",
            "funny",
            "gameplay",
            "reaction",
            "unboxing",
        ];
        if (metadata.title) {
            const titleLower = metadata.title.toLowerCase();
            for (const keyword of nonEducationalKeywords) {
                if (titleLower.includes(keyword)) {
                    isEducational = false;
                    reason = `Contains non-educational keyword: ${keyword}`;
                    break;
                }
            }
        }

        // For testing, block some percentage of videos randomly
        if (Math.random() < 0.3 && isEducational) {
            // 30% chance to block even if it passed the keyword check
            isEducational = false;
            reason = "Random testing block";
        }

        // Send blocking message if non-educational
        if (!isEducational) {
            console.log("Blocking video:", reason);
            try {
                chrome.tabs.sendMessage(
                    tabId,
                    {
                        type: "BLOCK_VIDEO",
                        data: {
                            reason: reason,
                        },
                    },
                    (response) => {
                        if (chrome.runtime.lastError) {
                            console.error(
                                "Error sending message:",
                                chrome.runtime.lastError
                            );
                        }
                    }
                );
            } catch (error) {
                console.error("Error in sendMessage:", error);
            }
        } else {
            console.log("Video passed checks - not blocking");
        }
        return;
    }

    // Normal ML model path (when not in testing mode)
    try {
        // TODO: Replace with your actual ML model endpoint
        const mlEndpoint = "https://your-ml-model-endpoint.com/predict";

        // Use XMLHttpRequest instead of fetch to avoid CORS issues in extensions
        const xhr = new XMLHttpRequest();
        xhr.open("POST", mlEndpoint, true);
        xhr.setRequestHeader("Content-Type", "application/json");
        xhr.onreadystatechange = function () {
            if (xhr.readyState === 4) {
                if (xhr.status === 200) {
                    try {
                        const result = JSON.parse(xhr.responseText);
                        if (result.isEducational === false) {
                            // Send message to content script to block the video
                            chrome.tabs.sendMessage(tabId, {
                                type: "BLOCK_VIDEO",
                                data: {
                                    reason: result.reason,
                                },
                            });
                        }
                    } catch (parseError) {
                        console.error("Error parsing response:", parseError);
                    }
                } else {
                    console.error(
                        "HTTP request failed with status:",
                        xhr.status
                    );
                }
            }
        };
        xhr.onerror = function () {
            console.error("Network error occurred");
        };
        xhr.send(JSON.stringify(metadata));
    } catch (error) {
        console.error("Error processing video metadata:", error);
    }
}
