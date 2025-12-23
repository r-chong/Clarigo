const classifier = new ClarigoClassifier();
let modelLoaded = false;

(async () => {
    try {
        const modelPath = chrome.runtime.getURL('clarigo_model.json');
        await classifier.loadModel(modelPath);
        modelLoaded = true;
        console.log("loaded model");
    } catch (error) {
        console.error("Failed to load model");
        modelLoaded = false;
    }
}) ();

const getChannelName = (videoElement) => {
    const channelSelectors = [
        '#channel-name a',
        '#channel-name #text',
        'ytd-channel-name a',
        'ytd-channel-name #text',
        '.ytd-channel-name a',
        '#text.ytd-channel-name',
        'yt-formatted-string.ytd-channel-name'
    ]

    for (const selector of channelSelectors) {
        const channelElement = videoElement.querySelector(selector);
        if (channelElement) {
            const channel = channelElement.textContent || '';
            if (channel.trim()) {
                return channel.trim();
            }
        }
    }
    return '';
}

// extract video title from a video element
const getVideoTitle = (videoElement) => {
    // youtube stores titles in different places depending on the page
    // how it works is:
    // Home page: ytd-rich-item-renderer > #video-title-link
    // Search/Other: various selectors
    
    const titleSelectors = [
        '#video-title',
        '#video-title-link',
        'a#video-title',
        'yt-formatted-string#video-title',
        'h3 a',
        '.ytd-video-renderer #video-title'
    ];
    
    for (const selector of titleSelectors) {
        const titleElement = videoElement.querySelector(selector);
        if (titleElement) {
            const title = titleElement.getAttribute('title') || 
                         titleElement.getAttribute('aria-label') || 
                         titleElement.textContent || 
                         '';
            if (title.trim()) {
                return title.trim();
            }
        }
    }
    
    return '';
};

// Determine if a video should be hidden - will be subbed out for the model later
// Currently: hide videos with "Z" or "z" in the title
const shouldHideVideo = (title, channelName) => {
    if (!modelLoaded || !classifier.isLoaded) {
        console.log("Model not loaded, skipping filtering");
        return false;
    }
    if (!title) {
        console.log("Missing title, showing video");
        return false;
    }

    try {
        const result = classifier.predict(title, channelName || '');
        console.log(`Clarigo: "${title}" by "${channelName}" => ${result.label} (${(result.confidence * 100).toFixed(1)}%)`);
        
        return result.prediction === 0;
    } catch (error) {
        console.error('Prediction error', error);
        return false;
    }
};

// Process videos (both initial and new ones)
const processVideos = () => {
    // YouTube uses different renderers for different pages
    // Home/Feed: ytd-rich-item-renderer
    // Search/Subscriptions: ytd-video-renderer
    // Both should be supported
    const videoSelectors = [
        'ytd-rich-item-renderer:not(.cg-processed)',
        'ytd-video-renderer:not(.cg-processed)',
        'ytd-grid-video-renderer:not(.cg-processed)'
    ];
    
    let allVideoElements = [];
    videoSelectors.forEach(selector => {
        const elements = document.querySelectorAll(selector);
        allVideoElements = allVideoElements.concat(Array.from(elements));
    });
    
    if (allVideoElements.length === 0) {
        console.log('Clarigo: No unprocessed video elements found');
        return;
    }
    
    console.log(`Clarigo: Processing ${allVideoElements.length} new videos...`);
    
    let hiddenCount = 0;
    let processedCount = 0;
    
    allVideoElements.forEach((videoElement) => {
        // Mark as processed to ensure we only run once per video
        videoElement.classList.add('cg-processed');
        processedCount++;
        
        const title = getVideoTitle(videoElement);
        const channelName = getChannelName(videoElement);  
        
        if (!title) {
            console.log('Clarigo: Could not extract title from video element');
            return;
        }
        
        // Apply filtering logic
        if (shouldHideVideo(title, channelName)) {  
            videoElement.classList.add('cg-hide');
            hiddenCount++;
            console.log(`Clarigo: Hiding video - "${title}" by "${channelName}"`); 
        } else {
            console.log(`Clarigo: Showing video - "${title}" by "${channelName}"`);
        }
    });
    
    console.log(`Clarigo: Processed ${processedCount} videos, hidden ${hiddenCount}`);
};

// Debounce function to prevent excessive calls
const debounce = (fn, wait = 300) => {
    let timeout;
    return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => fn(...args), wait);
    };
};

// Debounced version to handle rapid DOM changes
const debouncedProcessVideos = debounce(processVideos, 300);

// Initialize the extension
const initializeClarigo = () => {
    console.log('Clarigo: Initializing extension...');
    console.log('Clarigo: Current URL:', window.location.href);
    
    // Wait a bit for YouTube to render
    setTimeout(() => {
        if (modelLoaded) {
            console.log("Processing initial Videos");
        } else {
            console.log("Clarigo: Model still loading");
        }
        processVideos();
    }, 2000);
    
    // Set up MutationObserver to catch new videos as they load
    // YouTube is a SPA (Single Page Application), so we need to watch for dynamic content
    console.log('Clarigo: Setting up MutationObserver...');
    
    const observer = new MutationObserver((mutations) => {
        // check if any mutations added video elements
        let shouldProcess = false;
        
        for (const mutation of mutations) {
            if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                for (const node of mutation.addedNodes) {
                    // check if the added node or its children contain video elements
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        const hasVideos = node.matches && (
                            node.matches('ytd-rich-item-renderer') ||
                            node.matches('ytd-video-renderer') ||
                            node.matches('ytd-grid-video-renderer') ||
                            node.querySelector('ytd-rich-item-renderer') ||
                            node.querySelector('ytd-video-renderer') ||
                            node.querySelector('ytd-grid-video-renderer')
                        );
                        
                        if (hasVideos) {
                            shouldProcess = true;
                            break;
                        }
                    }
                }
            }
            if (shouldProcess) break;
        }
        
        if (shouldProcess) {
            console.log('Clarigo: New videos detected, processing...');
            debouncedProcessVideos();
        }
    });
    
    // Observe the main content area where videos are rendered
    const targetNode = document.querySelector('ytd-app') || document.body;
    
    observer.observe(targetNode, {
        childList: true,
        subtree: true
    });
    
    console.log('Clarigo: MutationObserver active');
    console.log('Clarigo: Extension fully initialized');
    console.log('Clarigo: Non-educational videos will be filtered using ML model');};

// handle YouTube's SPA navigation
// YouTube doesn't reload the page when navigating, so must re-process on navigation
let lastUrl = location.href;
const titleElement = document.querySelector('title');
const navigationObserver = new MutationObserver(() => {
    const currentUrl = location.href;
    if (currentUrl !== lastUrl) {
        lastUrl = currentUrl;
        console.log('Clarigo: Page navigation detected, re-initializing...');
        setTimeout(processVideos, 1000);
    }
});
if (titleElement) {
    navigationObserver.observe(titleElement, { 
        childList: true, 
        subtree: true 
    });
} else {
    // Fallback: observe document.head if title is missing
    console.warn('Clarigo: <title> element not found, using <head> as fallback for navigation observer.');
    navigationObserver.observe(document.head, { 
        childList: true, 
        subtree: true 
    });
}

// Wait for DOM to be ready, then initialize
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeClarigo);
} else {
    // DOM is already loaded
    initializeClarigo();
}
