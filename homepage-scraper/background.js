/**
 * Homepage scraper background service worker.
 */
function updateBadge(count) {
    const text = count > 0 ? String(count) : '';
    chrome.action.setBadgeBackgroundColor({ color: '#1a73e8' });
    chrome.action.setBadgeText({ text });
}

chrome.runtime.onInstalled.addListener(() => {
    chrome.storage.local.get(['scrapingEnabled', 'records'], (data) => {
        if (data.scrapingEnabled === undefined) {
            chrome.storage.local.set({ scrapingEnabled: true });
        }
        const count = Object.keys(data.records || {}).length;
        updateBadge(count);
    });
});

chrome.runtime.onStartup.addListener(() => {
    chrome.storage.local.get('records', (data) => {
        updateBadge(Object.keys(data.records || {}).length);
    });
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type === 'countUpdated') {
        updateBadge(msg.count || 0);
        sendResponse({ ok: true });
        return;
    }

    if (msg.type === 'scrapingChanged') {
        chrome.tabs.query({ url: '*://www.youtube.com/*' }, (tabs) => {
            tabs.forEach((tab) => {
                if (tab.id) {
                    chrome.tabs.sendMessage(tab.id, {
                        type: 'scrapingChanged',
                        enabled: msg.enabled
                    }).catch(() => {});
                }
            });
        });
        sendResponse({ ok: true });
        return;
    }
});
