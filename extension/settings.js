(function (global) {
    'use strict';

    const DEFAULTS = Object.freeze({
        enabled: true,
        filterMode: 'aggressive',
        debug: false,
    });

    const FILTER_MODES = Object.freeze([
        {
            value: 'aggressive',
            label: 'Aggressive study mode',
            description: 'Hide borderline videos, Shorts, sponsored cards, and noisy shelves.',
        },
        {
            value: 'balanced',
            label: 'Balanced',
            description: 'Keep clearly educational content while still cutting most distractions.',
        },
        {
            value: 'conservative',
            label: 'Conservative',
            description: 'Only hide stronger non-educational candidates.',
        },
    ]);

    const FILTER_MODE_SET = new Set(FILTER_MODES.map((mode) => mode.value));

    function normalizeSettings(raw = {}) {
        return {
            enabled: raw.enabled !== false,
            filterMode: FILTER_MODE_SET.has(raw.filterMode) ? raw.filterMode : DEFAULTS.filterMode,
            debug: raw.debug === true,
        };
    }

    function getStorageSnapshot() {
        return new Promise((resolve) => {
            chrome.storage.local.get(Object.keys(DEFAULTS), (data) => resolve(normalizeSettings(data)));
        });
    }

    function setStorageSnapshot(snapshot) {
        return new Promise((resolve) => {
            chrome.storage.local.set(snapshot, () => resolve(snapshot));
        });
    }

    async function updateSettings(patch) {
        const current = await getStorageSnapshot();
        const next = normalizeSettings({ ...current, ...patch });
        return setStorageSnapshot(next);
    }

    function relevantStorageChange(changes) {
        return Object.keys(changes).some((key) => Object.prototype.hasOwnProperty.call(DEFAULTS, key));
    }

    global.ClarigoSettings = {
        DEFAULTS,
        FILTER_MODES,
        normalizeSettings,
        loadSettings: getStorageSnapshot,
        updateSettings,
        relevantStorageChange,
    };
})(globalThis);
