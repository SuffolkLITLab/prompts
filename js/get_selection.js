// Get the selected text
function getSelectionFromPage() {
  let selectedText = window.getSelection().toString();
      
  if (selectedText.length === 0) {
    const focusedElement = document.activeElement;

    if (focusedElement) {
      if (focusedElement.tagName.toLowerCase() === 'textarea' || focusedElement.tagName.toLowerCase() === 'input') {
        if (typeof focusedElement.selectionStart === 'number' && typeof focusedElement.selectionEnd === 'number') {
          selectedText = focusedElement.value.substring(focusedElement.selectionStart, focusedElement.selectionEnd);
        } else if (focusedElement.selectionStart === undefined) {
          // For input elements in some browsers like Firefox
          const selection = focusedElement.value.substring(
            focusedElement.selectionStart, focusedElement.selectionEnd
          );
          if (selection) {
            selectedText = selection;
          }
        }
      }
    }
  }
  body_text = document.body.innerText;
  try {
    run_location = window.location.toString();    
  } catch (error) {
    run_location = "location unknown";
  }
  
  console.log(selectedText,body_text,run_location)

  return [selectedText,body_text,run_location]
}
chrome.runtime.sendMessage({selectedText:getSelectionFromPage()})
