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
let clarigoEnabled = true;
let whitelistedChannelKeys = new Set();

async function loadWhitelist() {
    const data = await new Promise((resolve) => chrome.storage.local.get('whitelistedChannels', resolve));
    whitelistedChannelKeys = new Set((data.whitelistedChannels || []).map((channel) => channel.key));
}

function isWhitelistedChannel(channelUrl, channelName) {
    return window.ClarigoWhitelist.isWhitelisted(whitelistedChannelKeys, channelUrl, channelName);
}

async function loadModel() {
    if (modelLoaded) return true;

    try {
        const modelPath = chrome.runtime.getURL('model/clarigo_model.json');
        const success = await classifier.loadModel(modelPath);
        const wasLoaded = modelLoaded;
        modelLoaded = success && classifier.isLoaded;

        if (modelLoaded) {
            log('Clarigo: Model loaded successfully');
            if (!wasLoaded && clarigoEnabled) {
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
function getVideoKey(videoElement, title, channelName) {
    const anchor = window.ClarigoDOM.getWatchAnchor(videoElement);
    const href = anchor?.href || anchor?.getAttribute('href') || '';
    try {
        const u = new URL(href, window.location.origin);
        const videoId = u.searchParams.get('v');
        if (videoId) return videoId;
        if (u.pathname.startsWith('/shorts/')) return u.pathname;
        if (u.pathname && u.pathname !== '/') return u.pathname + u.search;
    } catch {
        // Fall through to title-based key.
    }

    const fallbackTitle = title || window.ClarigoDOM.getVideoTitle(videoElement) || '';
    if (fallbackTitle) return `${fallbackTitle}::${channelName || ''}`;
    return '';
}

function recordBlockedDistraction(videoElement, title, channelName) {
    const key = getVideoKey(videoElement, title, channelName);
    if (!key) return;
    chrome.runtime.sendMessage({ type: 'videoBlocked', videoKey: key }).catch(() => {});
}

function shouldHideVideo({ title, channelName, channelUrl }) {
    if (isWhitelistedChannel(channelUrl, channelName)) {
        log(`Clarigo: Skipping whitelisted channel - "${channelName}"`);
        return false;
    }
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
    if (!clarigoEnabled) return;

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

        if (clarigoEnabled && shouldHideVideo({ title, channelName: channel.name, channelUrl: channel.url })) {
            videoElement.classList.add('cg-hide');
            recordBlockedDistraction(videoElement, title, channel.name);
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

function unhideAllVideos() {
    document.querySelectorAll('.cg-hide').forEach((el) => el.classList.remove('cg-hide'));
}

function resetProcessedState() {
    document.querySelectorAll('.cg-processed').forEach((el) => el.classList.remove('cg-processed'));
}

async function reprocessAfterWhitelistChange() {
    await loadWhitelist();
    updateChannelPageButton();
    if (!clarigoEnabled) return;
    resetProcessedState();
    unhideAllVideos();
    processVideos();
}

function ensureChannelPageButton() {
    if (!window.ClarigoWhitelist.isChannelPage()) return;

    let button = document.getElementById('cg-whitelist-channel-btn');
    if (!button) {
        button = document.createElement('button');
        button.id = 'cg-whitelist-channel-btn';
        button.type = 'button';
        button.className = 'cg-whitelist-channel-btn';
        button.addEventListener('click', () => {
            const channel = window.ClarigoWhitelist.getCurrentChannelFromPage();
            if (!channel?.key) return;

            chrome.storage.local.get('whitelistedChannels', (data) => {
                const channels = data.whitelistedChannels || [];
                if (channels.some((entry) => entry.key === channel.key)) return;

                channels.push({
                    key: channel.key,
                    label: channel.label || channel.key,
                    url: channel.url || ''
                });
                chrome.storage.local.set({ whitelistedChannels: channels });
            });
        });

        const host =
            document.querySelector('#channel-header #buttons') ||
            document.querySelector('ytd-channel-name')?.parentElement ||
            document.querySelector('#inner-header-container');
        if (host) host.appendChild(button);
    }

    updateChannelPageButton();
}

function updateChannelPageButton() {
    const button = document.getElementById('cg-whitelist-channel-btn');
    if (!button) return;

    const channel = window.ClarigoWhitelist.getCurrentChannelFromPage();
    if (!channel?.key) {
        button.hidden = true;
        return;
    }

    button.hidden = false;
    const isWhitelisted = whitelistedChannelKeys.has(channel.key);
    button.textContent = isWhitelisted ? 'Channel whitelisted' : 'Never block this channel';
    button.classList.toggle('is-active', isWhitelisted);
    button.disabled = isWhitelisted;
}

async function applyEnabledState(enabled) {
    clarigoEnabled = enabled;
    if (enabled) {
        await loadModel();
        resetProcessedState();
        processVideos();
    } else {
        unhideAllVideos();
    }
}

chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'enabledChanged') {
        void applyEnabledState(msg.enabled !== false);
    }
});

async function initializeClarigo() {
    log('Clarigo: Initializing...', window.location.href);

    await loadWhitelist();

    const data = await new Promise((resolve) => chrome.storage.local.get('enabled', resolve));
    clarigoEnabled = data.enabled !== false;
    log('Clarigo: Enabled =', clarigoEnabled);

    chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== 'local') return;
        if (changes.enabled) {
            void applyEnabledState(changes.enabled.newValue !== false);
        }
        if (changes.whitelistedChannels) {
            void reprocessAfterWhitelistChange();
        }
    });

    if (clarigoEnabled) {
        await loadModel();
    } else {
        log('Clarigo: Model filter disabled — skipping model load');
    }

    setTimeout(() => {
        if (!clarigoEnabled) {
            log('Clarigo: Model filter disabled — showing all videos');
            return;
        }
        if (modelLoaded) log('Clarigo: Processing initial videos');
        else log('Clarigo: Model still loading, will process when ready');
        processVideos();
        ensureChannelPageButton();
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
        if (shouldProcess && clarigoEnabled) {
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
        if (clarigoEnabled) setTimeout(processVideos, 1000);
        setTimeout(ensureChannelPageButton, 1000);
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
