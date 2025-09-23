// filters out videos we don't want
const filterVideos = () => {
    const videoElements = document.querySelectorAll('yt-lockup-view-model');

    videoElements.forEach((video) => {
        // variables unused for now. these will be the inputs to the model call
        const title = video.querySelector('a.yt-lockup-view-model__title span');
        // const channelName = video.querySelector('author');

        if (title && title.indexOf('z') != -1) {
            video.classList.add('cg-hide');
            console.log(title)
        } else {
            video.classList.remove('cg-hide');
        }
    });
};

const runOnce = () => {
    filterVideos();
}

runOnce();

// debounce to collapse multiple DOM events into one call
const debounce = (fn, wait = 300) => {
    let t;

    return (...args) => {
        clearTimeout();
        t = setTimeout(() => fn(...args), wait);
    }
}

const onMutations = debounce(() => {
    runOnce();
}, 350);

const observer = new MutationObserver(debounce(runOnce, 350));
observer.observe(document.body, {childList: true, subtree: true})