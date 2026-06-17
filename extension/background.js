/**
 * Clarigo extension background service worker.
 */
let blockedWriteChain = Promise.resolve();

function recordBlockedVideo(videoKey) {
    blockedWriteChain = blockedWriteChain.then(() => new Promise((resolve) => {
        if (!videoKey) {
            resolve(0);
            return;
        }

        chrome.storage.session.get(['blockedVideos', 'blockedCount'], (data) => {
            const blockedVideos = { ...(data.blockedVideos || {}) };
            if (blockedVideos[videoKey]) {
                resolve(data.blockedCount || 0);
                return;
            }

            blockedVideos[videoKey] = true;
            const blockedCount = (data.blockedCount || 0) + 1;
            chrome.storage.session.set({ blockedVideos, blockedCount }, () => {
                chrome.runtime.sendMessage({ type: 'blockedCountUpdated', count: blockedCount }).catch(() => {});
                resolve(blockedCount);
            });
        });
    }));

    return blockedWriteChain;
}

chrome.runtime.onInstalled.addListener((details) => {
    chrome.storage.local.get('enabled', (data) => {
        if (data.enabled === undefined) {
            chrome.storage.local.set({ enabled: true });
        }
    });
    if (details.reason === 'install') {
        chrome.tabs.create({ url: chrome.runtime.getURL('onboarding.html') });
    }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'videoBlocked') {
        recordBlockedVideo(msg.videoKey).then((count) => sendResponse({ count }));
        return true;
    }

    if (msg.type !== 'enabledChanged') return;

    chrome.tabs.query({ url: '*://www.youtube.com/*' }, (tabs) => {
        tabs.forEach((tab) => {
            if (tab.id) {
                chrome.tabs.sendMessage(tab.id, { type: 'enabledChanged', enabled: msg.enabled }).catch(() => {});
            }
        });
    });
});
