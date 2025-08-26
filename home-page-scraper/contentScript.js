(() => {
    'use strict';

    const RICH_ITEM_SELECTOR = 'ytd-rich-item-renderer, ytd-video-renderer';
    const COMPACT_ITEM_SELECTOR = 'ytd-compact-video-renderer';
    const PROCESSED_ATTR = 'data-educational-poc-processed';

    let loggedHomeCount = 0;
    let loggedSidebarCount = 0;
    const LOG_LIMIT_PER_TYPE = 20;
    let filterEnabled = true;

    // Collected items for JSON export
    const collected = [];

    function getTextContent(root, selector) {
        const node = root.querySelector(selector);
        return node ? node.textContent.trim() : '';
    }

    function getHrefAbsolute(root, selector) {
        const anchor = root.querySelector(selector);
        if (!anchor) return '';
        const rawHref = anchor.getAttribute('href') || '';
        if (anchor.href) return anchor.href;
        try {
            return rawHref ? new URL(rawHref, location.origin).href : '';
        } catch {
            return '';
        }
    }

    function extractVideoIdFromUrl(urlString) {
        try {
            const url = new URL(urlString, location.origin);
            if (url.hostname === 'youtu.be') {
                return url.pathname.replace('/', '');
            }
            return url.searchParams.get('v') || '';
        } catch {
            return '';
        }
    }

    function extractTagsFromTitle(title) {
        if (!title) return [];
        const tags = [];
        // capture #hashtags (letters, numbers, underscores, hyphens)
        const re = /#([A-Za-z0-9_\-]+)/g;
        let m;
        while ((m = re.exec(title)) !== null) {
            tags.push(m[1]);
        }
        // de-dupe while preserving order
        return [...new Set(tags)];
    }

    function extractFromRichItem(card) {
        const titleSelectors = [
            'a#video-title',
            'h3 a',
            '.ytd-video-meta-block a',
            'a[href*="/watch"]',
        ];
        const channelSelectors = [
            'ytd-channel-name a',
            '.ytd-channel-name a',
            '#channel-name a',
            '.ytd-video-owner-renderer .ytd-channel-name a',
            '.ytd-video-meta-block .ytd-channel-name a',
            'yt-formatted-string[href*="/channel/"]',
            'yt-formatted-string[href*="/@"]',
            'a[href*="/channel/"]',
            'a[href*="/@"]',
        ];
        const channelTextSelectors = [
            'ytd-channel-name yt-formatted-string',
            '.ytd-channel-name yt-formatted-string',
            '#channel-name yt-formatted-string',
            '.ytd-video-owner-renderer .ytd-channel-name yt-formatted-string',
            'yt-formatted-string[href*="/channel/"]',
            'yt-formatted-string[href*="/@"]',
        ];

        let title = '';
        let videoUrl = '';
        for (const selector of titleSelectors) {
            title = getTextContent(card, selector);
            videoUrl = getHrefAbsolute(card, selector);
            if (title && videoUrl) break;
        }

        let channelName = '';
        let channelUrl = '';
        for (const selector of channelSelectors) {
            channelName = getTextContent(card, selector);
            channelUrl = getHrefAbsolute(card, selector);
            if (channelName && channelUrl) break;
        }
        if (!channelName) {
            for (const selector of channelTextSelectors) {
                channelName = getTextContent(card, selector);
                if (channelName) {
                    const linkSelector = selector.replace(
                        'yt-formatted-string',
                        'a'
                    );
                    channelUrl = getHrefAbsolute(card, linkSelector);
                    break;
                }
            }
        }

        const videoId = extractVideoIdFromUrl(videoUrl);
        const isShort = /\/shorts\//.test(videoUrl);
        const tags = extractTagsFromTitle(title);

        return {
            type: 'home',
            title,
            videoUrl,
            videoId,
            channelName,
            channelUrl,
            tags,
            isShort,
            ts: Date.now(),
        };
    }

    function extractFromCompactItem(card) {
        const titleSelectors = ['a#video-title', 'h3 a', 'a[href*="/watch"]'];
        const channelSelectors = [
            'ytd-channel-name a',
            '#channel-name a',
            '.ytd-video-meta-block .ytd-channel-name a',
            '.ytd-video-owner-renderer .ytd-channel-name a',
            'yt-formatted-string[href*="/channel/"]',
            'yt-formatted-string[href*="/@"]',
            'a[href*="/channel/"]',
            'a[href*="/@"]',
        ];
        const channelTextSelectors = [
            'ytd-channel-name yt-formatted-string',
            '#channel-name yt-formatted-string',
            '.ytd-video-meta-block .ytd-channel-name yt-formatted-string',
            '.ytd-video-owner-renderer .ytd-channel-name yt-formatted-string',
            'yt-formatted-string[href*="/channel/"]',
            'yt-formatted-string[href*="/@"]',
        ];

        let title = '';
        let videoUrl = '';
        for (const selector of titleSelectors) {
            title = getTextContent(card, selector);
            videoUrl = getHrefAbsolute(card, selector);
            if (title && videoUrl) break;
        }

        let channelName = '';
        let channelUrl = '';
        for (const selector of channelSelectors) {
            channelName = getTextContent(card, selector);
            channelUrl = getHrefAbsolute(card, selector);
            if (channelName && channelUrl) break;
        }
        if (!channelName) {
            for (const selector of channelTextSelectors) {
                channelName = getTextContent(card, selector);
                if (channelName) {
                    const linkSelector = selector.replace(
                        'yt-formatted-string',
                        'a'
                    );
                    channelUrl = getHrefAbsolute(card, linkSelector);
                    break;
                }
            }
        }

        const videoId = extractVideoIdFromUrl(videoUrl);
        const isShort = /\/shorts\//.test(videoUrl);
        const tags = extractTagsFromTitle(title);

        return {
            type: 'sidebar',
            title,
            videoUrl,
            videoId,
            channelName,
            channelUrl,
            tags,
            isShort,
            ts: Date.now(),
        };
    }

    function processCardIfNeeded(card, extractor) {
        if (!(card instanceof Element)) return;
        if (card.hasAttribute(PROCESSED_ATTR)) return;
        card.setAttribute(PROCESSED_ATTR, '1');

        const metadata = extractor(card);
        if (!metadata || !metadata.title || !metadata.videoUrl) return;

        // keep a lightweight console log for quick inspection
        if (metadata.type === 'home' && loggedHomeCount < LOG_LIMIT_PER_TYPE) {
            console.log('[EduFilter][metadata]', metadata);
            loggedHomeCount += 1;
        } else if (
            metadata.type === 'sidebar' &&
            loggedSidebarCount < LOG_LIMIT_PER_TYPE
        ) {
            console.log('[EduFilter][metadata]', metadata);
            loggedSidebarCount += 1;
        }

        collected.push(metadata);
    }

    function extractVideoPageMetadata() {
        if (!window.location.pathname.includes('/watch')) return null;

        const titleSelectors = [
            'h1.ytd-video-primary-info-renderer',
            'h1.title',
            '.ytd-video-primary-info-renderer h1',
            'yt-formatted-string.ytd-video-primary-info-renderer',
        ];
        const channelSelectors = [
            'ytd-video-owner-renderer .ytd-channel-name a',
            'ytd-channel-name a',
            '.ytd-video-owner-renderer yt-formatted-string[href*="/channel/"]',
            '.ytd-video-owner-renderer yt-formatted-string[href*="/@"]',
        ];

        let title = '';
        for (const s of titleSelectors) {
            title = getTextContent(document, s);
            if (title) break;
        }

        let channelName = '';
        let channelUrl = '';
        for (const s of channelSelectors) {
            channelName = getTextContent(document, s);
            channelUrl = getHrefAbsolute(document, s);
            if (channelName) break;
        }

        const videoId = extractVideoIdFromUrl(window.location.href);
        const isShort = /\/shorts\//.test(window.location.href);
        const tags = extractTagsFromTitle(title);

        return {
            type: 'video_page',
            title,
            videoUrl: window.location.href,
            videoId,
            channelName,
            channelUrl,
            tags,
            isShort,
            ts: Date.now(),
        };
    }

    function initialScan() {
        console.log('[EduFilter] Running initial scan...');

        if (window.location.pathname.includes('/watch')) {
            const videoPageData = extractVideoPageMetadata();
            if (videoPageData && videoPageData.title) {
                console.log('[EduFilter][metadata]', videoPageData);
                collected.push(videoPageData);
            }
        }

        const richItems = document.querySelectorAll(RICH_ITEM_SELECTOR);
        const compactItems = document.querySelectorAll(COMPACT_ITEM_SELECTOR);
        console.log(
            `[EduFilter] Found ${richItems.length} rich items, ${compactItems.length} compact items`
        );

        richItems.forEach((el) => processCardIfNeeded(el, extractFromRichItem));
        compactItems.forEach((el) =>
            processCardIfNeeded(el, extractFromCompactItem)
        );
    }

    function startObserver() {
        const target = document.documentElement || document.body;
        const observer = new MutationObserver((mutations) => {
            let shouldCheckVideoPage = false;

            for (const mutation of mutations) {
                mutation.addedNodes.forEach((node) => {
                    if (!(node instanceof Element)) return;

                    if (
                        node.matches &&
                        (node.matches('ytd-page-manager') ||
                            node.matches('#content'))
                    ) {
                        shouldCheckVideoPage = true;
                    }

                    if (node.matches && node.matches(RICH_ITEM_SELECTOR)) {
                        processCardIfNeeded(node, extractFromRichItem);
                        return;
                    }
                    if (node.matches && node.matches(COMPACT_ITEM_SELECTOR)) {
                        processCardIfNeeded(node, extractFromCompactItem);
                        return;
                    }
                    const richChildren = node.querySelectorAll
                        ? node.querySelectorAll(RICH_ITEM_SELECTOR)
                        : [];
                    richChildren.forEach((el) =>
                        processCardIfNeeded(el, extractFromRichItem)
                    );
                    const compactChildren = node.querySelectorAll
                        ? node.querySelectorAll(COMPACT_ITEM_SELECTOR)
                        : [];
                    compactChildren.forEach((el) =>
                        processCardIfNeeded(el, extractFromCompactItem)
                    );
                });
            }

            if (
                shouldCheckVideoPage &&
                window.location.pathname.includes('/watch')
            ) {
                setTimeout(() => {
                    const videoPageData = extractVideoPageMetadata();
                    if (videoPageData && videoPageData.title) {
                        console.log('[EduFilter][metadata]', videoPageData);
                        collected.push(videoPageData);
                    }
                }, 500);
            }
        });
        observer.observe(target, { childList: true, subtree: true });
    }

    function addExportButton() {
        const btn = document.createElement('button');
        btn.textContent = 'Export JSONL';
        btn.id = 'educational-filter-export';
        Object.assign(btn.style, {
            position: 'fixed',
            bottom: '12px',
            right: '12px',
            zIndex: '2147483647',
            background: '#111',
            color: '#fff',
            padding: '8px 10px',
            fontFamily:
                'system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif',
            fontSize: '12px',
            borderRadius: '8px',
            border: '1px solid #333',
            cursor: 'pointer',
            opacity: '0.9',
        });

        btn.addEventListener('click', () => {
            // Instead of array, output JSONL string
            const jsonl = collected
                .map((obj) => JSON.stringify(obj))
                .join('\n');
            const blob = new Blob([jsonl], { type: 'application/jsonl' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `youtube_home_${new Date()
                .toISOString()
                .slice(0, 10)}.jsonl`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
        });

        document.documentElement.appendChild(btn);
    }

    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === 'getStatus') {
            sendResponse({ enabled: filterEnabled });
        } else if (request.action === 'toggle') {
            filterEnabled = !filterEnabled;
            console.log(
                `[EduFilter] Filter ${filterEnabled ? 'enabled' : 'disabled'}`
            );
            sendResponse({ enabled: filterEnabled });
        }
    });

    function onDocumentReady(callback) {
        if (
            document.readyState === 'complete' ||
            document.readyState === 'interactive'
        ) {
            callback();
            return;
        }
        document.addEventListener('DOMContentLoaded', () => callback(), {
            once: true,
        });
    }

    onDocumentReady(() => {
        if (!window.location.hostname.includes('youtube.com')) return;

        try {
            const badge = document.createElement('div');
            badge.textContent = 'EduFilter active';
            badge.id = 'educational-filter-badge';
            Object.assign(badge.style, {
                position: 'fixed',
                bottom: '12px',
                right: '100px',
                zIndex: '2147483647',
                background: 'rgba(0,0,0,0.75)',
                color: '#fff',
                padding: '6px 8px',
                fontFamily:
                    'system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif',
                fontSize: '12px',
                borderRadius: '6px',
                pointerEvents: 'none',
            });
            document.documentElement.appendChild(badge);
            setTimeout(() => badge.remove(), 3000);
        } catch {}

        setTimeout(() => {
            initialScan();
            startObserver();
            addExportButton();
        }, 1000);
    });
})();
