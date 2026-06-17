const form = document.getElementById('whitelist-form');
const input = document.getElementById('channel-input');
const listEl = document.getElementById('whitelist-list');
const emptyEl = document.getElementById('whitelist-empty');
const errorEl = document.getElementById('whitelist-error');

function showError(message) {
    errorEl.textContent = message;
    errorEl.hidden = !message;
}

function renderWhitelist(channels) {
    listEl.innerHTML = '';
    emptyEl.hidden = channels.length > 0;

    channels.forEach((channel, index) => {
        const item = document.createElement('li');
        item.className = 'whitelist-item';

        const label = document.createElement('span');
        label.className = 'whitelist-item-label';
        label.textContent = channel.label || channel.key;

        const meta = document.createElement('span');
        meta.className = 'whitelist-item-meta';
        meta.textContent = channel.key;

        const copy = document.createElement('div');
        copy.className = 'whitelist-item-copy';
        copy.append(label, meta);

        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'btn-remove';
        removeBtn.textContent = 'Remove';
        removeBtn.setAttribute('aria-label', `Remove ${channel.label || channel.key} from whitelist`);
        removeBtn.addEventListener('click', () => removeChannel(index));

        item.append(copy, removeBtn);
        listEl.appendChild(item);
    });
}

function loadWhitelist() {
    chrome.storage.local.get('whitelistedChannels', (data) => {
        renderWhitelist(data.whitelistedChannels || []);
    });
}

function saveWhitelist(channels) {
    chrome.storage.local.set({ whitelistedChannels: channels }, () => {
        renderWhitelist(channels);
    });
}

function addChannel(parsed) {
    chrome.storage.local.get('whitelistedChannels', (data) => {
        const channels = data.whitelistedChannels || [];
        if (channels.some((c) => c.key === parsed.key)) {
            showError('That channel is already whitelisted.');
            return;
        }

        channels.push({
            key: parsed.key,
            label: parsed.label || parsed.key,
            url: parsed.url || ''
        });
        saveWhitelist(channels);
        input.value = '';
        showError('');
    });
}

function removeChannel(index) {
    chrome.storage.local.get('whitelistedChannels', (data) => {
        const channels = (data.whitelistedChannels || []).filter((_, i) => i !== index);
        saveWhitelist(channels);
        showError('');
    });
}

form.addEventListener('submit', (event) => {
    event.preventDefault();
    const parsed = ClarigoWhitelist.parseChannelInput(input.value);
    if (!parsed) {
        showError('Enter a channel @handle, URL, or name.');
        return;
    }
    addChannel(parsed);
});

loadWhitelist();
