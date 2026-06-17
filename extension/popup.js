/**
 * Popup: read/write model filter enabled state from chrome.storage.local.
 * Default enabled is true when the key is missing.
 */
const toggle = document.getElementById('toggle');
const statusEl = document.getElementById('status');

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

toggle.addEventListener('change', () => {
  const enabled = toggle.checked;
  chrome.storage.local.set({ enabled }, () => {
    setStatus(enabled);
    chrome.runtime.sendMessage({ type: 'enabledChanged', enabled });
  });
});
