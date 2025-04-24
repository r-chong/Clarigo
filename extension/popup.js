async function sayHello() {
    let [tab] = await chrome.tabs.query({active: true});
    chrome.scripting.executeScript({
        target: {tabId: tab.id},
        func: () => {
            alert("hello this is a test!!!");
        }
    });
}
document.getElementById("run-script").addEventListener("click", sayHello);
//console.log('This is a popup!');
