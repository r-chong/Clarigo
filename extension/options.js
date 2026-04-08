const enabledToggle = document.getElementById('enabled-toggle');
const debugToggle = document.getElementById('debug-toggle');
const modeCards = Array.from(document.querySelectorAll('[data-filter-mode]'));
const resetDefaultsButton = document.getElementById('reset-defaults');

function render(settings) {
  enabledToggle.checked = settings.enabled;
  debugToggle.checked = settings.debug;

  modeCards.forEach((card) => {
    const selected = card.dataset.filterMode === settings.filterMode;
    card.dataset.selected = selected ? 'true' : 'false';
    card.setAttribute('aria-pressed', selected ? 'true' : 'false');
  });
}

async function refresh() {
  render(await window.ClarigoSettings.loadSettings());
}

enabledToggle.addEventListener('change', async () => {
  render(await window.ClarigoSettings.updateSettings({ enabled: enabledToggle.checked }));
});

debugToggle.addEventListener('change', async () => {
  render(await window.ClarigoSettings.updateSettings({ debug: debugToggle.checked }));
});

modeCards.forEach((card) => {
  card.addEventListener('click', async () => {
    render(await window.ClarigoSettings.updateSettings({
      filterMode: card.dataset.filterMode
    }));
  });
});

resetDefaultsButton.addEventListener('click', async () => {
  render(await window.ClarigoSettings.updateSettings(window.ClarigoSettings.DEFAULTS));
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local') return;
  if (!window.ClarigoSettings.relevantStorageChange(changes)) return;
  refresh();
});

refresh();
