/**
 * Popup: toggle scraping, show count, export JSONL, clear storage.
 */
const toggle = document.getElementById('toggle');
const statusEl = document.getElementById('status');
const countEl = document.getElementById('count');
const exportBtn = document.getElementById('exportBtn');
const clearBtn = document.getElementById('clearBtn');

function setScrapingUi(enabled) {
    statusEl.textContent = enabled ? 'Scraping is on' : 'Scraping is off';
    toggle.checked = !!enabled;
}

function setCount(count) {
    countEl.textContent = String(count);
    const hasData = count > 0;
    exportBtn.disabled = !hasData;
    clearBtn.disabled = !hasData;
}

function loadState() {
    chrome.storage.local.get(['scrapingEnabled', 'records'], (data) => {
        setScrapingUi(data.scrapingEnabled !== false);
        setCount(Object.keys(data.records || {}).length);
    });
}

toggle.addEventListener('change', () => {
    const enabled = toggle.checked;
    chrome.storage.local.set({ scrapingEnabled: enabled }, () => {
        setScrapingUi(enabled);
        chrome.runtime.sendMessage({ type: 'scrapingChanged', enabled });
    });
});

exportBtn.addEventListener('click', () => {
    chrome.storage.local.get('records', (data) => {
        const records = Object.values(data.records || {});
        if (records.length === 0) return;

        const lines = records.map((r) => JSON.stringify(r)).join('\n') + '\n';
        const blob = new Blob([lines], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const date = new Date().toISOString().slice(0, 10);

        const a = document.createElement('a');
        a.href = url;
        a.download = `youtube_feed_${date}.jsonl`;
        a.click();
        URL.revokeObjectURL(url);
    });
});

clearBtn.addEventListener('click', () => {
    const count = parseInt(countEl.textContent, 10) || 0;
    if (count === 0) return;
    if (!confirm(`Delete all ${count} collected videos?`)) return;

    chrome.storage.local.set({ records: {} }, () => {
        setCount(0);
        chrome.runtime.sendMessage({ type: 'countUpdated', count: 0 });
    });
});

chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.scrapingEnabled) {
        setScrapingUi(changes.scrapingEnabled.newValue !== false);
    }
    if (changes.records) {
        setCount(Object.keys(changes.records.newValue || {}).length);
    }
});

loadState();
