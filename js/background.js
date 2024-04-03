// Function to send data to the popup
function sendInfoToPopup(info) {
    chrome.runtime.sendMessage({ data: info });
}  

chrome.runtime.onMessage.addListener(
function(request, sender, sendResponse) {
  if (request.selectedText) {
      sendInfoToPopup(request.selectedText);
  }
  if (request.bodyText) {
      sendInfoToPopup(request.bodyText);
  }
  if (request.run_location) {
    sendInfoToPopup(request.run_location);
}
});
