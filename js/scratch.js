var scratchPad = document.getElementById('scratch_pad');

// Establish the in-memory baseline before installing focus handlers. This avoids
// treating the window's initial focus as a conflict with saved scratch text.
var current_text = getScratchText();
if (current_text === null) {
    current_text = '';
    setScratchText(current_text);
}
scratchPad.value = current_text;
var scratch_initialized = true;

function currentScratchSelection() {
    if (!scratchPad || typeof scratchPad.selectionStart !== 'number' || typeof scratchPad.selectionEnd !== 'number') {
        return '';
    }
    return scratchPad.value.substring(scratchPad.selectionStart, scratchPad.selectionEnd);
}

function syncScratchSelection() {
    return setScratchSelectionText(currentScratchSelection());
}

function liveScratchPageContext() {
    return {
        highlighted: currentScratchSelection(),
        innerText: scratchPad ? String(scratchPad.value || '') : getScratchText(),
        innerHTML: ''
    };
}

// The toolbar popup can start before a window blur snapshot has been committed.
// Answer a direct context request from the popup so selection/text are read from
// the live Scratch Pad DOM. The localStorage snapshot remains as a fallback.
var litContextTabId = null;
if (typeof LitPlatform !== 'undefined') {
    if (typeof LitPlatform.getCurrentTab === 'function') {
        LitPlatform.getCurrentTab().then(function(tab) {
            if (tab && typeof tab.id !== 'undefined') litContextTabId = tab.id;
        }).catch(function() {});
    }
    LitPlatform.addMessageListener(function(request, sender, sendResponse) {
        if (!request || request.litContextRequest !== 'scratch') return;
        if (request.activeTabId != null && litContextTabId != null && String(request.activeTabId) !== String(litContextTabId)) return false;
        if (request.activeTabId != null && litContextTabId == null) return false;
        var context = liveScratchPageContext();
        setScratchSelectionText(context.highlighted);
        setScratchText(context.innerText);
        if (typeof sendResponse === 'function') sendResponse(context);
        return false;
    });
}

function pause() {
    if (!scratch_initialized) return;
    current_text = scratchPad.value;
    setScratchText(current_text);
    // Clicking the browser toolbar blurs the Scratch Pad before the popup opens.
    // Capture the textarea's selection at that moment so {{highlighted}} can use
    // the selection from the active Scratch Pad tab without persisting it as a
    // generic "last selection" for other pages.
    syncScratchSelection();
}

function active() {
    if (!scratch_initialized) return;

    var savedText = getScratchText();
    if (savedText === null) savedText = '';

    if (savedText !== current_text) {
        if (confirm('Current text and saved text differ. This happens when you write to the scratch pad from elsewhere, be it a prompt or another window. "OK" to load saved text, "Cancel" to keep the current text.') == true) {
            scratchPad.value = savedText;
            current_text = savedText;
        } else {
            setScratchText(current_text);
        }
    }
}

// Save text to localStorage on change and keep the comparison baseline in sync.
scratchPad.addEventListener('input', function() {
    setScratchText(this.value);
    current_text = this.value;
    syncScratchSelection();
});

// Keep the current textarea selection synchronized while the Scratch Pad is the
// active tab. The blur handler above provides the final update when the user
// clicks the browser toolbar to trigger LIT Prompting.
['select', 'mouseup', 'keyup', 'click'].forEach(function(eventName) {
    scratchPad.addEventListener(eventName, syncScratchSelection);
});

window.addEventListener('blur', pause);
window.addEventListener('focus', active);

scratchPad.focus();
scratchPad.setSelectionRange(0, 0);
syncScratchSelection();

document.addEventListener('DOMContentLoaded', function() {
    var open_scratch = document.getElementById('open_scratch');
    open_scratch.addEventListener('click', function() {
        if (confirm('This will replace the current scratch pad contents with the file you upload. Choose "OK" to continue or "Cancel" to keep things as they are.') == true) {
            document.getElementById('fileInput').click(); // Trigger file input
        }
    });

    document.getElementById('fileInput').addEventListener('change', function(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = function(e) {
            const contents = e.target.result;
            try {
                scratchPad.value = contents;
                setScratchText(contents);
                current_text = contents;
            } catch (error) {
                console.error('Error reading file: ', error);
            }
        };
        reader.readAsText(file);
    });

    var save_scratch = document.getElementById('save_scratch');
    save_scratch.addEventListener('click', function() {
        saveTextAsFile(scratchPad.value, timestampedDownloadFilename('scratch_pad_', 'txt', new Date()));
    });
});
