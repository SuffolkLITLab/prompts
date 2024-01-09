// Get the selected text
function getSelectionFromPage() {
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
  let body_text = document.getElementById('scratch_pad').value;

  console.log(selectedText,body_text)

  return [selectedText,body_text]
}

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
      button.addEventListener('mousedown', function() {
        text_arry = getSelectionFromPage(); selectedText = text_arry[0]; bodyText = text_arry[1];
      });
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

document.addEventListener('DOMContentLoaded', function() {
        
  var open_scratch = document.getElementById('open_scratch');
  document.getElementById('open_scratch').addEventListener('click', function() {
      if (confirm('This will replace the current scrtach pad contents with the file you upload. Choose "OK" to continue or "Cancel" to keep things as they are.') == true) {
          document.getElementById('fileInput').click(); // Trigger file input
      }
  });
  document.getElementById('fileInput').addEventListener('change', function(event) {
      const file = event.target.files[0];
      if (!file) {
          return;
      }

      const reader = new FileReader();
      reader.onload = function(e) {
          const contents = e.target.result;
          try {
              document.getElementById('scratch_pad').value = contents
              localStorage.setItem('scratch_pad', contents);
              //const json = JSON.parse(contents);
              //updatePromptsFromJson(json); // Function to update prompts
          } catch (error) {
              console.error("Error reading file: ", error);
              // Handle errors (invalid file, etc.)
          }
      };
      reader.readAsText(file);
  });

  var save_scratch = document.getElementById('save_scratch');
  save_scratch.addEventListener('click', function() {
      saveTextAsFile(document.getElementById('scratch_pad').value,"scratch_pad.txt")
  });

});