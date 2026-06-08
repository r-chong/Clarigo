/**
 * YouTube feed scraper: collect title + channel from video cards on any YouTube page.
 * Depends on youtube-dom.js (ClarigoDOM).
 */
(function () {
    'use strict';

    const PROCESSED_CLASS = 'hs-processed';
    const VIDEO_CARD_TAGS = [
        'ytd-rich-item-renderer',
        'ytd-video-renderer',
        'ytd-grid-video-renderer',
        'ytd-compact-video-renderer',
        'ytd-reel-item-renderer',
        'ytd-playlist-video-renderer'
    ];
    const VIDEO_SELECTORS = VIDEO_CARD_TAGS.map(
        (tag) => `${tag}:not(.${PROCESSED_CLASS})`
    );

    let scrapingEnabled = true;

    function buildRecord(videoElement) {
        const {
            getChannelInfo,
            getVideoTitle,
            getVideoTitleFromWatchAnchor,
            getWatchAnchor,
            getVideoIdFromUrl,
            getChannelIdFromUrl
        } = window.ClarigoDOM;

        const anchor = getWatchAnchor(videoElement);
        const videoUrl = (anchor?.href || anchor?.getAttribute('href') || '').trim();
        const videoId = getVideoIdFromUrl(videoUrl);
        if (!videoId) return null;

        const title = getVideoTitle(videoElement) || getVideoTitleFromWatchAnchor(videoElement);
        const channel = getChannelInfo(videoElement);
        const channelId = getChannelIdFromUrl(channel.url);

        return {
            videoId,
            title: title || '',
            channelName: channel.name || '',
            channelId: channelId || '',
            channelUrl: channel.url || '',
            videoUrl: `https://www.youtube.com/watch?v=${videoId}`,
            source: 'youtube_feed',
            scraped_at: new Date().toISOString()
        };
    }

    async function saveRecord(record) {
        const data = await chrome.storage.local.get('records');
        const records = data.records || {};
        if (records[record.videoId]) return false;

        records[record.videoId] = record;
        await chrome.storage.local.set({ records });
        chrome.runtime.sendMessage({
            type: 'countUpdated',
            count: Object.keys(records).length
        }).catch(() => {});
        return true;
    }

    function nodeHasVideoCard(node) {
        if (node.nodeType !== Node.ELEMENT_NODE) return false;
        const el = node;
        if (!el.matches) return false;
        if (VIDEO_CARD_TAGS.some((tag) => el.matches(tag))) return true;
        return VIDEO_CARD_TAGS.some((tag) => el.querySelector?.(tag));
    }

    async function scrapeVisibleVideos() {
        if (!scrapingEnabled) return;

        const elements = [];
        VIDEO_SELECTORS.forEach((selector) => {
            elements.push(...document.querySelectorAll(selector));
        });
        if (elements.length === 0) return;

        const { isLikelyVideoCard } = window.ClarigoDOM;
        let newCount = 0;

        for (const el of elements) {
            if (!isLikelyVideoCard(el)) continue;

            el.classList.add(PROCESSED_CLASS);
            const record = buildRecord(el);
            if (!record || !record.title) continue;

            const saved = await saveRecord(record);
            if (saved) newCount++;
        }

        if (newCount > 0) {
            console.log(`YouTube Feed Scraper: saved ${newCount} new video(s)`);
        }
    }

    const debouncedScrape = (() => {
        let timeout;
        return () => {
            clearTimeout(timeout);
            timeout = setTimeout(() => scrapeVisibleVideos(), 300);
        };
    })();

    function resetProcessedMarkers() {
        document.querySelectorAll(`.${PROCESSED_CLASS}`).forEach((el) => {
            el.classList.remove(PROCESSED_CLASS);
        });
    }

    function startObserver() {
        const target = document.querySelector('ytd-app') || document.body;
        const observer = new MutationObserver((mutations) => {
            if (!scrapingEnabled) return;

            let shouldScrape = false;
            for (const mutation of mutations) {
                if (mutation.type !== 'childList' || mutation.addedNodes.length === 0) continue;
                for (const node of mutation.addedNodes) {
                    if (nodeHasVideoCard(node)) {
                        shouldScrape = true;
                        break;
                    }
                }
                if (shouldScrape) break;
            }
            if (shouldScrape) debouncedScrape();
        });

        observer.observe(target, { childList: true, subtree: true });
    }

    function watchNavigation() {
        let lastUrl = location.href;
        const onNavigate = () => {
            const currentUrl = location.href;
            if (currentUrl === lastUrl) return;
            lastUrl = currentUrl;
            resetProcessedMarkers();
            setTimeout(() => scrapeVisibleVideos(), 1000);
        };

        const titleEl = document.querySelector('title');
        if (titleEl) {
            new MutationObserver(onNavigate).observe(titleEl, { childList: true, subtree: true });
        } else {
            new MutationObserver(onNavigate).observe(document.head, { childList: true, subtree: true });
        }
    }

    chrome.runtime.onMessage.addListener((msg) => {
        if (msg.type === 'scrapingChanged') {
            scrapingEnabled = msg.enabled !== false;
            if (scrapingEnabled) {
                resetProcessedMarkers();
                scrapeVisibleVideos();
            }
        }
    });

    async function init() {
        const data = await chrome.storage.local.get('scrapingEnabled');
        scrapingEnabled = data.scrapingEnabled !== false;

        startObserver();
        watchNavigation();

        setTimeout(() => scrapeVisibleVideos(), 2000);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
