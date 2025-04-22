// Background script for Tradovate Daily Trade Limiter

// Listen for messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'closeTab' && sender.tab) {
        console.log('Closing tab:', sender.tab.id);
        chrome.tabs.remove(sender.tab.id);
    }
});

// Open options page when extension icon is clicked
chrome.action.onClicked.addListener(() => {
    chrome.runtime.openOptionsPage();
});
