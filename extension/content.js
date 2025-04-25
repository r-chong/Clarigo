// YouTube video metadata extractor
class YouTubeMetadataExtractor {
    constructor() {
        this.lastUrl = "";
        this.isBlocked = false;
        this.blockReason = "";
        this.observer = null;
        this.processedVideos = new Set(); // Keep track of processed videos
        this.scrollObserver = null; // For infinite scroll

        // Wait for document to be ready before setting up
        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", () =>
                this.initialize()
            );
        } else {
            this.initialize();
        }
    }

    initialize() {
        this.setupMessageListener();
        this.setupMutationObserver();
        this.setupScrollObserver();
        this.processCurrentPage();
        this.observePageChanges();
    }

    observePageChanges() {
        // Watch for URL changes (YouTube is a SPA)
        setInterval(() => {
            if (window.location.href !== this.lastUrl) {
                this.lastUrl = window.location.href;
                this.isBlocked = false; // Reset blocked status on page change
                this.processCurrentPage();
            }
        }, 1000);
    }

    setupMessageListener() {
        // Listen for messages from the background script
        chrome.runtime.onMessage.addListener(
            (message, sender, sendResponse) => {
                console.log("Content script received message:", message);

                if (message.type === "BLOCK_VIDEO") {
                    this.isBlocked = true;
                    this.blockReason =
                        message.data.reason || "Not educational content";
                    this.showBlockedMessage();

                    if (sendResponse) {
                        sendResponse({ status: "received" });
                    }
                }
                return true;
            }
        );

        // Set up window message listener for iframe communication
        window.addEventListener("message", (event) => {
            if (event.data && event.data.type === "OVERRIDE_BLOCK") {
                this.isBlocked = false;
                const blocker = document.getElementById(
                    "clarigo-blocker-container"
                );
                if (blocker) {
                    blocker.remove();
                }
                const videoElement = document.querySelector("video");
                if (videoElement) {
                    try {
                        videoElement.play();
                    } catch (e) {
                        console.error("Error playing video:", e);
                    }
                }
            }
        });
    }

    setupMutationObserver() {
        try {
            if (this.observer) {
                this.observer.disconnect();
            }

            this.observer = new MutationObserver((mutations) => {
                if (this.isBlocked && this.isVideoPage()) {
                    this.showBlockedMessage();
                }

                // Check for new videos when content changes
                console.log("Content changed, checking for new videos...");
                this.observeNewVideos();
            });

            if (document.body) {
                this.observer.observe(document.body, {
                    childList: true,
                    subtree: true,
                });
                console.log("MutationObserver set up successfully");
            } else {
                console.log("Document body not ready, waiting...");
                const bodyObserver = new MutationObserver(
                    (mutations, observer) => {
                        if (document.body) {
                            observer.disconnect();
                            this.setupMutationObserver();
                        }
                    }
                );

                bodyObserver.observe(document.documentElement, {
                    childList: true,
                    subtree: true,
                });
            }
        } catch (error) {
            console.error("Error setting up MutationObserver:", error);
        }
    }

    setupScrollObserver() {
        // Create IntersectionObserver for infinite scroll
        this.scrollObserver = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        console.log("Video came into view:", entry.target);
                        const videoElement = entry.target;
                        const videoId = this.getVideoId(videoElement);

                        // Only process if we haven't seen this video before
                        if (videoId && !this.processedVideos.has(videoId)) {
                            console.log(
                                "Processing new video with ID:",
                                videoId
                            );
                            this.processedVideos.add(videoId);
                            this.processVideoElement(videoElement);
                        } else {
                            console.log(
                                "Video already processed or no ID found:",
                                videoId
                            );
                        }
                    }
                });
            },
            {
                root: null,
                rootMargin: "100px", // Increased margin to detect earlier
                threshold: 0.1,
            }
        );

        // Start observing existing videos
        this.observeNewVideos();
    }

    observeNewVideos() {
        // For home page and search results
        const videoElements = document.querySelectorAll(
            "ytd-video-renderer, ytd-rich-item-renderer, ytd-grid-video-renderer"
        );
        console.log("Found video elements to observe:", videoElements.length);
        videoElements.forEach((elem) => {
            this.scrollObserver.observe(elem);
        });
    }

    getVideoId(element) {
        // Try to get video ID from various possible elements
        const videoUrl =
            element.querySelector("a#thumbnail")?.href ||
            element.querySelector("a#video-title")?.href;
        if (videoUrl) {
            const match = videoUrl.match(/[?&]v=([^&]+)/);
            return match ? match[1] : null;
        }
        return null;
    }

    processVideoElement(element) {
        const metadata = {
            type: "scroll_video",
            title: this.getTextContent(element, "#video-title"),
            channel: this.getTextContent(element, "#channel-name"),
            description: this.getSearchResultDescription(element),
            videoCategory: this.getSearchResultCategory(element),
            videoId: this.getVideoId(element),
        };

        console.log("Extracted metadata for scrolled video:", metadata);
        if (metadata.title) {
            console.log("Sending metadata to ML model for:", metadata.title);
            this.sendToMLModel(metadata);
        } else {
            console.log("Skipping video - no title found");
        }
    }

    showBlockedMessage() {
        // Only proceed if we're on a video page
        if (!this.isVideoPage()) return;

        console.log("Showing blocked message for reason:", this.blockReason);

        try {
            // Find any existing video players
            const videoElement = document.querySelector("video");
            if (videoElement) {
                try {
                    videoElement.pause();
                } catch (e) {
                    console.error("Error pausing video:", e);
                }
            }

            // Remove any existing overlay
            const existingOverlay = document.getElementById(
                "clarigo-blocker-container"
            );
            if (existingOverlay) {
                existingOverlay.remove();
            }

            // Create blocking container
            const container = document.createElement("div");
            container.id = "clarigo-blocker-container";
            container.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                z-index: 9999;
            `;

            // Create and set up the iframe
            const iframe = document.createElement("iframe");
            iframe.setAttribute(
                "sandbox",
                "allow-scripts allow-same-origin allow-storage-access-by-user-activation"
            );
            iframe.setAttribute("allow", "storage-access");
            iframe.style.cssText = `
                width: 100%;
                height: 100%;
                border: none;
            `;

            // Get the chrome-extension:// URL for the iframe.html
            const iframeUrl = chrome.runtime.getURL("iframe.html");
            // Add the block reason as a URL parameter
            iframe.src = `${iframeUrl}?reason=${encodeURIComponent(
                this.blockReason
            )}`;

            // Add the iframe to the container
            container.appendChild(iframe);

            // Add the container to the page
            document.body.appendChild(container);
        } catch (error) {
            console.error("Error showing blocked message:", error);
        }
    }

    processCurrentPage() {
        // Don't extract metadata if the page is already blocked
        if (this.isBlocked && this.isVideoPage()) {
            console.log("Injecting blocked iframe...");
            this.showBlockedMessage();
            return;
        }

        if (this.isVideoPage()) {
            this.extractVideoPageMetadata();
        } else if (this.isSearchResults()) {
            this.extractSearchResultsMetadata();
        } else if (this.isHomePage()) {
            this.extractHomePageMetadata();
        }
    }

    isVideoPage() {
        return window.location.pathname.startsWith("/watch");
    }

    isSearchResults() {
        return window.location.pathname.startsWith("/results");
    }

    isHomePage() {
        return (
            window.location.pathname === "/" ||
            window.location.pathname === "/feed/subscriptions"
        );
    }

    extractVideoPageMetadata() {
        // Wait for video elements to load
        setTimeout(() => {
            const metadata = {
                type: "video",
                title: this.getVideoTitle(),
                description: this.getVideoDescription(),
                videoCategory: this.getVideoCategory(),
                channel: this.getChannelName(),
            };

            console.log("Extracted video metadata:", metadata);
            // Send this data to your ML model
            this.sendToMLModel(metadata);
        }, 2000);
    }

    extractSearchResultsMetadata() {
        // Wait for search results to load
        setTimeout(() => {
            const searchResults = Array.from(
                document.querySelectorAll("ytd-video-renderer")
            ).map((result) => {
                return {
                    type: "search_result",
                    title: this.getTextContent(result, "#video-title"),
                    channel: this.getTextContent(result, "#channel-name"),
                    description: this.getSearchResultDescription(result),
                    videoCategory: this.getSearchResultCategory(result),
                };
            });

            console.log("Extracted search results:", searchResults);
            // Send these results to your ML model
            this.sendToMLModel(searchResults);
        }, 2000);
    }

    extractHomePageMetadata() {
        // Wait for home page videos to load
        setTimeout(() => {
            const homeVideos = Array.from(
                document.querySelectorAll("ytd-rich-item-renderer")
            ).map((result) => {
                return {
                    type: "home_video",
                    title: this.getTextContent(result, "#video-title"),
                    channel: this.getTextContent(result, "#channel-name"),
                    description: this.getSearchResultDescription(result),
                    videoCategory: this.getSearchResultCategory(result),
                };
            });

            console.log("Extracted home page videos:", homeVideos);
            // Send these results to your ML model
            this.sendToMLModel(homeVideos);
        }, 2000);
    }

    // Helper methods for extracting specific data
    getVideoTitle() {
        return (
            document
                .querySelector("h1.ytd-video-primary-info-renderer")
                ?.textContent?.trim() || ""
        );
    }

    getVideoDescription() {
        return (
            document.querySelector("#description-text")?.textContent?.trim() ||
            ""
        );
    }

    getVideoCategory() {
        // Extract video category from metadata
        const categoryElement = document.querySelector(
            'meta[itemprop="genre"]'
        );
        return categoryElement ? categoryElement.getAttribute("content") : "";
    }

    getChannelName() {
        return (
            document.querySelector("#channel-name")?.textContent?.trim() || ""
        );
    }

    getSearchResultDescription(resultElement) {
        // Extract description from search result
        return (
            this.getTextContent(resultElement, "#description-text") ||
            this.getTextContent(resultElement, "#meta #description") ||
            this.getTextContent(resultElement, "#metadata #description-text") ||
            this.getTextContent(
                resultElement,
                "yt-formatted-string.ytd-video-renderer#description-text"
            )
        );
    }

    getSearchResultCategory(resultElement) {
        // For search results, we need to extract category in a different way
        // Option 1: Try to find category badges or tags that might be shown with the video
        const badge = this.getTextContent(
            resultElement,
            "#badges .ytd-badge-supported-renderer"
        );
        if (badge) return badge;

        // Option 2: If no category is directly available in search results,
        // we can either return empty or try to infer from the title/description
        // Note: This is a limitation of YouTube search results - categories are not explicitly shown
        // We might need to fetch the actual video page to get accurate category data
        return "";
    }

    // Essential helper method for extracting text content
    getTextContent(element, selector) {
        return element.querySelector(selector)?.textContent?.trim() || "";
    }

    sendToMLModel(data) {
        // Send this data to your ML model through the background script
        chrome.runtime.sendMessage({
            type: "VIDEO_METADATA",
            data: data,
        });
    }
}

// Initialize the extractor
try {
    new YouTubeMetadataExtractor();
} catch (error) {
    console.error("Error initializing YouTubeMetadataExtractor:", error);
}
