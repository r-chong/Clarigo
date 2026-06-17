/**
 * Popup: read/write model filter enabled state from chrome.storage.local.
 * Default enabled is true when the key is missing.
 */
const toggle = document.getElementById('toggle');
const statusEl = document.getElementById('status');
const blockedCountEl = document.getElementById('blocked-count');

function setBlockedCount(count) {
  blockedCountEl.textContent = String(count ?? 0);
}

function setStatus(enabled) {
  statusEl.textContent = enabled ? 'Filtering is on' : 'Filtering is off';
  statusEl.classList.toggle('is-on', enabled);
  toggle.checked = !!enabled;
  toggle.setAttribute('aria-checked', String(!!enabled));
}

chrome.storage.local.get('enabled', (data) => {
  const enabled = data.enabled !== false;
  setStatus(enabled);
});

function refreshBlockedCount() {
  chrome.storage.session.get('blockedCount', (data) => {
    setBlockedCount(data.blockedCount || 0);
  });
}

refreshBlockedCount();

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'session' && changes.blockedCount) {
    setBlockedCount(changes.blockedCount.newValue);
  }
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'blockedCountUpdated') {
    setBlockedCount(msg.count);
  }
});

toggle.addEventListener('change', () => {
  const enabled = toggle.checked;
  chrome.storage.local.set({ enabled }, () => {
    setStatus(enabled);
    chrome.runtime.sendMessage({ type: 'enabledChanged', enabled });
  });
});
