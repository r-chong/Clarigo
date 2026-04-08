const DEFAULT_SETTINGS = {
    enabled: true,
    filterMode: 'aggressive',
    debug: false,
};

chrome.runtime.onInstalled.addListener((details) => {
    chrome.storage.local.get(Object.keys(DEFAULT_SETTINGS), (data) => {
        const next = { ...DEFAULT_SETTINGS, ...data };
        chrome.storage.local.set(next);
    });

    if (details.reason === 'install') {
        chrome.tabs.create({ url: chrome.runtime.getURL('onboarding.html') });
    }
});
