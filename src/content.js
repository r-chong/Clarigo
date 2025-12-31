/**
 * Extract channel info from a YouTube "video card" element.
 *
 * Important: On some YouTube surfaces the channel link may not have an `href`
 * *attribute* (only the `.href` property). CSS selectors like `a[href*="..."]`
 * won't match those, so we do this in JS and add `.cg-hide` to the whole card.
 */
const getChannelInfo = (videoElement) => {
    if (!videoElement) return { name: '', url: '' };

    // Common, explicit channel link locations
    const directLink =
        videoElement.querySelector('ytd-channel-name a') ||
        videoElement.querySelector('#channel-name a') ||
        videoElement.querySelector('.ytd-channel-name a');

    if (directLink) {
        const name = (directLink.textContent || '').trim();
        const url = (directLink.href || directLink.getAttribute('href') || '').trim();
        return { name, url };
    }

    // If there's channel name text but no link, still return the text (useful for the model)
    const channelTextEl =
        videoElement.querySelector('ytd-channel-name') ||
        videoElement.querySelector('#channel-name') ||
        videoElement.querySelector('.ytd-channel-name');
    const channelNameFromText = (channelTextEl?.textContent || '').trim();

    // Fallback: scan anchors and find a channel-ish URL via the `.href` property
    const anchors = Array.from(videoElement.querySelectorAll('a'));
    for (const a of anchors) {
        const url = (a.href || '').trim();
        if (!url) continue;

        // Likely channel URL formats:
        // - https://www.youtube.com/@handle
        // - https://www.youtube.com/channel/UC...
        // - https://www.youtube.com/c/...
        // - https://www.youtube.com/user/...
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
};

const normalizeYouTubeTitle = (raw) => {
    const text = (raw || '').trim();
    if (!text) return '';

    // Strip a trailing duration-ish suffix, e.g. "Some title 7 minutes, 52 seconds"
    const withoutDuration = text
        .replace(/\s+\d+\s+(?:second|minute|hour)s?(?:,\s*\d+\s+(?:second|minute|hour)s?)?\s*$/i, '')
        .trim();

    // Ignore generic UI labels that sometimes appear as overlay anchors/buttons
    const lower = withoutDuration.toLowerCase();
    if (lower === 'watch' || lower === 'watch now' || lower === 'play') return '';

    return withoutDuration;
};

// extract video title from a video element
const getVideoTitle = (videoElement) => {
    // youtube stores titles in different places depending on the page
    // how it works is:
    // Home page: ytd-rich-item-renderer > #video-title-link
    // Search/Other: various selectors
    
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
            if (title.trim()) {
                return title.trim();
            }
        }
    }
    
    return '';
};

const isVideoUrl = (url) => {
    if (!url) return false;
    try {
        // Handles absolute and relative URLs
        const u = new URL(url, window.location.origin);
        // Common YouTube video URL patterns
        // - /watch?v=...
        // - /shorts/VIDEO_ID
        // - /live/VIDEO_ID
        return (
            u.pathname === '/watch' ||
            u.pathname.startsWith('/shorts/') ||
            u.pathname.startsWith('/live/')
        );
    } catch {
        return false;
    }
};

const getWatchAnchor = (videoElement) => {
    if (!videoElement) return null;

    // Strong preference: explicit title links on most surfaces
    const explicitTitleAnchor =
        videoElement.querySelector('a#video-title-link') ||
        videoElement.querySelector('a#video-title');
    if (explicitTitleAnchor) return explicitTitleAnchor;

    const anchors = Array.from(videoElement.querySelectorAll('a'));
    // Prefer anchors that look like title links if present
    const preferred = anchors.find(a => a.id?.includes('video-title') && isVideoUrl(a.href || a.getAttribute('href')));
    if (preferred) return preferred;
    // Otherwise any video link in the card
    return anchors.find(a => isVideoUrl(a.href || a.getAttribute('href'))) || null;
};

const isLikelyVideoCard = (videoElement) => {
    // Homepage can include shelves/sections/ads inside ytd-rich-item-renderer.
    // Detect a real video card by presence of a /watch link (using `.href` property).
    return Boolean(getWatchAnchor(videoElement));
};

const getVideoTitleFromWatchAnchor = (videoElement) => {
    const a = getWatchAnchor(videoElement);
    if (!a) return '';
    const raw = a.getAttribute('title') || a.getAttribute('aria-label') || a.textContent || '';
    return normalizeYouTubeTitle(raw);
};

// Determine if a video should be hidden (placeholder for the model).
// Currently: hide videos with "Z" or "z" in the title.
// Later: replace this with model(title, channelName).
const shouldHideVideo = ({ title /*, channelName */ }) => {
    if (!title) return false;
    return title.toLowerCase().includes('a');
};

// Process videos (both initial and new ones)
const processVideos = () => {
    // YouTube uses different renderers for different pages
    // Home/Feed: ytd-rich-item-renderer
    // Search/Subscriptions: ytd-video-renderer
    // Both should be supported
    const videoSelectors = [
        'ytd-rich-item-renderer:not(.cg-processed)',
        'ytd-video-renderer:not(.cg-processed)',
        'ytd-grid-video-renderer:not(.cg-processed)'
    ];
    
    let allVideoElements = [];
    videoSelectors.forEach(selector => {
        const elements = document.querySelectorAll(selector);
        allVideoElements = allVideoElements.concat(Array.from(elements));
    });
    
    if (allVideoElements.length === 0) {
        console.log('Clarigo: No unprocessed video elements found');
        return;
    }
    
    console.log(`Clarigo: Processing ${allVideoElements.length} new videos...`);
    
    let hiddenCount = 0;
    let processedCount = 0;
    
    allVideoElements.forEach((videoElement) => {
        // Skip non-video items (shelves/sections) to avoid noisy logs and bad extraction
        // Important: don't mark these as processed, because many homepage items are
        // skeletons that "hydrate" later into real video cards.
        if (!isLikelyVideoCard(videoElement)) {
            return;
        }

        // Mark as processed to ensure we only run once per video
        videoElement.classList.add('cg-processed');
        processedCount++;
        
        const title = getVideoTitle(videoElement) || getVideoTitleFromWatchAnchor(videoElement);
        const channel = getChannelInfo(videoElement);
        
        if (!title) {
            console.log('Clarigo: Could not extract title from video element');
            // Still allow channel-based blocking even if title extraction fails
        }
        
        // Apply filtering logic
        if (shouldHideVideo({ title, channelName: channel.name })) {
            videoElement.classList.add('cg-hide');
            hiddenCount++;
            console.log(`Clarigo: Hiding video - "${title || '(no title)'}"`, {
                channelName: channel.name,
                channelUrl: channel.url
            });
        } else {
            console.log(`Clarigo: Showing video - "${title}" by "${channelName}"`);
        }
    });
    
    console.log(`Clarigo: Processed ${processedCount} videos, hidden ${hiddenCount}`);
};

// Debounce function to prevent excessive calls
const debounce = (fn, wait = 300) => {
    let timeout;
    return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => fn(...args), wait);
    };
};

// Debounced version to handle rapid DOM changes
const debouncedProcessVideos = debounce(processVideos, 300);

// Initialize the extension
const initializeClarigo = () => {
    console.log('Clarigo: Initializing extension...');
    console.log('Clarigo: Current URL:', window.location.href);
    
    // Wait a bit for YouTube to render
    setTimeout(() => {
        if (modelLoaded) {
            console.log("Processing initial Videos");
        } else {
            console.log("Clarigo: Model still loading");
        }
        processVideos();
    }, 2000);
    
    // Set up MutationObserver to catch new videos as they load
    // YouTube is a SPA (Single Page Application), so we need to watch for dynamic content
    console.log('Clarigo: Setting up MutationObserver...');
    
    const observer = new MutationObserver((mutations) => {
        // check if any mutations added video elements
        let shouldProcess = false;
        
        for (const mutation of mutations) {
            if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                for (const node of mutation.addedNodes) {
                    // check if the added node or its children contain video elements
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        const hasVideos = node.matches && (
                            node.matches('ytd-rich-item-renderer') ||
                            node.matches('ytd-video-renderer') ||
                            node.matches('ytd-grid-video-renderer') ||
                            node.querySelector('ytd-rich-item-renderer') ||
                            node.querySelector('ytd-video-renderer') ||
                            node.querySelector('ytd-grid-video-renderer')
                        );
                        
                        if (hasVideos) {
                            shouldProcess = true;
                            break;
                        }
                    }
                }
            }
            if (shouldProcess) break;
        }
        
        if (shouldProcess) {
            console.log('Clarigo: New videos detected, processing...');
            debouncedProcessVideos();
        }
    });
    
    // Observe the main content area where videos are rendered
    const targetNode = document.querySelector('ytd-app') || document.body;
    
    observer.observe(targetNode, {
        childList: true,
        subtree: true
    });
    
    console.log('Clarigo: MutationObserver active');
    console.log('Clarigo: Extension fully initialized');
    console.log('Clarigo: Videos with "Z" in title will be hidden');
};

// handle YouTube's SPA navigation
// YouTube doesn't reload the page when navigating, so must re-process on navigation
let lastUrl = location.href;
const titleElement = document.querySelector('title');
const navigationObserver = new MutationObserver(() => {
    const currentUrl = location.href;
    if (currentUrl !== lastUrl) {
        lastUrl = currentUrl;
        console.log('Clarigo: Page navigation detected, re-initializing...');
        setTimeout(processVideos, 1000);
    }
});
if (titleElement) {
    navigationObserver.observe(titleElement, { 
        childList: true, 
        subtree: true 
    });
} else {
    // Fallback: observe document.head if title is missing
    console.warn('Clarigo: <title> element not found, using <head> as fallback for navigation observer.');
    navigationObserver.observe(document.head, { 
        childList: true, 
        subtree: true 
    });
}

// Wait for DOM to be ready, then initialize
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeClarigo);
} else {
    // DOM is already loaded
    initializeClarigo();
}
