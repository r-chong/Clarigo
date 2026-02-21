/**
 * Clarigo content script: load model, run predictions, apply hide policy.
 * Depends on: model/clarigo_classifier.js (ClarigoClassifier), youtube-dom.js (ClarigoDOM).
 */
const DEBUG = false;
const log = (...args) => { if (DEBUG) console.log(...args); };
const warn = (...args) => console.warn(...args);
const error = (...args) => console.error(...args);

const classifier = new ClarigoClassifier();
let modelLoaded = false;

async function loadModel() {
    if (modelLoaded) return true;

    try {
        const modelPath = chrome.runtime.getURL('model/clarigo_model.json');
        const success = await classifier.loadModel(modelPath);
        const wasLoaded = modelLoaded;
        modelLoaded = success && classifier.isLoaded;

        if (modelLoaded) {
            log('Clarigo: Model loaded successfully');
            if (!wasLoaded) {
                log('Clarigo: Reprocessing videos now that model is loaded...');
                setTimeout(() => processVideos(), 500);
            }
        } else {
            error('Clarigo: Failed to load model');
        }
        return modelLoaded;
    } catch (err) {
        error('Clarigo: Error loading model:', err);
        modelLoaded = false;
        return false;
    }
}

/**
 * Policy: hide non-educational videos (prediction === 0).
 */
function shouldHideVideo({ title, channelName }) {
    if (!modelLoaded || !classifier.isLoaded) return false;
    if (!title) return false;

    try {
        const prediction = classifier.predict(title, channelName || '');
        const hide = prediction.prediction === 0;
        if (hide) log(`Clarigo: Hiding non-educational - "${title}" (confidence: ${(prediction.confidence * 100).toFixed(1)}%)`);
        return hide;
    } catch (err) {
        error('Clarigo: Error making prediction:', err);
        return false;
    }
}

function processVideos() {
    const videoSelectors = [
        'ytd-rich-item-renderer:not(.cg-processed)',
        'ytd-video-renderer:not(.cg-processed)',
        'ytd-grid-video-renderer:not(.cg-processed)'
    ];

    let allVideoElements = [];
    videoSelectors.forEach((selector) => {
        const elements = document.querySelectorAll(selector);
        allVideoElements = allVideoElements.concat(Array.from(elements));
    });

    if (allVideoElements.length === 0) {
        log('Clarigo: No unprocessed video elements found');
        return;
    }

    log(`Clarigo: Processing ${allVideoElements.length} new videos...`);

    let hiddenCount = 0;
    let processedCount = 0;
    const { getChannelInfo, getVideoTitle, getVideoTitleFromWatchAnchor, isLikelyVideoCard } = window.ClarigoDOM;

    allVideoElements.forEach((videoElement) => {
        if (!isLikelyVideoCard(videoElement)) return;

        videoElement.classList.add('cg-processed');
        processedCount++;

        const title = getVideoTitle(videoElement) || getVideoTitleFromWatchAnchor(videoElement);
        const channel = getChannelInfo(videoElement);

        if (!title) log('Clarigo: Could not extract title from video element');

        if (shouldHideVideo({ title, channelName: channel.name })) {
            videoElement.classList.add('cg-hide');
            hiddenCount++;
            log(`Clarigo: Hiding video - "${title || '(no title)'}"`, { channelName: channel.name, channelUrl: channel.url });
        } else {
            log(`Clarigo: Showing video - "${title}" by "${channel.name}"`);
        }
    });

    log(`Clarigo: Processed ${processedCount} videos, hidden ${hiddenCount}`);
}

const debounce = (fn, wait = 300) => {
    let timeout;
    return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => fn(...args), wait);
    };
};
const debouncedProcessVideos = debounce(processVideos, 300);

async function initializeClarigo() {
    log('Clarigo: Initializing...', window.location.href);

    await loadModel();

    setTimeout(() => {
        if (modelLoaded) log('Clarigo: Processing initial videos');
        else log('Clarigo: Model still loading, will process when ready');
        processVideos();
    }, 2000);

    const observer = new MutationObserver((mutations) => {
        let shouldProcess = false;
        for (const mutation of mutations) {
            if (mutation.type !== 'childList' || mutation.addedNodes.length === 0) continue;
            for (const node of mutation.addedNodes) {
                if (node.nodeType !== Node.ELEMENT_NODE) continue;
                const hasVideos =
                    (node.matches && (
                        node.matches('ytd-rich-item-renderer') ||
                        node.matches('ytd-video-renderer') ||
                        node.matches('ytd-grid-video-renderer') ||
                        node.querySelector('ytd-rich-item-renderer') ||
                        node.querySelector('ytd-video-renderer') ||
                        node.querySelector('ytd-grid-video-renderer')
                    ));
                if (hasVideos) {
                    shouldProcess = true;
                    break;
                }
            }
            if (shouldProcess) break;
        }
        if (shouldProcess) {
            log('Clarigo: New videos detected, processing...');
            debouncedProcessVideos();
        }
    });

    const targetNode = document.querySelector('ytd-app') || document.body;
    observer.observe(targetNode, { childList: true, subtree: true });

    log('Clarigo: MutationObserver active');
    if (modelLoaded) log('Clarigo: Model loaded - non-educational videos will be hidden');
    else log('Clarigo: Model not loaded - all videos will be shown');
}

let lastUrl = location.href;
const titleEl = document.querySelector('title');
const navObserver = new MutationObserver(() => {
    const currentUrl = location.href;
    if (currentUrl !== lastUrl) {
        lastUrl = currentUrl;
        log('Clarigo: Page navigation detected, re-initializing...');
        setTimeout(processVideos, 1000);
    }
});
if (titleEl) {
    navObserver.observe(titleEl, { childList: true, subtree: true });
} else {
    warn('Clarigo: <title> not found, using <head> for navigation observer.');
    navObserver.observe(document.head, { childList: true, subtree: true });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeClarigo);
} else {
    initializeClarigo();
}
