/**
 * Clarigo onboarding: CTA opens YouTube in a new tab.
 */
(function () {
    const cta = document.getElementById('cta-open-youtube');
    if (!cta) return;

    cta.addEventListener('click', function (e) {
        e.preventDefault();
        const url = 'https://www.youtube.com';
        if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.create) {
            chrome.tabs.create({ url: url });
        } else {
            window.open(url, '_blank', 'noopener');
        }
    });
})();
