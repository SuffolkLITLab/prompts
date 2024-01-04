// Load saved text from localStorage
var savedText = localStorage.getItem('scratch_pad');
if (savedText) {
    document.getElementById('scratch_pad').value = savedText;
} 

function pause() {
    console.log("FOCUS LOST!");
    current_text = document.getElementById('scratch_pad').value;
    localStorage.setItem('scratch_pad', current_text);
}

function active() {
    console.log("This document has focus. Click outside the document to lose focus.");
    var savedText = localStorage.getItem('scratch_pad');
    if (savedText != current_text) {
        if (confirm('Current text and saved text differ. This happens when you write to the scratch pad from elsewhere, be it a prompt or another window. "OK" to load saved text, "Cancel" to keep the current text.') == true) {
            document.getElementById('scratch_pad').value = savedText;
            current_text = savedText;
        } else {
            localStorage.setItem('scratch_pad', current_text);
        }
    }
}

// Save text to localStorage on change
document.getElementById('scratch_pad').addEventListener('input', function() {
    localStorage.setItem('scratch_pad', this.value);
    current_text = this.value;
});

window.addEventListener("blur", pause);
window.addEventListener("focus", active);

var current_text = document.getElementById('scratch_pad').value
document.getElementById('scratch_pad').focus();
document.getElementById('scratch_pad').setSelectionRange(0,0);

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
                document.getElementById('scratch_pad').value = contents;
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