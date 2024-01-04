document.addEventListener('DOMContentLoaded', function() {
    // Load saved text from localStorage
    var api_key = localStorage.getItem('api_key');
    if (api_key) {
        document.getElementById('api_key').value = api_key;
    }
    // Save text to localStorage on change
    document.getElementById('api_key').addEventListener('input', function() {
        localStorage.setItem('api_key', this.value);
    });

    // Load saved text from localStorage
    var api_base = localStorage.getItem('api_base') //|| "https://api.openai.com/v1/chat/completions";
    if (api_base) {
        document.getElementById('api_base').value = api_base;
    }
    // Save text to localStorage on change
    document.getElementById('api_base').addEventListener('input', function() {
        localStorage.setItem('api_base', this.value);
    });

    // Load saved text from localStorage
    if (localStorage.custom_html) {
        custom_html = localStorage.custom_html
    } else {
        if (localStorage.custom_html=="") {
            custom_html = ""
        } else {
            custom_html = `<p>Use some HTML to frame things for your user, or don't. Leave this blank to show only buttons.</p> <hr style="border: solid 0px; border-bottom: solid 1px #555;margin: 5px 0 15px 0"/>`
        }
    }
    document.getElementById('custom_html').value = custom_html;   
    // Save text to localStorage on change
    document.getElementById('custom_html').addEventListener('input', function() {
        localStorage.setItem('custom_html', this.value);
    });    

    // Do something when a button is clicked
    var exportPrompts = document.getElementById('prompt2page');
    exportPrompts.addEventListener('click', function() {
        saveTextAsFile(build_export(),"interactions.html")
    });

    // Do something when a button is clicked
    var exportSratchPrompts = document.getElementById('scrtach_prompt2page');
    exportSratchPrompts.addEventListener('click', function() {
        saveTextAsFile(build_export_w_scrtach(),"interactions_w_scratch.html")
    });

    // Do something when a button is clicked
    var downloadPrompts = document.getElementById('downloadPrompts');
    downloadPrompts.addEventListener('click', function() {
        saveTextAsFile(JSON.stringify(JSON.parse(localStorage.templates),null,2),"lit_prompts.txt")
    });

    // delete prompts
    var deletePrompts = document.getElementById('deletePrompts');
    document.getElementById('deletePrompts').addEventListener('click', function() {
        if (confirm('This will delete the current templates. Choose "OK" to continue or "Cancel" to keep things as they are.') == true) {
            localStorage.setItem('templates', "{}"); // Set to ""
            loadPrompts(); // Reload the prompts from localStorage
        }
    });

    // Restore default prompts
    var restoreDefaults = document.getElementById('restoreDefaults');
    document.getElementById('restoreDefaults').addEventListener('click', function() {
        if (confirm('This will replace your current templates with the default values. Choose "OK" to continue or "Cancel" to keep things as they are.') == true) {
            localStorage.setItem('templates', localStorage.default_templates); // Set to default prompts
            loadPrompts(); // Reload the prompts from localStorage
        }
    });

    // Upload prompts from a file
    var uploadPrompts = document.getElementById('uploadPrompts');
    document.getElementById('uploadPrompts').addEventListener('click', function() {
        if (confirm('This will replace your current templates with those in the file you upload. Choose "OK" to continue or "Cancel" to keep things as they are.') == true) {
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
                const json = JSON.parse(contents);
                updatePromptsFromJson(json); // Function to update prompts
            } catch (error) {
                console.error("Error reading file: ", error);
                // Handle errors (invalid file, etc.)
            }
        };
        reader.readAsText(file);
    });

    document.body.addEventListener('change', function(event) {
        // Check if the changed element is an 'outputTypeInput'
        if (event.target && event.target.id === 'output') {
            // Get the promptId from the data attribute of the event target
            const promptId = event.target.getAttribute('data-prompt');
            const selectedValue = event.target.value;
            updateJsonMode(promptId, selectedValue);
        }
    });

});

function updatePromptsFromJson(json) {
    // Assuming json is in the format that your application expects
    localStorage.setItem('templates', JSON.stringify(json)); // Update localStorage
    loadPrompts(); // Reload prompts based on new data
}

// Function to load saved values from localStorage
function loadPrompts() {

    localStorageData = JSON.parse(localStorage.getItem('templates'));

    const promptList = document.getElementById('prompt_list');
    promptList.innerHTML = '';

    for (const key in localStorageData) {
        if (localStorageData.hasOwnProperty(key)) {
            const template = localStorageData[key];

            // Pass the stored behavior value to createPromptElement
            const newPromptId = createPromptElement(key, template, template.behavior);
            updateJsonMode(newPromptId, template.output.toString());
        }
    }
    
    // Attach input change event listeners to all input elements
    const inputElements = document.querySelectorAll('#prompt_list input, #prompt_list textarea, #prompt_list select');
    inputElements.forEach(inputElement => {
        inputElement.addEventListener('input', () => {
            saveChanges();
        });
    });
}

//
// Working with the prompt List 
//

function getPromptNames() {
    const templates = JSON.parse(localStorage.getItem('templates')) || {};
    return Object.keys(templates); // Returns an array of prompt names (keys)
}

function updatePostTemplateBehaviorOptions(promptId) {
    const promptNames =  getPromptNames();
    const promptListing = document.getElementById(promptId);
    const postTemplateBehaviorSelect = promptListing.querySelector('#behavior');

    // Clear existing options
    postTemplateBehaviorSelect.innerHTML = '';

    // Create a default options
    if (localStorage["templates"] && JSON.parse(localStorage["templates"])[promptListing.querySelector('#prompt_name').value]) {
        Option_value = JSON.parse(localStorage["templates"])[promptListing.querySelector('#prompt_name').value]["behavior"];
    } else {
        Option_value = 'stop';
    }

    const defaultOption2 = document.createElement('option');
    defaultOption2.value = 'stop';
    defaultOption2.textContent = 'FULL STOP';
    if ('stop'==Option_value) {
        defaultOption2.selected = true;
    }
    postTemplateBehaviorSelect.appendChild(defaultOption2);

    const defaultOption4 = document.createElement('option');
    defaultOption4.value = 'file';
    defaultOption4.textContent = 'SAVE TO FILE';
    if ('file'==Option_value) {
        defaultOption4.selected = true;
    }
    postTemplateBehaviorSelect.appendChild(defaultOption4);

    const defaultOption1 = document.createElement('option');
    defaultOption1.value = 'pass';
    defaultOption1.textContent = 'DYNAMIC';
    if ('pass'==Option_value) {
        defaultOption1.selected = true;
    }
    postTemplateBehaviorSelect.appendChild(defaultOption1);

    const defaultOption3 = document.createElement('option');
    defaultOption3.value = 'chat';
    defaultOption3.textContent = 'CHAT';
    if ('chat'==Option_value) {
        defaultOption3.selected = true;
    }
    postTemplateBehaviorSelect.appendChild(defaultOption3);

    // Append new options
    promptNames.forEach(name => {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = name;
        postTemplateBehaviorSelect.appendChild(option);
        if (localStorage["templates"] && JSON.parse(localStorage["templates"])[promptListing.querySelector('#prompt_name').value] && name==JSON.parse(localStorage["templates"])[promptListing.querySelector('#prompt_name').value]["behavior"]) {
            option.selected = true;
        }
    });

}

// Function to create a new prompt element
function createPromptElement(promptName, template, selectedBehavior) {
    const promptList = document.getElementById('prompt_list');
    const promptId = `prompt_listing_${promptList.childElementCount + 1}`;
    
    const promptListing = document.createElement('div');
    promptListing.id = promptId;
    promptListing.className = 'prompt_listing';
    
    const promptNameInput = document.createElement('input');
    promptNameInput.id = 'prompt_name';
    promptNameInput.className = 'prompt_name';
    promptNameInput.setAttribute('data-prompt', promptId);
    promptNameInput.value = promptName;
    
    const moveUpButton = document.createElement('button');
    moveUpButton.id = 'up';
    moveUpButton.setAttribute('data-prompt', promptId);
    moveUpButton.textContent = 'Move Up';
    moveUpButton.className = 'move';
    moveUpButton.addEventListener('click', () => movePrompt(promptId, -1));

    const moveDownButton = document.createElement('button');
    moveDownButton.id = 'down';
    moveDownButton.setAttribute('data-prompt', promptId);
    moveDownButton.textContent = 'Move Down';
    moveDownButton.className = 'move';
    moveDownButton.addEventListener('click', () => movePrompt(promptId, 1));

    const makeFirstButton = document.createElement('button');
    makeFirstButton.id = 'make_first';
    makeFirstButton.setAttribute('data-prompt', promptId);
    makeFirstButton.textContent = 'First';
    makeFirstButton.className = 'move';
    makeFirstButton.addEventListener('click', () => movePrompt(promptId, "first"));

    const makeLastButton = document.createElement('button');
    makeLastButton.id = 'make_last';
    makeLastButton.setAttribute('data-prompt', promptId);
    makeLastButton.textContent = 'Last';
    makeLastButton.className = 'move';
    makeLastButton.addEventListener('click', () => movePrompt(promptId, "last"));

    const deleteButton = document.createElement('button');
    deleteButton.id = 'delete';
    deleteButton.setAttribute('data-prompt', promptId);
    deleteButton.textContent = 'Delete';
    deleteButton.className = 'delete_prompt';
    deleteButton.addEventListener('click', () => deletePrompt(promptId));   

    const promptTextarea = document.createElement('textarea');
    promptTextarea.id = 'prompt';
    promptTextarea.className = 'prompt_text';
    promptTextarea.setAttribute('data-prompt', promptId);
    promptTextarea.value = template.prompt;

    const modelInput = createParameterInput('Model', 'model', promptId, 'text', template.model);
    const temperatureInput = createParameterInput('Temperature', 'temperature', promptId, 'number', template.temperature);
    const maxTokensInput = createParameterInput('Max Tokens', 'max_tokens', promptId, 'number', template.max_tokens);
    const outputTypeInput = createParameterSelect('Output Type', 'output', promptId, ['Prompt', 'LLM'], template.output);
    const jsonModeInput = createParameterSelect('JSON', 'json_mode', promptId, ['No', 'Yes'], template.json_mode);
    const outputDestinationInput = createParameterSelect('Output To', 'output_to', promptId, ['Screen only', 'Screen + clipboard', 'Screen + append to scratch pad', 'Screen + replace scratch pad','Hidden','Hidden + clipboard', 'Hidden + append to scratch pad', 'Hidden + replace scratch pad'], template.output_to);
    
    const postTemplateBehaviorInput = createParameterSelect('Post-run Behavior', 'behavior', promptId, getPromptNames(), selectedBehavior);

    const hideButtonsCheckbox = createParameterInput('Hide Button ', 'hide_button', promptId, 'checkbox', template.hide_button);
    
    //promptNameInput.addEventListener('change', saveChanges);
    promptNameInput.addEventListener('change', function() {
        saveChanges();
        updateAllPostTemplateBehaviorOptions();
    });
    promptTextarea.addEventListener('change', saveChanges);
    modelInput.addEventListener('change', saveChanges);
    temperatureInput.addEventListener('change', saveChanges);
    maxTokensInput.addEventListener('change', saveChanges);
    outputTypeInput.addEventListener('change', saveChanges);
    jsonModeInput.addEventListener('change', saveChanges);
    outputDestinationInput.addEventListener('change', saveChanges);
    postTemplateBehaviorInput.addEventListener('change', saveChanges);
    hideButtonsCheckbox.addEventListener('change', saveChanges);

    promptListing.appendChild(promptNameInput);
    promptListing.appendChild(moveUpButton);
    promptListing.appendChild(moveDownButton);
    promptListing.appendChild(makeFirstButton);
    promptListing.appendChild(makeLastButton);
    promptListing.appendChild(deleteButton);
    promptListing.appendChild(promptTextarea);
    promptListing.appendChild(outputTypeInput);
    promptListing.appendChild(modelInput);
    promptListing.appendChild(temperatureInput);
    promptListing.appendChild(maxTokensInput);
    promptListing.appendChild(jsonModeInput);
    promptListing.appendChild(outputDestinationInput);
    promptListing.appendChild(postTemplateBehaviorInput);
    promptListing.appendChild(hideButtonsCheckbox);
    
    promptList.appendChild(promptListing);

    updatePostTemplateBehaviorOptions(promptId);

    const inputElements = document.querySelectorAll('#prompt_list input, #prompt_list textarea, #prompt_list select');
    inputElements.forEach(inputElement => {
        inputElement.addEventListener('input', () => {
            saveChanges();
        });
    });

    // Return the ID of the created prompt element
    return promptId;
}

// Function to update JSON Mode based on Output Type
function updateJsonMode(promptId, outputTypeValue) {
    const promptListing = document.getElementById(promptId);
    const jsonModeSelect = promptListing.querySelector('#json_mode');
    const modelInput = promptListing.querySelector('#model');
    const temperatureInput = promptListing.querySelector('#temperature');
    const maxTokensInput = promptListing.querySelector('#max_tokens');

    // Check if Output Type is 'prompt'
    const isPromptType = outputTypeValue === '0'; // Assuming '0' is the value for "prompt"

    // Set disabled property based on Output Type
    modelInput.disabled = isPromptType;
    temperatureInput.disabled = isPromptType;
    maxTokensInput.disabled = isPromptType;

}

// Function to create parameter input elements
function createParameterInput(labelText, inputId, dataPrompt, inputType, inputValue) {
    const parameterDiv = document.createElement('div');
    parameterDiv.className = 'parameter';
    
    const label = document.createTextNode(`${labelText} `);
    
    const input = document.createElement('input');
    input.id = inputId;
    input.setAttribute('data-prompt', dataPrompt);
    input.type = inputType;
    input.value = inputValue;

    // Assign class based on inputId
    switch(inputId) {
        case 'model':
            input.className = 'input-model';
            questionMark = document.createElement('span');
            questionMark.innerHTML = ` <button id="input-model-q" class="question">?</button>`;
            questionMark.addEventListener('click', () => alert('What model should be used (e.g. gpt-3.5-turbo).'));
            break;
        case 'temperature':
            input.step = (inputType === 'number') ? '0.01' : '1';
            input.className = 'input-temperature';
            input.min = 0;
            input.max = 1;
            questionMark = document.createElement('span');
            questionMark.innerHTML = ` <button id="temerature-q" class="question">?</button>`;
            questionMark.addEventListener('click', () => alert('How "random" should replies be (0-1), where 0 is very predictable and 1 is the most unpredictable.'));
            break;
        case 'max_tokens':
            input.step = (inputType === 'number') ? '1' : '1';
            input.className = 'input-max-tokens';
            input.min = 0;
            questionMark = document.createElement('span');
            questionMark.innerHTML = ` <button id="tokens-q" class="question">?</button>`;
            questionMark.addEventListener('click', () => alert('Max number of tokens to include in your answer. 1 token ~= 1.7 words. Smaller answers are quicker (and less expensive).'));
            break;
        case 'hide_button':
            input.className = 'input-hide-button';
            input.type = 'checkbox';
            input.checked = inputValue;
            questionMark = document.createElement('span');
            questionMark.innerHTML = ` <button id="tokens-q" class="question">?</button>`;
            questionMark.addEventListener('click', () => alert('Hide this template\'s button from the main list of interaction buttons.'));

            // Create a label for the checkbox
            const checkboxLabel = document.createElement('label');
            checkboxLabel.textContent = labelText; // Set the label text
            checkboxLabel.appendChild(input); // Append the input element to the label
            checkboxLabel.appendChild(questionMark); // Append the question mark to the label

            parameterDiv.appendChild(checkboxLabel); // Append the label (with input and question mark) to parameterDiv

            break;

        default:
            input.className = 'input-default'; // A default class if none of the IDs match
            questionMark = document.createTextNode(' [?]');
            break;

    }
    
    if (inputId!="hide_button"){
        parameterDiv.appendChild(label);
        parameterDiv.appendChild(input);
        parameterDiv.appendChild(questionMark);    
    }
    
    return parameterDiv;
}

// Function to create parameter select elements
function createParameterSelect(labelText, selectId, dataPrompt, options, selectedValue) {
    const parameterDiv = document.createElement('div');
    parameterDiv.className = 'parameter';
    
    const label = document.createTextNode(`${labelText} `);
    
    const select = document.createElement('select');
    select.id = selectId;  // 'output'
    select.setAttribute('data-prompt', dataPrompt);  // 'promptId'

    for (let i = 0; i < options.length; i++) {
        const option = document.createElement('option');
        if (selectId!="behavior") {
            option.value = i.toString();  
            if (i === selectedValue) {
                option.selected = true;
            }
        }
        option.textContent = options[i];
        select.appendChild(option);
    }
    
    select.className = selectId+"-dropdown"
    const questionMark = document.createElement('span');
    questionMark.innerHTML = ` <button id="`+selectId+`-q" class="question">?</button>`;

    if (selectId=="output"){
        questionMark.addEventListener('click', () => alert("When you run this prompt template, should it echo back the text of the prompt or an LLM's reply?"));
    } else if (selectId=="json_mode") {
        questionMark.addEventListener('click', () => alert("If your model supports JSON Mode, we will turn on JSON Mode, if not, we will alert you when output isn't proper JSON."));
    } else if (selectId=="output_to") {
        questionMark.addEventListener('click', () => alert("Decide where output should go (e.g., to the screen or the screen and the clipboard)."));
    } else if (selectId=="behavior") {
        questionMark.addEventListener('click', () => alert("After this prompt template is run, what next? Should we stop, save the output to a file, chat, or trigger another prompt template? Note: if you choose DYNAMIC, this will trigger the prompt found in passThrough[\"next\"]. See above for a discussion of variables."));   
    }

    parameterDiv.appendChild(label);
    parameterDiv.appendChild(select);
    parameterDiv.appendChild(questionMark);
    
    return parameterDiv;
}

// Function to move a prompt up or down
function movePrompt(promptId, direction) {
    const promptListing = document.getElementById(promptId);
    const promptList = promptListing.parentElement;
    
    if (direction === -1) {
        if (promptListing.previousElementSibling) {
            const previousPromptId = promptListing.previousElementSibling.id;
            const currentPromptId = promptId;
            
            // Swap the DOM elements
            promptList.insertBefore(promptListing, promptListing.previousElementSibling);
        }
    } else if (direction === 1) {
        if (promptListing.nextElementSibling) {
            const nextPromptId = promptListing.nextElementSibling.id;
            const currentPromptId = promptId;
            
            // Swap the DOM elements
            promptList.insertBefore(promptListing.nextElementSibling, promptListing);
        }
    } else if (direction === "first") {
        if (promptList.firstChild) {
            const firstPromptId = promptList.firstChild.id;
            const currentPromptId = promptId;
           
            // Change the DOM elements
            promptList.insertBefore(promptListing,promptList.firstChild);
        }
    } else if (direction === "last") {
        if (promptList.lastChild) {
            const lastPromptId = promptList.lastChild.id;
            const currentPromptId = promptId;
            
            // Change the DOM elements
            promptList.insertBefore(promptListing,promptList.lastChild.nextElementSibling);
        }
    }

    saveChanges();

    updateAllPostTemplateBehaviorOptions();

}

// Function to delete a prompt
function deletePrompt(promptId) {
    if (confirm('Do you want to delete this prompt? Choose "OK" to continue or "Cancel" to keep things as they are.') == true) {
        const promptListing = document.getElementById(promptId);
        const promptName = promptListing.querySelector('#prompt_name').value;
        
        // Remove the prompt data from localStorage
        const localStorageData = JSON.parse(localStorage.getItem('templates')) || {};
        delete localStorageData[promptName];
        localStorage.setItem('templates', JSON.stringify(localStorageData));

        // Remove the prompt element from the DOM
        promptListing.parentElement.removeChild(promptListing);

        // Update everything
        updateAllPostTemplateBehaviorOptions();
    }
}

// Function to save changes to localStorage
function saveChanges() {
    //console.log("Saving changes...") // Leave for debugging

    const promptList = document.getElementById('prompt_list');
    const localStorageData = {};
    
    for (const promptListing of promptList.children) {
        const promptId = promptListing.id;
        const promptName = promptListing.querySelector('#prompt_name').value.trim();
        const promptTextarea = promptListing.querySelector('#prompt');
        const model = promptListing.querySelector('#model').value;
        const temperature = parseFloat(promptListing.querySelector('#temperature').value);
        const maxTokens = parseInt(promptListing.querySelector('#max_tokens').value);
        const output = parseInt(promptListing.querySelector('#output').value);
        const json_mode = parseInt(promptListing.querySelector('#json_mode').value);
        const output_to = parseInt(promptListing.querySelector('#output_to').value);

        const behaviorSelect = promptListing.querySelector('#behavior');
        const behavior = behaviorSelect ? behaviorSelect.value : ''; // Get the selected behavior value

        const hide_button = promptListing.querySelector('#hide_button').checked

        localStorageData[promptName] = {
            prompt: promptTextarea.value,
            model: model,
            temperature: temperature,
            max_tokens: maxTokens,
            output: output,
            json_mode: json_mode,
            output_to: output_to,
            behavior: behavior,
            hide_button: hide_button
        };
    }
    
    localStorage.setItem('templates', JSON.stringify(localStorageData)); // Use the key 'templates'

    //updateAllPostTemplateBehaviorOptions();
}

// Load saved values when the page loads
window.addEventListener('load', () => {
    loadPrompts();
});

// Function to add a new prompt at the top of the list when the button is clicked
function addNewPrompt() {
    const promptList = document.getElementById('prompt_list'); // Ensure promptList is defined within the function scope

    const newPromptName = `New Prompt ${promptList.childElementCount + 1}`;
    const newPromptId = createPromptElement(newPromptName, {
        prompt: '',
        model: 'gpt-3.5-turbo',
        temperature: 0.7,
        max_tokens: 250,
        output: 1,
        json_mode: 0,
        output_to: 0,
        behavior: 0
    });

    // Update JSON Mode for the new prompt
    updateJsonMode(newPromptId, 0); // Assuming '0' is the default value for "prompt"

    // Prepend the newly created prompt to the list
    const firstChild = promptList.firstChild;
    promptList.insertBefore(promptList.lastChild, firstChild);

    saveChanges(); // Save changes after adding a new prompt

    updateAllPostTemplateBehaviorOptions();

}

function updateAllPostTemplateBehaviorOptions() {
    const promptList = document.getElementById('prompt_list');
    for (const promptListing of promptList.children) {
        const promptId = promptListing.id;
        updatePostTemplateBehaviorOptions(promptId);
    }
}

// Call the function to load prompts and attach input change event listeners when the DOM is fully loaded
document.addEventListener('DOMContentLoaded', () => {
    loadPrompts();

    // Attach input change event listeners to all input elements
    const inputElements = document.querySelectorAll('#prompt_list input, #prompt_list textarea, #prompt_list select');
    inputElements.forEach(inputElement => {
        inputElement.addEventListener('input', () => {
            saveChanges();
        });
    });

    // Add a new prompt at the top of the list when the button is clicked
    document.getElementById('add_prompt_to_list').addEventListener('click', () => {
        addNewPrompt();
    });
});

(async () => {
    spinJS = await loadFile('js/spin.min.js');
    functionsJS = await loadFile('js/functions.js');
    promptsJS = await loadFile('js/prompts.js');
    popupJS = await loadFile('js/popup_exported.js');
    popupCSS = await loadFile('css/popup_exported.css');
    popup_scratchCSS = await loadFile('css/popup_scratch.css');
    popupHTML = await loadFile('./popup.html');
})()

function build_export() {
    fileText = popupHTML
    fileText = fileText.replace(`</title>`,`</title>\n<script>\n\nlocalStorage.setItem('templates',JSON.stringify(`+localStorage.templates+`));\n`);
    fileText = fileText.replace(`<script src="js/spin.min.js"></script>`,`\n`+spinJS)
    fileText = fileText.replace(`<script src="js/functions.js"></script>`,`\n`+functionsJS)
    fileText = fileText.replace(`<script src="js/prompts.js"></script>`,`\n`+promptsJS)
    fileText = fileText.replace(`<script src="js/popup.js"></script>`,`\n`+popupJS)
    fileText = fileText.replace(`<link rel="stylesheet" type="text/css" href="css/popup.css">`,`</script>\n<style>\n`+popupCSS+`\n</style>`)
    
    fileText = fileText.replace(`api_key = ""`,`api_key = "`+localStorage.api_key+`"`);
    fileText = fileText.replace(`api_base = "https://api.openai.com/v1/chat/completions"`,`api_base = "`+localStorage.api_base+`"`);

    fileText = fileText.replaceAll(`Please check its contents by clicking "Templates & Settings" bellow.`,``)
    fileText = fileText.replaceAll(`, API Key, and model. You can edit these after clicking the "Templates & Settings" button below.`,` and API Key. The credentials may have expired, or the model used by this tools' author my have been retired.`)
    fileText = fileText.replaceAll(`//FOR EXPORT: `,``)

    fileText = fileText.replace(`<div class="custom_header"></div>`,`<div class="custom_header">`+document.getElementById('custom_html').value+`</div>`)

    return fileText
}

function build_export_w_scrtach() {
    fileText = popupHTML
    fileText = fileText.replace(`</title>`,`</title>\n<script>\n\nlocalStorage.setItem('templates',JSON.stringify(`+localStorage.templates+`));\n`);
    fileText = fileText.replace(`<script src="js/spin.min.js"></script>`,spinJS)
    fileText = fileText.replace(`<script src="js/functions.js"></script>`,functionsJS)
    fileText = fileText.replace(`<script src="js/prompts.js"></script>`,promptsJS)
    fileText = fileText.replace(`<script src="js/popup.js"></script>`,popupJS)
    fileText = fileText.replace(`<link rel="stylesheet" type="text/css" href="css/popup.css">`,`</script>\n<style>\n`+popup_scratchCSS+`\n</style>`)

    fileText = fileText.replace(`window.scrollTo(0, 0);`,`document.getElementById('inner_wrapper').scrollTo(0, 0);`)
    fileText = fileText.replace(`var getScrollTopDocumentAtBegin = document.documentElement.scrollTop + document.body.scrollTop`,`var getScrollTopDocumentAtBegin = document.getElementById('inner_wrapper').scrollTop + document.body.scrollTop`)    
    fileText = fileText.replace(`setTimeout(function(){  window.scrollTo(`,`setTimeout(function(){  document.getElementById('inner_wrapper').scrollTo(`)

    fileText = fileText.replace(`api_key = ""`,`api_key = "`+localStorage.api_key+`"`);
    fileText = fileText.replace(`api_base = "https://api.openai.com/v1/chat/completions"`,`api_base = "`+localStorage.api_base+`"`);

    fileText = fileText.replaceAll(`<title>Prompt Interactions</title>`,`<title>Prompt Interactions with Scratch Pad</title>`)
    fileText = fileText.replaceAll(`Please check its contents by clicking "Templates & Settings" bellow.`,``)
    fileText = fileText.replaceAll(`, API Key, and model. You can edit these after clicking the "Templates & Settings" button below.`,` and API Key. The credentials may have expired, or the model used by this tools' author my have been retired.`)
    fileText = fileText.replaceAll(`//FOR EXPORT: `,``)

    fileText = fileText.replace(`<div class="custom_header"></div>`,`<div class="custom_header">`+document.getElementById('custom_html').value+`</div>`)
    
    return fileText
}
