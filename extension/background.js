/**
 * Clarigo extension background service worker.
 * Minimal entry point; add listeners here when needed (e.g. storage, install).
 */
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
    if (msg.type !== 'enabledChanged') return;
    chrome.tabs.query({ url: '*://www.youtube.com/*' }, (tabs) => {
        tabs.forEach((tab) => {
            if (tab.id) {
                chrome.tabs.sendMessage(tab.id, { type: 'enabledChanged', enabled: msg.enabled }).catch(() => {});
            }
        });
    });
});
