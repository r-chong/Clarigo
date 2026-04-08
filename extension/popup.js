const toggle = document.getElementById('toggle');
const statusTitle = document.getElementById('status-title');
const statusEl = document.getElementById('status');
const modeDescriptionEl = document.getElementById('mode-description');
const modeButtons = Array.from(document.querySelectorAll('[data-filter-mode]'));
const openOptionsButton = document.getElementById('open-options');

function getModeMeta(value) {
  return window.ClarigoSettings.FILTER_MODES.find((mode) => mode.value === value)
    || window.ClarigoSettings.FILTER_MODES[0];
}

function render(settings) {
  const mode = getModeMeta(settings.filterMode);
  toggle.checked = settings.enabled;
  statusTitle.textContent = settings.enabled ? 'Filtering on' : 'Filtering off';
  statusEl.textContent = settings.enabled
    ? `${mode.label} is active.`
    : 'YouTube will show its full feed until Clarigo is turned back on.';
  modeDescriptionEl.textContent = mode.description;

  modeButtons.forEach((button) => {
    const selected = button.dataset.filterMode === settings.filterMode;
    button.dataset.selected = selected ? 'true' : 'false';
    button.setAttribute('aria-pressed', selected ? 'true' : 'false');
  });
}

async function refresh() {
  render(await window.ClarigoSettings.loadSettings());
}

toggle.addEventListener('change', async () => {
  render(await window.ClarigoSettings.updateSettings({ enabled: toggle.checked }));
});

modeButtons.forEach((button) => {
  button.addEventListener('click', async () => {
    render(await window.ClarigoSettings.updateSettings({
      filterMode: button.dataset.filterMode
    }));
  });
});

openOptionsButton.addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
  window.close();
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local') return;
  if (!window.ClarigoSettings.relevantStorageChange(changes)) return;
  refresh();
});

refresh();
