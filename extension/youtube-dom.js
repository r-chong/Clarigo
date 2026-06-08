/**
 * YouTube DOM helpers for Clarigo.
 * Extracts title and channel from video card elements; no Chrome or classifier APIs.
 */
(function () {
    'use strict';

    function normalizeYouTubeTitle(raw) {
        const text = (raw || '').trim();
        if (!text) return '';

        const withoutDuration = text
            .replace(/\s+\d+\s+(?:second|minute|hour)s?(?:,\s*\d+\s+(?:second|minute|hour)s?)?\s*$/i, '')
            .trim();

        const lower = withoutDuration.toLowerCase();
        if (lower === 'watch' || lower === 'watch now' || lower === 'play') return '';

        return withoutDuration;
    }

    function isVideoUrl(url) {
        if (!url) return false;
        try {
            const u = new URL(url, window.location.origin);
            return (
                u.pathname === '/watch' ||
                u.pathname.startsWith('/shorts/') ||
                u.pathname.startsWith('/live/')
            );
        } catch {
            return false;
        }
    }

    function getChannelInfo(videoElement) {
        if (!videoElement) return { name: '', url: '' };

        const directLink =
            videoElement.querySelector('ytd-channel-name a') ||
            videoElement.querySelector('#channel-name a') ||
            videoElement.querySelector('.ytd-channel-name a');

        if (directLink) {
            const name = (directLink.textContent || '').trim();
            const url = (directLink.href || directLink.getAttribute('href') || '').trim();
            return { name, url };
        }

        const channelTextEl =
            videoElement.querySelector('ytd-channel-name') ||
            videoElement.querySelector('#channel-name') ||
            videoElement.querySelector('.ytd-channel-name');
        const channelNameFromText = (channelTextEl?.textContent || '').trim();

        const anchors = Array.from(videoElement.querySelectorAll('a'));
        for (const a of anchors) {
            const url = (a.href || '').trim();
            if (!url) continue;
            if (
                url.includes('youtube.com/@') ||
                url.includes('youtube.com/channel/') ||
                url.includes('youtube.com/c/') ||
                url.includes('youtube.com/user/')
            ) {
                const name = (a.textContent || '').trim();
                return { name: name || channelNameFromText, url };
            }
        }

        return { name: channelNameFromText, url: '' };
    }

    function getVideoTitle(videoElement) {
        const titleSelectors = [
            '#video-title',
            '#video-title-link',
            'a#video-title-link',
            'a#video-title',
            'yt-formatted-string#video-title',
            'h3 a',
            '.ytd-video-renderer #video-title'
        ];

        for (const selector of titleSelectors) {
            const titleElement = videoElement.querySelector(selector);
            if (titleElement) {
                const raw =
                    titleElement.getAttribute('title') ||
                    titleElement.getAttribute('aria-label') ||
                    titleElement.textContent ||
                    '';
                const title = normalizeYouTubeTitle(raw);
                if (title.trim()) return title.trim();
            }
        }
        return '';
    }

    function getWatchAnchor(videoElement) {
        if (!videoElement) return null;

        const explicitTitleAnchor =
            videoElement.querySelector('a#video-title-link') ||
            videoElement.querySelector('a#video-title');
        if (explicitTitleAnchor) return explicitTitleAnchor;

        const anchors = Array.from(videoElement.querySelectorAll('a'));
        const preferred = anchors.find(
            (a) => a.id?.includes('video-title') && isVideoUrl(a.href || a.getAttribute('href'))
        );
        if (preferred) return preferred;
        return anchors.find((a) => isVideoUrl(a.href || a.getAttribute('href'))) || null;
    }

    function isLikelyVideoCard(videoElement) {
        return Boolean(getWatchAnchor(videoElement));
    }

    function getVideoTitleFromWatchAnchor(videoElement) {
        const a = getWatchAnchor(videoElement);
        if (!a) return '';
        const raw = a.getAttribute('title') || a.getAttribute('aria-label') || a.textContent || '';
        return normalizeYouTubeTitle(raw);
    }

    window.ClarigoDOM = {
        getChannelInfo,
        getVideoTitle,
        normalizeYouTubeTitle,
        getWatchAnchor,
        isLikelyVideoCard,
        getVideoTitleFromWatchAnchor
    };
})();
