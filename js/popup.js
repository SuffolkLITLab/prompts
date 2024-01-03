chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
  var currentTab = tabs[0]; // There will be only one in this array
  chrome.scripting.executeScript({
    target: { tabId: currentTab.id },
    files: ['js/get_selection.js']
  });
});

document.addEventListener('DOMContentLoaded', function() {
chrome.runtime.sendMessage({ popupOpen: true });
});

chrome.runtime.onMessage.addListener(
  function(request, sender, sendResponse) {
    if (request.data) {
      // Do something with the information from the background
      selectedText = request.data[0];
      bodyText = request.data[1];
      console.log("Highlighted text: "+selectedText+"\n\nBody text: "+bodyText.slice(0,150)+"...");
    }
  }
);

document.addEventListener('DOMContentLoaded', function () {
  templates = JSON.parse(localStorage.templates)
  const buttonList = document.getElementById('button_list');

  //templates.forEach(function(item, index) {
  for (const [key, value] of Object.entries(templates)) {

    if (templates[key]["hide_button"]==false) {
      // Create button element
      const button = document.createElement('button');
      button.textContent = key; // Set button text
      button.id = `template_`+key.replace(/[^a-zA-Z]/g,"_"); // Set button id
      button.dataset.choice = key; // Set data-choice attribute
      button.style.width = '100%'; // Set styles
      button.style.marginBottom = '5px';

      // Add event listener to button
      button.addEventListener('click', function() {
        choose_prompt(this.dataset.choice); // 'this' refers to the button clicked
      });

      // Append button to button list in DOM
      buttonList.appendChild(button);
    }

  };

  start_spinner('thinking');

});

window.onbeforeunload = function () {
  window.scrollTo(0, 0);
}
  