
// Process videos (both initial and new ones)
const processVideos = () => {
    // Only process new videos that haven't been processed yet
    let videoElements = document.querySelectorAll('ytd-rich-item-renderer:not(.cg-video)');
    
    if (videoElements.length === 0) {
        console.log('Clarigo: No ytd-rich-item-renderer found');
    } else {
        console.log(`Clarigo: Processing ${videoElements.length} new videos...`);
        
        let hiddenCount = 0;
        videoElements.forEach((video) => {
            // Mark as processed to ensure we only run once per video
            video.classList.add('cg-video');
            
            // Apply filtering logic (currently random 50/50)
            if(Math.random() < 0.5) {
                video.classList.add('cg-hide');
                hiddenCount++;
            }
        });
        
        console.log(`Clarigo: Hidden ${hiddenCount} out of ${videoElements.length} videos`);
    }
}

// Debounce function to prevent excessive calls
const debounce = (fn, wait = 500) => {
    let timeout;
    return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => fn(...args), wait);
    }
}

// Debounced version to handle rapid DOM changes
const debouncedProcessVideos = debounce(processVideos, 500);

// Initialize the extension
const initializeClarigo = () => {
    console.log('Clarigo: Initializing...');
    
    // Process any videos that are already loaded
    processVideos();

    // Set up MutationObserver to catch new videos as they load
    console.log('Clarigo: Setting up MutationObserver...');
    const observer = new MutationObserver(debouncedProcessVideos);
    observer.observe(document.body, {
        childList: true, 
        subtree: true
    });

    console.log('Clarigo: Extension active');
};

// Wait for DOM to be ready, then initialize
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeClarigo);
} else {
    // DOM is already loaded
    setTimeout(initializeClarigo, 500); // Small delay to ensure YouTube content is loaded
}
