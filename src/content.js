// filters out videos we don't want
const filterVideos = () => {
    const videoElements = document.querySelectorAll('ytd-rich-item-renderer');

    videoElements.forEach((video) => {
        // variables unused for now. these will be the inputs to the model call
        const title = video.querySelector('yt-lockup-metadata-view-model__title');
        // const channelName = video.querySelector('author');

        video.classList.add('cg-hide');

        // if (title && title.indexOf('z') != -1) {
        //     video.classList.add('cg-hide');
        //     console.log(title)
        // } else {
        //     video.classList.remove('cg-hide');
        // }
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