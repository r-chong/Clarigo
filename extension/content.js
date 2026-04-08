/**
 * Clarigo content script: load model, run predictions, and suppress feed noise.
 * Depends on: settings.js, model/clarigo_classifier.js, youtube-dom.js
 */
const state = {
    modelLoaded: false,
    settings: (globalThis.ClarigoSettings && globalThis.ClarigoSettings.normalizeSettings())
        || { enabled: true, filterMode: 'aggressive', debug: false }
};

const classifier = new ClarigoClassifier();
const VIDEO_SELECTORS = [
    'ytd-rich-item-renderer:not(.cg-processed)',
    'ytd-video-renderer:not(.cg-processed)',
    'ytd-grid-video-renderer:not(.cg-processed)',
    'ytd-compact-video-renderer:not(.cg-processed)'
];
const FEED_NOISE_SELECTORS = [
    'ytd-rich-shelf-renderer',
    'ytd-reel-shelf-renderer',
    'ytd-display-ad-renderer',
    'ytd-ad-slot-renderer',
    'ytd-banner-promo-renderer',
    'ytd-promoted-sparkles-web-renderer',
    'ytd-search-pyv-renderer',
    'ytd-primetime-promo-renderer'
];

const log = (...args) => { if (state.settings.debug) console.log(...args); };
const warn = (...args) => console.warn(...args);
const error = (...args) => console.error(...args);

function hideElement(element, reason) {
    if (!element) return;
    element.classList.add('cg-hide');
    if (reason) {
        element.dataset.cgReason = reason;
    }
}

function unhideElement(element) {
    if (!element) return;
    element.classList.remove('cg-hide');
    delete element.dataset.cgReason;
}

function unhideAllManagedElements() {
    document.querySelectorAll('.cg-hide').forEach((element) => unhideElement(element));
}

function resetProcessedState() {
    document.querySelectorAll('.cg-processed').forEach((element) => element.classList.remove('cg-processed'));
}

function suppressFeedNoise() {
    document.querySelectorAll(FEED_NOISE_SELECTORS.join(',')).forEach((element) => {
        if (state.settings.enabled) {
            hideElement(element, 'feed-noise');
        } else {
            unhideElement(element);
        }
    });
}

async function loadModel() {
    if (state.modelLoaded) return true;

    try {
        const modelPath = chrome.runtime.getURL('model/clarigo_model.json');
        const success = await classifier.loadModel(modelPath);
        const wasLoaded = state.modelLoaded;
        state.modelLoaded = success && classifier.isLoaded;

        if (state.modelLoaded && !wasLoaded) {
            log('Clarigo: Model loaded, reprocessing feed.');
            setTimeout(processFeed, 300);
        }

        return state.modelLoaded;
    } catch (err) {
        error('Clarigo: Error loading model:', err);
        state.modelLoaded = false;
        return false;
    }
}

function shouldHideUnknownCard(title) {
    return !title && state.settings.filterMode === 'aggressive';
}

function shouldHideVideo({ title, channelName }) {
    if (!state.modelLoaded || !classifier.isLoaded) return false;
    if (!title) return shouldHideUnknownCard(title);

    try {
        const prediction = classifier.predict(title, channelName || '', {
            filterMode: state.settings.filterMode
        });
        const hide = prediction.prediction === 0;
        log('Clarigo: scored video', {
            title,
            channelName,
            probability: prediction.probability,
            threshold: prediction.threshold,
            hide
        });
        return hide;
    } catch (err) {
        error('Clarigo: Error making prediction:', err);
        return false;
    }
}

function collectVideoElements() {
    const combined = [];
    VIDEO_SELECTORS.forEach((selector) => {
        combined.push(...document.querySelectorAll(selector));
    });
    return Array.from(new Set(combined));
}

function processVideos() {
    const {
        getChannelInfo,
        getVideoTitle,
        getVideoTitleFromWatchAnchor,
        getCardSuppressionReason,
        isLikelyVideoCard
    } = window.ClarigoDOM;

    const allVideoElements = collectVideoElements();
    if (allVideoElements.length === 0) return;

    let hiddenCount = 0;
    let processedCount = 0;

    allVideoElements.forEach((videoElement) => {
        if (!isLikelyVideoCard(videoElement)) return;

        videoElement.classList.add('cg-processed');
        processedCount += 1;

        const suppressionReason = getCardSuppressionReason(videoElement);
        if (state.settings.enabled && suppressionReason) {
            hideElement(videoElement, suppressionReason);
            hiddenCount += 1;
            return;
        }

        const title = getVideoTitle(videoElement) || getVideoTitleFromWatchAnchor(videoElement);
        const channel = getChannelInfo(videoElement);

        if (state.settings.enabled && shouldHideVideo({ title, channelName: channel.name })) {
            hideElement(videoElement, `model-${state.settings.filterMode}`);
            hiddenCount += 1;
        } else {
            unhideElement(videoElement);
        }
    });

    log(`Clarigo: processed ${processedCount} candidates, hid ${hiddenCount}`);
}

function processFeed() {
    suppressFeedNoise();

    if (!state.settings.enabled) {
        unhideAllManagedElements();
        return;
    }

    processVideos();
}

const debounce = (fn, wait = 300) => {
    let timeout;
    return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => fn(...args), wait);
    };
};

const debouncedProcessFeed = debounce(processFeed, 300);

function applySettings(nextSettings) {
    state.settings = nextSettings;
    resetProcessedState();
    if (nextSettings.enabled) {
        processFeed();
    } else {
        unhideAllManagedElements();
    }
}

async function initializeClarigo() {
    log('Clarigo: Initializing...', window.location.href);

    if (globalThis.ClarigoSettings) {
        state.settings = await globalThis.ClarigoSettings.loadSettings();
    }

    chrome.storage.onChanged.addListener(async (changes, areaName) => {
        if (areaName !== 'local') return;
        if (!globalThis.ClarigoSettings || !globalThis.ClarigoSettings.relevantStorageChange(changes)) return;
        const nextSettings = await globalThis.ClarigoSettings.loadSettings();
        applySettings(nextSettings);
    });

    await loadModel();

    setTimeout(processFeed, 1200);

    const observer = new MutationObserver((mutations) => {
        let shouldProcess = false;
        for (const mutation of mutations) {
            if (mutation.type !== 'childList' || mutation.addedNodes.length === 0) continue;
            for (const node of mutation.addedNodes) {
                if (node.nodeType !== Node.ELEMENT_NODE) continue;
                if (
                    (node.matches && node.matches(`${VIDEO_SELECTORS.map((selector) => selector.replace(':not(.cg-processed)', '')).join(', ')}, ${FEED_NOISE_SELECTORS.join(', ')}`)) ||
                    node.querySelector?.(`${VIDEO_SELECTORS.map((selector) => selector.replace(':not(.cg-processed)', '')).join(', ')}, ${FEED_NOISE_SELECTORS.join(', ')}`)
                ) {
                    shouldProcess = true;
                    break;
                }
            }
            if (shouldProcess) break;
        }
        if (shouldProcess) debouncedProcessFeed();
    });

    const targetNode = document.querySelector('ytd-app') || document.body;
    observer.observe(targetNode, { childList: true, subtree: true });

    let lastUrl = location.href;
    const titleEl = document.querySelector('title');
    const navObserver = new MutationObserver(() => {
        const currentUrl = location.href;
        if (currentUrl !== lastUrl) {
            lastUrl = currentUrl;
            resetProcessedState();
            setTimeout(processFeed, 700);
        }
    });

    if (titleEl) {
        navObserver.observe(titleEl, { childList: true, subtree: true });
    } else {
        warn('Clarigo: <title> not found, falling back to <head> navigation observer.');
        navObserver.observe(document.head, { childList: true, subtree: true });
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeClarigo);
} else {
    initializeClarigo();
}
