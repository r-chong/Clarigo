/**
 * Popup: read/write enabled state from chrome.storage.local.
 * Default enabled is true (on) when key is missing.
 */
const toggle = document.getElementById('toggle');
const statusEl = document.getElementById('status');

function setStatus(enabled) {
  statusEl.textContent = enabled ? 'Clarigo is on' : 'Clarigo is off';
  toggle.checked = !!enabled;
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
