chrome.runtime.onInstalled.addListener(() => {
  console.log("Workday AI Autofill installed");
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "WORKDAY_FIELDS_SCANNED") {
    console.log("Detected Workday fields:", message.fields);

    chrome.storage.local.set({
      workdayFields: message.fields
    });
  } else if (message.type === "GET_CURRENT_TAB") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length > 0) {
        sendResponse({ url: tabs[0].url, id: tabs[0].id });
      } else {
        sendResponse({ url: null, id: null });
      }
    });
    return true;
  }
});