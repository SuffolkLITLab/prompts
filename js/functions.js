
function copy_to_clipboard(text) {
    // Create a temporary textarea element to store the result
    var tempTextArea = document.createElement('textarea');
    tempTextArea.value = text;
  
    // Append the textarea to the document
    document.body.appendChild(tempTextArea);
  
    // Select the text within the textarea
    tempTextArea.select();
  
    // Copy the selected text to the clipboard
    document.execCommand('copy');
  
    // Remove the temporary textarea
    document.body.removeChild(tempTextArea);
  
}
  

function getScratchText() {
    var value = localStorage.getItem('scratch_pad');
    return value == null ? '' : String(value);
}

function setScratchText(value) {
    var normalized = value == null ? '' : String(value);
    localStorage.setItem('scratch_pad', normalized);
    return normalized;
}

function getScratchSelectionText() {
    var value = localStorage.getItem('scratch_pad_selection');
    return value == null ? '' : String(value);
}

function setScratchSelectionText(value) {
    var normalized = value == null ? '' : String(value);
    localStorage.setItem('scratch_pad_selection', normalized);
    return normalized;
}

function getOptionsPageContext() {
    try {
        var parsed = JSON.parse(localStorage.getItem('options_page_context') || '{}');
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            return {
                highlighted: parsed.highlighted == null ? '' : String(parsed.highlighted),
                innerText: parsed.innerText == null ? '' : String(parsed.innerText),
                innerHTML: parsed.innerHTML == null ? '' : String(parsed.innerHTML)
            };
        }
    } catch (error) {
        console.warn('Unable to read Templates and Settings page context:', error);
    }
    return { highlighted: '', innerText: '', innerHTML: '' };
}

function setOptionsPageContext(context) {
    var normalized = {
        highlighted: context && context.highlighted != null ? String(context.highlighted) : '',
        innerText: context && context.innerText != null ? String(context.innerText) : '',
        innerHTML: context && context.innerHTML != null ? String(context.innerHTML) : ''
    };
    try {
        localStorage.setItem('options_page_context', JSON.stringify(normalized));
    } catch (error) {
        // A very large settings page should not break Settings itself. If storage
        // is exhausted, preserve the smaller text/selection values and omit HTML.
        console.warn('Unable to save full Templates and Settings page context:', error);
        normalized.innerHTML = '';
        try {
            localStorage.setItem('options_page_context', JSON.stringify(normalized));
        } catch (fallbackError) {
            console.warn('Unable to save Templates and Settings page context:', fallbackError);
        }
    }
    return normalized;
}

function timestampedDownloadFilename(prefix, extension, now) {
    var date = now || new Date();
    var pad = function(value) { return String(value).padStart(2, '0'); };
    var normalizedExtension = String(extension || '').replace(/^\./, '');
    return String(prefix || '')
        + date.getFullYear() + "-"
        + pad(date.getMonth() + 1) + "-"
        + pad(date.getDate()) + "T"
        + pad(date.getHours()) + "."
        + pad(date.getMinutes())
        + (normalizedExtension ? "." + normalizedExtension : "");
}

function saveTextAsFile(tosave,name) {
    // Handle vendor prefixes.
    window.requestFileSystem = window.requestFileSystem || window.webkitRequestFileSystem;
  
    // tosave = ID of textarea to save
    // name = name to save file as, including file extension     
    // grab the content of the form field and place it into a variable
    var textToWrite = tosave //document.getElementById(tosave).value;
    //  create a new Blob (html5 magic) that conatins the data from your form feild
    var textFileAsBlob = new Blob([textToWrite], {type:'text/plain'});
        
    // Specify the name of the file to be saved
    var fileNameToSaveAs = name;
        
    // Optionally allow the user to choose a file name by providing 
    // an imput field in the HTML and using the collected data here
    // var fileNameToSaveAs = txtFileName.text;
  
    // create a link for our script to 'click'
    var downloadLink = document.createElement("a");
    // supply the name of the file (from the var above).
    // you could create the name here but using a var
    // allows more flexability later.
    downloadLink.download = fileNameToSaveAs;
    // provide text for the link. This will be hidden so you
    // can actually use anything you want.
    downloadLink.innerHTML = "My Hidden Link";
        
    // allow our code to work in webkit & Gecko based browsers
    // without the need for a if / else block.
    window.URL = window.URL || window.webkitURL;
            
    // Create the link Object.
    downloadLink.href = window.URL.createObjectURL(textFileAsBlob);
    // when link is clicked call a function to remove it from
    // the DOM in case user wants to save a second file.
    downloadLink.onclick = destroyClickedElement;
    // make sure the link is hidden.
    downloadLink.style.display = "none";
    // add the link to the DOM
    document.body.appendChild(downloadLink);
        
    // click the new link
    downloadLink.click();
}
  
function destroyClickedElement(event) {
    // remove the link from the DOM
    document.body.removeChild(event.target);
}

const BUILT_IN_DEFAULT_MODEL = 'gpt-5.4-mini';

function get_default_model() {
    const saved = localStorage.getItem('default_model');
    return (saved && saved.trim()) ? saved.trim() : BUILT_IN_DEFAULT_MODEL;
}

const BUILT_IN_DEFAULT_API_ENDPOINT = 'https://api.openai.com/v1/responses';

function normalize_api_endpoint(endpoint) {
    return String(endpoint || '').trim();
}

function get_default_api_endpoint() {
    const saved = normalize_api_endpoint(localStorage.getItem('api_base'));
    return saved || BUILT_IN_DEFAULT_API_ENDPOINT;
}

function get_api_key_registry() {
    let registry = {};
    try {
        const parsed = JSON.parse(localStorage.getItem('api_keys') || '{}');
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            Object.keys(parsed).forEach(function(endpoint) {
                const normalized = normalize_api_endpoint(endpoint);
                if (normalized) registry[normalized] = String(parsed[endpoint] == null ? '' : parsed[endpoint]);
            });
        }
    } catch (error) {
        console.error('Unable to read API-key registry:', error);
    }

    // Standalone exports can populate a runtime-only registry without writing
    // credentials into localStorage.
    if (typeof api_keys !== 'undefined' && api_keys && typeof api_keys === 'object' && !Array.isArray(api_keys)) {
        Object.keys(api_keys).forEach(function(endpoint) {
            const normalized = normalize_api_endpoint(endpoint);
            if (normalized) registry[normalized] = String(api_keys[endpoint] == null ? '' : api_keys[endpoint]);
        });
    }
    return registry;
}

function merge_api_key_defaults(defaultRegistry) {
    const registry = get_api_key_registry();
    if (!defaultRegistry || typeof defaultRegistry !== 'object' || Array.isArray(defaultRegistry)) {
        return registry;
    }

    Object.keys(defaultRegistry).forEach(function(endpoint) {
        const normalized = normalize_api_endpoint(endpoint);
        if (!normalized) return;
        const current = Object.prototype.hasOwnProperty.call(registry, normalized)
            ? String(registry[normalized] == null ? '' : registry[normalized])
            : '';
        if (!current.trim()) {
            registry[normalized] = String(defaultRegistry[endpoint] == null ? '' : defaultRegistry[endpoint]);
        }
    });
    return registry;
}

function save_api_key_registry(registry) {
    const clean = {};
    if (registry && typeof registry === 'object') {
        Object.keys(registry).forEach(function(endpoint) {
            const normalized = normalize_api_endpoint(endpoint);
            if (normalized) clean[normalized] = String(registry[endpoint] == null ? '' : registry[endpoint]);
        });
    }
    localStorage.setItem('api_keys', JSON.stringify(clean));
    if (typeof api_keys !== 'undefined') api_keys = Object.assign({}, clean);
    return clean;
}

function remember_api_key_for_endpoint(endpoint, key) {
    const normalized = normalize_api_endpoint(endpoint);
    if (!normalized) return get_api_key_registry();
    const registry = get_api_key_registry();
    registry[normalized] = String(key == null ? '' : key);
    return save_api_key_registry(registry);
}

function ensure_api_key_entry(endpoint) {
    const normalized = normalize_api_endpoint(endpoint);
    if (!normalized) return get_api_key_registry();
    const registry = get_api_key_registry();
    if (!Object.prototype.hasOwnProperty.call(registry, normalized)) {
        registry[normalized] = '';
        return save_api_key_registry(registry);
    }
    return registry;
}

function migrate_legacy_api_key_to_registry() {
    const legacyKey = localStorage.getItem('api_key');
    if (legacyKey == null) return get_api_key_registry();

    const defaultEndpoint = get_default_api_endpoint();
    const registry = get_api_key_registry();
    if (defaultEndpoint && !Object.prototype.hasOwnProperty.call(registry, defaultEndpoint)) {
        registry[defaultEndpoint] = String(legacyKey);
        save_api_key_registry(registry);
    }

    // api_key was the pre-0.2.4 single-key setting. Once its value has been
    // copied into the endpoint registry, remove it so there is only one source
    // of truth for credentials.
    localStorage.removeItem('api_key');
    return get_api_key_registry();
}

function get_api_key_for_endpoint(endpoint) {
    const effectiveEndpoint = normalize_api_endpoint(endpoint) || get_default_api_endpoint();
    const registry = get_api_key_registry();
    if (Object.prototype.hasOwnProperty.call(registry, effectiveEndpoint)) {
        return registry[effectiveEndpoint];
    }

    // Backward-compatible read for an installation/export that has not yet run
    // the one-time migration. Intentionally do not read window.api_key: an
    // element with id="api_key" may be exposed there as an HTMLInputElement.
    if (effectiveEndpoint === get_default_api_endpoint()) {
        const legacyKey = localStorage.getItem('api_key');
        if (legacyKey != null) return String(legacyKey);
    }
    return '';
}

function loadFile(filePath) {
    return fetch(filePath)
    .then(response => response.text())
    .then(data => {
        return data
    })
};

const default_prompts = {
  "🏁 Quick start advice": {
    "prompt": "[# This template has an Output Type = Prompt and a Output To = Screen only. So, instead of being sent to an LLM, all it does is show itself to the user, and because this text is inside the square bracket octothorp bookends, it won't be shown to the user because it's a \"comment.\" #]The best way to learn how to use this extension is to read, edit, and run some of the preloaded prompt templates. You can start down this road by clicking the \"Templates & Settings\" button at the bottom of this window.",
    "reasoning_effort": "",
    "verbosity": "",
    "output": 0,
    "json_mode": 0,
    "json_schema": "",
    "output_to": 0,
    "behavior": "stop",
    "hide_button": false,
    "run_in_new_tab": false
  },
  "🌎 Summarize & question this page": {
    "prompt": "{{innerText}} [# FYI, the innerText variable will be replaced with the text from the current active browser tab, and because the Post-run Behavior is set to CHAT, you will be able to continue engaging with this text after the first reply. #]\n  \nProvide a short 150 word summary of the above text. If asked any follow-up questions, use the above text, and ONLY the above text, to answer them. If you can't find an answer in the above text, politely decline to answer explaining that you can't find the information. You can, however, finish a thought you started above if asked to continue, but don't write anything that isn't supported by the above text. And keep all of your replies short! \n",
    "reasoning_effort": "",
    "verbosity": "",
    "output": 1,
    "json_mode": 0,
    "json_schema": "",
    "output_to": 1,
    "behavior": "chat",
    "hide_button": false,
    "run_in_new_tab": false
  },
  "📖 Define selected word/phrase in context": {
    "prompt": "{{innerText}}\n\nUse the information above to explain who/what the following word/phrase is, i.e., provide a description/definition for the word(s) as used above: {{highlighted}}\n\n[# Here we've set the Output To equal to Screen + append to scratch pad which means that the LLM's output will be appended to the contents of your Scratch Pad, which can be accessed from the Popup by clicking the \"Scratch Pad\" button. #]\n",
    "reasoning_effort": "",
    "verbosity": "",
    "output": 1,
    "json_mode": 0,
    "json_schema": "",
    "output_to": 2,
    "behavior": "stop",
    "hide_button": false,
    "run_in_new_tab": false
  },
  "💬 Translate & reply in original language": {
    "prompt": "[# This template's \"big trick\" is that the Post-run Behavior is set to \"display translation and prompt,\" which is the name of another template. This means that after this prompt is run through an LLM, it will trigger \"display translation and prompt,\" and pass to it this template's output. Because the Output To is set to Hidden, however, the user will not see this structured data. #]You are helping translate text into English. Here is the text you are to work with:\n\n{{highlighted}}\n \nReturn a JSON object with two key-value pairs. The first key is called `language`, and its value is the language of the above text. The second key is called `translation`, and its value is the above text translated into English. \n\nNow return the object: \n\n",
    "reasoning_effort": "",
    "verbosity": "",
    "output": 1,
    "json_mode": 1,
    "json_schema": "",
    "output_to": 4,
    "behavior": "display translation and prompt",
    "hide_button": false,
    "run_in_new_tab": false
  },
  "display translation and prompt": {
    "prompt": "Translate the following text into {{passThrough[\"language\"]}}. Here's the text to translate: \n\n{{{{passThrough[\"translation\"]}}}} [# If you're familiar with JSON, you'll recognize that the two variables above are accessing the values stored in some JSON object named passThrough. Namely, the value for \"language\" and \"translation.\" In this way we can very cleanly slice up the output from the prior template. Because the Hide Button checkbox is checked, the user will not see a button for \"display translation and prompt.\" That of course is okay, because it is being triggered by \"Translate & reply in original language.\" #]\n",
    "reasoning_effort": "",
    "verbosity": "",
    "output": 1,
    "json_mode": 0,
    "json_schema": "",
    "output_to": 1,
    "behavior": "stop",
    "hide_button": true,
    "run_in_new_tab": false
  },
  "🪄 Magic copy-and-paste": {
    "prompt": "[# What is magic copy-and-paste you ask? Well, its the name I'm giving to text-driven entity extraction. Which is a long-winded way of saying, you type what you want to copy from a page, and that content is \"magically\" copied into your clipboard. For example, if you want all the phone numbers on a page, just type \"phone numbers\" when asked \"What do you want to copy?\" Wait a bit, and presto. There's a list of phone numbers in your clipboard. #]Your job is to create a JSON object from the following Source Text. It should have a single key-value pair. The key should be \"extracted\" and the value should equal any \"{{What do you want to copy from this page (e.g., proper nouns, phone numbers, addresses, etc.)?}}\" found in the Source Text. That is, you should find and return any text that looks like \"{{What do you want to copy from this page (e.g., proper nouns, phone numbers, addresses, etc.)?}}\" If providing the value calls for a list, separate entries with commas followed by a space, unless the items contain commas, in which case, use semicolons. \n\n---\n\nSOURCE TEXT\n\n{{innerText}}\n\n---\n\nNow provide the JSON object. \n\n",
    "reasoning_effort": "",
    "verbosity": "",
    "output": 1,
    "json_mode": 1,
    "json_schema": "",
    "output_to": 4,
    "behavior": "Copy to clipboard",
    "hide_button": false,
    "run_in_new_tab": false
  },
  "Copy to clipboard": {
    "prompt": "{{passThrough[\"extracted\"]}}[# Again, we're using JSON here to format and cue up our output. #]",
    "reasoning_effort": "",
    "verbosity": "",
    "output": 0,
    "json_mode": 0,
    "json_schema": "",
    "output_to": 1,
    "behavior": "stop",
    "hide_button": true,
    "run_in_new_tab": false
  },
  "🔍 🌎  Search this site": {
    "prompt": "{{What are you looking for?}}",    "temperature": "",
    "reasoning_effort": "",
    "verbosity": "",
    "output": 0,
    "json_mode": 0,
    "json_schema": "",
    "output_to": 4,
    "behavior": "open search",
    "hide_button": false,
    "run_in_new_tab": false
  },
  "open search": {
    "prompt": "var site = window.location.hostname;\nvar query = encodeURIComponent(passThrough) + \"+site:\" + encodeURIComponent(site);\nvar googleSearchUrl = \"https://www.google.com/search?q=\" + query;\nwindow.open(googleSearchUrl, '_blank');\nreturn true\n",    "temperature": "",
    "reasoning_effort": "",
    "verbosity": "",
    "output": 2,
    "json_mode": 0,
    "json_schema": "",
    "output_to": 4,
    "behavior": "close",
    "hide_button": true,
    "run_in_new_tab": false
  },
  "✍️ \"Diagram\" selected sentence": {
    "prompt": "[# This template is here mostly to show off the JSON parameter (I'm not sure how much I really trust it). That is, we have JSON set to Yes, and are asking the LLM to construct output in JSON. Consequently, the LLM should produce well-structured JSON output. If you haven't seen JSON before, you might want to read up on it here: https://en.wikipedia.org/wiki/JSON. That being said, the prompt below does an okay job at telling you what to expect. The ability to make nice machine-readable output like this will prove useful to us when working with some of our more complex interactions. FWIW, I had ChatGPT create the specifications below. #]Below I will provide you with a string of text. Your job is to produce a JSON representation of its sentence structure. \n\n1. Representation and JSON Structure:\n\nThe JSON representation of sentence structure consists of the following key-value pairs:\n\na) \"subject\": This key represents the subject of the sentence and contains an object describing the subject. The subject object can include properties such as \"type\" (to specify the type of subject, e.g., noun or pronoun) and \"value\" (to store the actual subject word or phrase).\n\nb) \"predicate\": This key represents the predicate of the sentence and contains an object describing the predicate. The predicate object can include properties such as \"type\" (to specify the type of predicate, e.g., verb or verb phrase) and \"value\" (to store the actual predicate word or phrase).\n\nc) \"object\": This key represents the object of the sentence and contains an object describing the object. The object object can include properties such as \"type\" (to specify the type of object, e.g., noun or pronoun) and \"value\" (to store the actual object word or phrase).\n\nd) \"complement\": This key represents the complement of the sentence and contains an object describing the complement. The complement object can include properties such as \"type\" (to specify the type of complement, e.g., adjective or noun phrase) and \"value\" (to store the actual complement word or phrase).\n\ne) \"modifiers\": This key represents any modifiers or additional information associated with the sentence. It contains an array of objects, where each object describes a specific modifier. Each modifier object can include properties such as \"type\" (to specify the type of modifier, e.g., adverbial or prepositional phrase) and \"value\" (to store the actual modifier word or phrase).\n\n2. Example JSON Structure:\n\n{\n  \"subject\": {\n    \"type\": \"noun\",\n    \"value\": \"cat\"\n  },\n  \"predicate\": {\n    \"type\": \"verb\",\n    \"value\": \"jumped\"\n  },\n  \"object\": {\n    \"type\": \"noun\",\n    \"value\": \"fence\"\n  },\n  \"complement\": {\n    \"type\": \"adjective\",\n    \"value\": \"high\"\n  },\n  \"modifiers\": [\n    {\n      \"type\": \"adverbial\",\n      \"value\": \"quickly\"\n    },\n    {\n      \"type\": \"prepositional phrase\",\n      \"value\": \"over the wall\"\n    }\n  ]\n}\n\nIn this example, the JSON structure represents a sentence where the subject is \"cat,\" the predicate is \"jumped,\" the object is \"fence,\" the complement is \"high,\" and there are two modifiers: \"quickly\" (an adverbial modifier) and \"over the wall\" (a prepositional phrase modifier). \n\n3. Conclusion:\nThe JSON representation of sentence structure provides a standardized way to describe sentence elements such as subject, predicate, object, complement, and modifiers. It allows for the structured representation of sentence components, making it easier to process and analyze sentence structures programmatically.\n\nNow that I've given you these specifications, your job is to make such an object for the following text string:\n\n{{highlighted}}\n\nNow provide your JSON object: \n",    "temperature": 0,
    "reasoning_effort": "high",
    "verbosity": "",
    "output": 1,
    "json_mode": 1,
    "json_schema": "",
    "output_to": 1,
    "behavior": "stop",
    "hide_button": false,
    "run_in_new_tab": false
  },
  "📫 Politely decline an email (selected text)": {
    "prompt": "{{highlighted}} [# FYI, the highlighted variable will be replaced with any text you have highlighted/selected when you click the extension's popup, and because Output To is set to Screen + clipboard, the LLMs output will be ready to paste in an email after the interaction runs. #]\n\nThe above is an email. Draft a brief and professional reply politely declining its request. \n",
    "reasoning_effort": "",
    "verbosity": "",
    "output": 1,
    "json_mode": 0,
    "json_schema": "",
    "output_to": 1,
    "behavior": "chat",
    "hide_button": false,
    "run_in_new_tab": false
  },
  "🪙 Coin flip to poem + add to Scratch Pad": {
    "prompt": "I'm going to flip a coin. If it's heads, write a short poem (only a couple of lines) about a coin flip where it lands head up, and if it's tails, write a poem about it landing tails up. Be very clear about the result of the coin flip in the poem. \n\nCoin flip: {{coinFlip}} [# The value of {{coinFlip}} is random, or as \"random.\" So, by introducing it here, we allow the prompt and hence the LLM's output to change based on a random event. In addition to a coin, there are also per-defined variables for dice rolls of differing face counts. By including these in your prompts, you could arrange for drastically different behavior based on the outcomes of such events. Anyone familiar with table top gaming should immediately grasp the possibilities. #]\n\nNow give me your response/poem: \n",    "temperature": 0.9,
    "reasoning_effort": "",
    "verbosity": "",
    "output": 1,
    "json_mode": 0,
    "json_schema": "",
    "output_to": 3,
    "behavior": "stop",
    "hide_button": false,
    "run_in_new_tab": false
  },
  "💾 Save Scratch Pad to file": {
    "prompt": "{{scratch}} [# The scratch variable will be replaced with the content of your Scratch Pad, which can be accessed from the Popup by clicking the \"Scratch Pad\" button. Since we have set the Output Type to Prompt, this prompt will not be sent to an LLM, but having set Post-run Behavior to SAVE TO FILE, it will trigger your browser's save to file action. #]",
    "reasoning_effort": "",
    "verbosity": "",
    "output": 0,
    "json_mode": 0,
    "json_schema": "",
    "output_to": 4,
    "behavior": "file",
    "hide_button": false,
    "run_in_new_tab": false
  },
  "🗜️ Shorten selected text": {
    "prompt": "You're a helpful editor and you're going to help trim some text. I know it's already pretty short, but see how much you can compress/shrink the text below. When you rewrite it, knock off at least 20% of the length, but keep the main points: \n\n{{highlighted}}\n",
    "reasoning_effort": "",
    "verbosity": "",
    "output": 1,
    "json_mode": 0,
    "json_schema": "",
    "output_to": 1,
    "behavior": "chat",
    "hide_button": false,
    "run_in_new_tab": false
  },
  "🔬 Expand selected (short) text": {
    "prompt": "[# This template is the first in a chain of templates that can either end or loop back on itself. It works by getting the LLM to generate some dialog and send that along with text the user has highlighted to another template. That template takes an action and feeds into another template, and so on and so on.#]You are an actor playing the role of a helpful writing assistant. In this scene you will interact with a writer. You will ask them some questions about some copy they are working on. You're goal is to ask them enough question such that their answers can be used to expand on the existing text. That is, you want them to give you things one could use to expand on the existing text. As this is a dialogue, we will present it in the form of a transcript. The writer will start by reading what they have so far. \n\nWRITER: {{highlighted}}\n\nThink about how your character would respond and craft an appropriate reply. You will provide the text of this reply along with one other piece of information as a JSON object. The object will have two key-value pairs. The first key-value pair's key is \"transcript\" and the value is that of the transcript above, starting with \"WRITER:\" and followed by the text of their copy. Be sure to escape an quotation marks. The second key-value pair has a key called \"reply\" and its value is the response you crafted above (i.e., it is the text of your character's reply to the above, your first question for the writer). Include only the text of your reply (e.g., do NOT preface the text with the name of the speaker).\n",
    "reasoning_effort": "",
    "verbosity": "",
    "output": 1,
    "json_mode": 1,
    "json_schema": "",
    "output_to": 4,
    "behavior": "Expand Text 1",
    "hide_button": false,
    "run_in_new_tab": false
  },
  "Expand Text 1": {
    "prompt": "{{passThrough[\"transcript\"]}}\nYOU: {{passThrough[\"reply\"]}}\nWRITER: {{{{passThrough[\"reply\"]}}*}} [# Here we've encased {{passThrough[\"reply\"]}} inside a set of curly brackets. Imagine {{passThrough[\"reply\"]}} has the value \"What made you think that?\" Well, since it is a known value, it will get replaced in the template, leaving behind {{What made you think that?}}. However, this is not a known value. So the user will be asked \"What made you think that?\" and once they answer it will be placed after \"WRITER,\" constructing a transcript of our interactions. Why the asterisk? It's a way to force user input. Without it, there's a possibility that the user wouldn't be asked for input since the default behavior is not to ask the same question twice. Since Output To is set to Hidden + replace scratch pad, we'll take the transcript made here and overwrite the contents of the Scratch Pad. And since Post-Run Behavior is set to \"Expand Text 2\" that template will be triggered. #]\n",
    "reasoning_effort": "",
    "verbosity": "",
    "output": 0,
    "json_mode": 0,
    "json_schema": "",
    "output_to": 7,
    "behavior": "Expand Text 2",
    "hide_button": true,
    "run_in_new_tab": false
  },
  "Expand Text 2": {
    "prompt": "[# This template looks very much like the first in our chain, except it pulls from the Scratch Pad and feeds into \"Expand Text 3.\" #] You are an actor playing the role of a helpful writing assistant. In this scene you will interact with a writer. You are asks them questions about some copy they are working on. You're goal is to ask them enough question such that their answers can be used to expand on the existing text. That is, you want them to give you things one could use to expand on the existing text. As this is a dialogue, we will present it in the form of a transcript. The writer began by reading the copy they have so far. \n\n{{scratch}}\n\nThink about how your character would respond and craft an appropriate reply. You will provide the text of this reply along with one other piece of information as a JSON object. The object will have two key-value pairs. The first key-value pair's key is \"transcript\" and the value is that of the transcript above, starting with \"WRITER:\" the text of their copy and the subsequent questions and answers. Be sure to escape an quotation marks. And DO NOT repeat yourself (i.e., ask new questions). The second key-value pair has a key called \"reply\" and its value is the response you crafted above (i.e., it is the text of your character's reply to the above, your question for the writer). Make sure it's a question. Include only the text of your reply (e.g., do NOT preface the text with the name of the speaker). \n",    "temperature": 0.7,
    "reasoning_effort": "",
    "verbosity": "",
    "output": 1,
    "json_mode": 1,
    "json_schema": "",
    "output_to": 4,
    "behavior": "Expand Text 3",
    "hide_button": true,
    "run_in_new_tab": false
  },
  "Expand Text 3": {
    "prompt": "YOU: {{passThrough[\"reply\"]}}\nWRITER: {{{{passThrough[\"reply\"]}}*}} [# Here unlike \"Expand Text 1\" we append to, rather than overwrite, the Scratch Pad, meaning we just add to the transcript before passing things on to \"Expand Text 4.\" Again we place an asterisk before the closing curly brackets to force user input. #]\n",
    "reasoning_effort": "",
    "verbosity": "",
    "output": 0,
    "json_mode": 0,
    "json_schema": "",
    "output_to": 6,
    "behavior": "Expand Text 4",
    "hide_button": true,
    "run_in_new_tab": false
  },
  "Expand Text 4": {
    "prompt": "[# This looks a lot like \"Expand Text 2,\" but since it uses the Post-run Behavior DYNAMIC, it can trigger different templates based on the contents of the transcript (i.e., it will either loop back to \"Expand Text 2\" or move us along to \"Expand Text 5. #]You are an actor playing the role of a helpful writing assistant. In this scene you will interact with a writer. You are asks them questions about some copy they are working on. You're goal is to ask them enough question such that their answers can be used to expand on the existing text. That is, you want them to give you things one could use to expand on the existing text. As this is a dialogue, we will present it in the form of a transcript. The writer began by reading the copy they have so far. \n\n{{scratch}}\n\nYou will provide a JSON object in response to the above with a key named `next`. In your role as a writing assistant, consider if there is enough material in the above transcript to pad the original copy by 20%. You probably need at least three or four rounds of Q&A. However, if the replies are light on content, you may need more. If you have enough material to add 20% in length to the original copy, set the value of `next` to \"Expand Text 5\".  Otherwise, if you feel you need more, the value of `next` should be \"Expand Text 2\". \n",
    "reasoning_effort": "",
    "verbosity": "",
    "output": 1,
    "json_mode": 1,
    "json_schema": "",
    "output_to": 4,
    "behavior": "pass",
    "hide_button": true,
    "run_in_new_tab": false
  },
  "Expand Text 5": {
    "prompt": "[# Having collected more context from the user, we're now ready to produce some new text and copy that to the clipboard (Output To = Screen + clipboard). #]You are a helpful writing assistant. You've just had a conversation with a writer about some copy they're working on, and your task is to take what you learned from that conversation and rewrite the original copy such that its about 20% longer. Here's the text of your conversation. The writer began by reading the copy they have so far.\n\n{{scratch}}\n\nUse what you learned above to rewrite the original copy, adding details learned above. Do your best to keep the writer's voice and style while adding relevant details from your conversation to that first entry. Do NOT embellish! Do NOT make things up! Keep your additions firmly based on the content of your conversation, and don't make your copy too long! You goal is simply to flesh out the original text (i.e., the writer's first utterance above), adding about 20% in length. That being said, provide your new longer copy below.\n",    "temperature": 0.7,
    "reasoning_effort": "",
    "verbosity": "",
    "output": 1,
    "json_mode": 0,
    "json_schema": "",
    "output_to": 1,
    "behavior": "chat",
    "hide_button": true,
    "run_in_new_tab": false
  },
  "🤖 🐂 💩 BS with a \"bot\"": {
    "prompt": "{{Yes?}} [# {{Yes?}} isn't a predefined variable. So, the user will be presented with a text input, and since Post-run Behavior is set to CHAT, this ends up being a plain old chat with an LLM. #]\n",
    "reasoning_effort": "",
    "verbosity": "",
    "output": 1,
    "json_mode": 0,
    "json_schema": "",
    "output_to": 0,
    "behavior": "chat",
    "hide_button": false,
    "run_in_new_tab": false
  },
  "📄 Generic form letter (no LLM)": {
    "prompt": "{{DayOfWeek}}, {{Month}} {{day}}, {{year}} [# These are all predefined variables, and since Output Type is set to Prompt, this will just echo out the text of this template with variables replaced. #]\n\n{{Who is this letter addressed to?}}:\n\n[This is where you ({{What's your name?}}) should put the text of your boilerplate letter.] \n\nSincerely, \n{{What's your name?}} [# Note: The user is only presented with \"What's your name?\" once because the default behavior is not to repeat user prompts. If you added an asterisk before the closing brackets, however, it would force user input. #]",
    "reasoning_effort": "",
    "verbosity": "",
    "output": 0,
    "json_mode": 0,
    "json_schema": "",
    "output_to": 1,
    "behavior": "stop",
    "hide_button": false,
    "run_in_new_tab": false
  },
  "🎲 🎲 Variables \"random outcomes\" and \"time\"": {
    "prompt": "When building your prompts, consider using some of these preloaded variables. \n\nRandom Outcomes: \n\n- Coin Flip: {{coinFlip}}\n- D4 (1-4): {{d4}} \n- D6 (1-6): {{d6}}\n- D8 (1-8): {{d8}}\n- D% (0-9): {{d%}}\n- D20 (1-20): {{d20}}\n\nBrowser Date and Time:\n\n- Day of week (0-6): {{dayOfWeek}}\n- Day of week (English): {{DayOfWeek}}\n- Month (0-11): {{month}}\n- Month (1-12): {{month1}}\n- Month (01-12): {{month2d}}\n- Month (English): {{Month}}\n- Day of Month (1-31): {{day}}\n- Day of Month (01-31): {{day2d}}\n- Year: {{year}}\n- Hour (1-12): {{hours}}\n- Hour (01-12): {{hours2d}}\n- Hour (0-23): {{hours24}}\n- Hour (00-23): {{hours242d}}\n- AM or PM: {{ampm}}\n- Minute (0-59): {{minutes}}\n- Minute (00-59): {{minutes2d}}\n- Second (0-59): {{seconds}}\n- Second (00-59): {{seconds2d}}\n- All together: \n\nIt is {{hours}}:{{minutes2d}}:{{seconds2d}} {{ampm}} on {{DayOfWeek}}, {{Month}} {{day}}, {{year}}",
    "reasoning_effort": "",
    "verbosity": "",
    "output": 0,
    "json_mode": 0,
    "json_schema": "",
    "output_to": 0,
    "behavior": "stop",
    "hide_button": false,
    "run_in_new_tab": false
  },
  "🔍 Variables \"from this page\"": {
    "prompt": "When building your prompts, consider using text from the current webpage, be it selected/highlighted text or the whole page. For example...\n\nPage Data: \n\n- Highlighted words: {{nSelectedWords}}\n- Highlighted text: {{highlighted}}\n- Page words: {{nWordsOnPage}}\n- innerText of page: {{innerText}}",
    "reasoning_effort": "",
    "verbosity": "",
    "output": 0,
    "json_mode": 0,
    "json_schema": "",
    "output_to": 0,
    "behavior": "stop",
    "hide_button": false,
    "run_in_new_tab": false
  }
}

function default_prompts_for_model(modelName = get_default_model()) {
  // Keep built-in prompt records exactly as authored in default_prompts.
  // In particular, a blank model is meaningful: it inherits Default Model at
  // execution time and must not be materialized into the stored prompt.
  // modelName is retained in the signature for backward compatibility with
  // existing callers, but defaults are no longer rewritten from it.
  void modelName;
  const prompts = JSON.parse(JSON.stringify(default_prompts));
  Object.keys(prompts).forEach(function(name) {
    if (!Object.prototype.hasOwnProperty.call(prompts[name], 'run_in_new_tab')) {
      prompts[name].run_in_new_tab = false;
    }
  });
  return prompts;
}

  localStorage.setItem('default_templates', JSON.stringify(default_prompts_for_model()));
  
  if (localStorage.templates) {
      templates = JSON.parse(localStorage.templates)
  } else {
      const initial_prompts = default_prompts_for_model();
      localStorage.setItem('templates', JSON.stringify(initial_prompts));
      templates = JSON.parse(JSON.stringify(initial_prompts))
  }

// START ENCRYPTION 
// adapted from https://raw.githubusercontent.com/bradyjoslin/webcrypto-example/master/script.js
const buff_to_base64 = (buff) => btoa(
  new Uint8Array(buff).reduce(
      (data, byte) => data + String.fromCharCode(byte), ''
      )
  );
  
  const base64_to_buf = (b64) =>
      Uint8Array.from(atob(b64), (c) => c.charCodeAt(null));
  
  const enc = new TextEncoder();
  const dec = new TextDecoder();
  
  const getPasswordKey = (password) =>
      window.crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, [
      "deriveKey",
      ]);
  
  const deriveKey = (passwordKey, salt, keyUsage) =>
      window.crypto.subtle.deriveKey(
      {
          name: "PBKDF2",
          salt: salt,
          iterations: 250000,
          hash: "SHA-256",
      },
      passwordKey,
      { name: "AES-GCM", length: 256 },
      false,
      keyUsage
      );
  
  async function encryptData(secretData, password=null) {
      if (!password) {
          password = window.prompt("Password");
      }
      try {
      const salt = window.crypto.getRandomValues(new Uint8Array(16));
      const iv = window.crypto.getRandomValues(new Uint8Array(12));
      const passwordKey = await getPasswordKey(password);
      const aesKey = await deriveKey(passwordKey, salt, ["encrypt"]);
      const encryptedContent = await window.crypto.subtle.encrypt(
          {
          name: "AES-GCM",
          iv: iv,
          },
          aesKey,
          enc.encode(secretData)
      );
  
      const encryptedContentArr = new Uint8Array(encryptedContent);
      let buff = new Uint8Array(
          salt.byteLength + iv.byteLength + encryptedContentArr.byteLength
      );
      buff.set(salt, 0);
      buff.set(iv, salt.byteLength);
      buff.set(encryptedContentArr, salt.byteLength + iv.byteLength);
      const base64Buff = buff_to_base64(buff);
      return base64Buff;
      } catch (e) {
      console.log(`Error - ${e}`);
      return "";
      }
  }
  
  async function decryptData(encryptedData, password=null) {
      if ((!password) && (!sessionStorage.pwd)) {
        password = window.prompt("Password");
      } else if (sessionStorage.pwd) {
        password = sessionStorage.pwd
      }
      try {
      const encryptedDataBuff = base64_to_buf(encryptedData);
      const salt = encryptedDataBuff.slice(0, 16);
      const iv = encryptedDataBuff.slice(16, 16 + 12);
      const data = encryptedDataBuff.slice(16 + 12);
      const passwordKey = await getPasswordKey(password);
      const aesKey = await deriveKey(passwordKey, salt, ["decrypt"]);
      const decryptedContent = await window.crypto.subtle.decrypt(
          {
          name: "AES-GCM",
          iv: iv,
          },
          aesKey,
          data
      );
      sessionStorage.pwd = password;
      return dec.decode(decryptedContent);
      } catch (e) {
      console.log(`Error - ${e}`);
      alert("Key decryption failed. Reload page to try again, or continue, and enter a new key when prompted.")
      return "";
      }
  }
  // END ENCRYPTION
