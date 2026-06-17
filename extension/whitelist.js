/**
 * Channel whitelist helpers for Clarigo.
 * Normalizes YouTube channel URLs/handles for consistent matching.
 */
(function () {
    'use strict';

    function normalizeChannelKey(url, name) {
        const raw = (url || '').trim();
        if (raw) {
            try {
                const u = new URL(raw, 'https://www.youtube.com');
                const path = u.pathname.replace(/\/+$/, '');

                const handleMatch = path.match(/^\/@([^/]+)/i);
                if (handleMatch) return `@${handleMatch[1].toLowerCase()}`;

                const channelMatch = path.match(/^\/channel\/([^/]+)/i);
                if (channelMatch) return `channel:${channelMatch[1]}`;

                const customMatch = path.match(/^\/c\/([^/]+)/i);
                if (customMatch) return `c:${customMatch[1].toLowerCase()}`;

                const userMatch = path.match(/^\/user\/([^/]+)/i);
                if (userMatch) return `user:${userMatch[1].toLowerCase()}`;
            } catch {
                // Fall through to name-based key.
            }
        }

        const trimmedName = (name || '').trim();
        if (trimmedName) return `name:${trimmedName.toLowerCase()}`;
        return '';
    }

    function getChannelMatchKeys(channelUrl, channelName) {
        const keys = new Set();
        const urlKey = normalizeChannelKey(channelUrl, '');
        const nameKey = normalizeChannelKey('', channelName);
        if (urlKey) keys.add(urlKey);
        if (nameKey) keys.add(nameKey);
        return keys;
    }

    function parseChannelInput(input) {
        const text = (input || '').trim();
        if (!text) return null;

        if (/^@[\w.-]+$/i.test(text)) {
            const handle = text.slice(1).toLowerCase();
            return {
                key: `@${handle}`,
                label: text,
                url: `https://www.youtube.com/@${handle}`
            };
        }

        if (/^https?:\/\//i.test(text) || text.includes('youtube.com') || text.startsWith('www.')) {
            const url = text.startsWith('http') ? text : `https://${text}`;
            const key = normalizeChannelKey(url, '');
            if (!key) return null;
            return { key, label: text, url };
        }

        // Plain handle without @ (e.g. "kurzgesagt" → @kurzgesagt).
        if (/^[\w.-]+$/i.test(text)) {
            const handle = text.toLowerCase();
            return {
                key: `@${handle}`,
                label: `@${handle}`,
                url: `https://www.youtube.com/@${handle}`
            };
        }

        const key = normalizeChannelKey('', text);
        if (!key) return null;
        return { key, label: text, url: '' };
    }

    function isWhitelisted(whitelistKeys, channelUrl, channelName) {
        if (!whitelistKeys || whitelistKeys.size === 0) return false;
        for (const key of getChannelMatchKeys(channelUrl, channelName)) {
            if (whitelistKeys.has(key)) return true;
        }
        return false;
    }

    function getCurrentChannelFromPage() {
        const u = new URL(location.href);
        const parts = u.pathname.split('/').filter(Boolean);
        if (parts.length === 0) return null;

        const nameEl =
            document.querySelector('ytd-channel-name #text') ||
            document.querySelector('ytd-channel-name yt-formatted-string') ||
            document.querySelector('#channel-name yt-formatted-string');
        const name = (nameEl?.textContent || document.title.replace(/ - YouTube$/, '')).trim();

        if (parts[0].startsWith('@')) {
            const handle = parts[0];
            return {
                key: normalizeChannelKey(`${u.origin}/${handle}`, name),
                label: name || handle,
                url: `${u.origin}/${handle}`
            };
        }

        if (parts[0] === 'channel' && parts[1]) {
            const url = `${u.origin}/channel/${parts[1]}`;
            return { key: normalizeChannelKey(url, name), label: name, url };
        }

        if ((parts[0] === 'c' || parts[0] === 'user') && parts[1]) {
            const url = `${u.origin}/${parts[0]}/${parts[1]}`;
            return { key: normalizeChannelKey(url, name), label: name, url };
        }

        return null;
    }

    function isChannelPage() {
        const parts = location.pathname.split('/').filter(Boolean);
        if (parts.length === 0) return false;
        if (parts[0].startsWith('@')) return true;
        return parts[0] === 'channel' || parts[0] === 'c' || parts[0] === 'user';
    }

    window.ClarigoWhitelist = {
        normalizeChannelKey,
        getChannelMatchKeys,
        parseChannelInput,
        isWhitelisted,
        getCurrentChannelFromPage,
        isChannelPage
    };
})();
