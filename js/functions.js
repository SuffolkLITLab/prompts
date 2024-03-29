
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

function loadFile(filePath) {
    return fetch(filePath)
    .then(response => response.text())
    .then(data => {
        return data
    })
};

const default_prompts = {
    "Quick start advice": {
      "prompt": "[# This template has an Output Type = Prompt and a Output To = Screen only. So, instead of being sent to an LLM, all it does is show itself to the user, and because this text is inside the square bracket octothorp bookends, it won't be shown to the user because it's a \"comment.\" #]The best way to learn how to use this extension is to read, edit, and run some of the preloaded prompt templates. You can start down this road by clicking the \"Templates & Settings\" button at the bottom of this window.",
      "model": "gpt-3.5-turbo",
      "temperature": 0.7,
      "max_tokens": 250,
      "output": 0,
      "json_mode": 0,
      "output_to": 0,
      "behavior": "stop",
      "hide_button": false
    },
    "Summarize & question this page": {
      "prompt": "{{innerText}} [# FYI, the innerText variable will be replaced with the text from the current active browser tab, and because the Post-run Behavior is set to CHAT, you will be able to continue engaging with this text after the first reply. #]\n  \nProvide a short 150 word summary of the above text. If asked any follow-up questions, use the above text, and ONLY the above text, to answer them. If you can't find an answer in the above text, politely decline to answer explaining that you can't find the information. You can, however, finish a thought you started above if asked to continue, but don't write anything that isn't supported by the above text. And keep all of your replies short! \n",
      "model": "gpt-3.5-turbo-16k",
      "temperature": 0,
      "max_tokens": 250,
      "output": 1,
      "json_mode": 0,
      "output_to": 0,
      "behavior": "chat",
      "hide_button": false
    },
    "Politely decline an email (selected text)": {
      "prompt": "{{highlighted}} [# FYI, the highlighted variable will be replaced with any text you have highlighted/selected when you click the extension's popup, and because Output To is set to Screen + clipboard, the LLMs output will be ready to paste in an email after the interaction runs. #]\n\nThe above is an email. Draft a brief and professional reply politely declining its request. \n",
      "model": "gpt-3.5-turbo-16k",
      "temperature": 0.7,
      "max_tokens": 250,
      "output": 1,
      "json_mode": 0,
      "output_to": 1,
      "behavior": "stop",
      "hide_button": false
    },
    "Define selected word/phrase": {
      "prompt": "Define the following word/phrase: {{highlighted}}[# Here we've set the Output To equal to Screen + append to scratch pad which means that the LLM's output will be appended to the contents of your Scratch Pad, which can be accessed from the Popup by clicking the \"Scratch Pad\" button. #]\n",
      "model": "gpt-3.5-turbo",
      "temperature": 0,
      "max_tokens": 250,
      "output": 1,
      "json_mode": 0,
      "output_to": 2,
      "behavior": "stop",
      "hide_button": false
    },
    "Save Scratch Pad to file": {
      "prompt": "{{scratch}} [# The scratch variable will be replaced with the content of your Scratch Pad, which can be accessed from the Popup by clicking the \"Scratch Pad\" button. Since we have set the Output Type to Prompt, this prompt will not be sent to an LLM, but having set Post-run Behavior to SAVE TO FILE, it will trigger your browser's save to file action. #]",
      "model": "gpt-3.5-turbo",
      "temperature": 0.7,
      "max_tokens": 250,
      "output": 0,
      "json_mode": 0,
      "output_to": 0,
      "behavior": "file",
      "hide_button": false
    },
    "Summarize & question Scratch Pad": {
      "prompt": "{{scratch}} [# This template is just the \"Summarize & question this page\" template with the scratch variable in the place of innerText. Why? Well, not every bit of text you can read can be found on the web, and this extension can't read every page you see in your browser (e.g., PDFs). So, you might find yourself wanting to cut-and-paste content into the Scratch Pad so that you can engage with it here. #]\n  \nProvide a short 150 word summary of the above text. If asked any follow-up questions, use the above text, and ONLY the above text, to answer them. If you can't find an answer in the above text, politely decline to answer explaining that you can't find the information. You can, however, finish a thought you started above if asked to continue, but don't write anything that isn't supported by the above text. And keep all of your replies short!\n",
      "model": "gpt-3.5-turbo-16k",
      "temperature": 0,
      "max_tokens": 250,
      "output": 1,
      "json_mode": 0,
      "output_to": 0,
      "behavior": "chat",
      "hide_button": false
    },
    "\"Diagram\" selected sentence": {
      "prompt": "[# This template is here mostly to show off the JSON parameter (I'm not sure how much I really trust it). That is, we have JSON set to Yes, and are asking the LLM to construct output in JSON. Consequently, the LLM should produce well-structured JSON output. If you haven't seen JSON before, you might want to read up on it here: https://en.wikipedia.org/wiki/JSON. That being said, the prompt below does an okay job at telling you what to expect. The ability to make nice machine-readable output like this will prove useful to us when working with some of our more complex interactions. FWIW, I had ChatGPT create the specifications below. #]Below I will provide you with a string of text. Your job is to produce a JSON representation of its sentence structure. \n\n1. Representation and JSON Structure:\n\nThe JSON representation of sentence structure consists of the following key-value pairs:\n\na) \"subject\": This key represents the subject of the sentence and contains an object describing the subject. The subject object can include properties such as \"type\" (to specify the type of subject, e.g., noun or pronoun) and \"value\" (to store the actual subject word or phrase).\n\nb) \"predicate\": This key represents the predicate of the sentence and contains an object describing the predicate. The predicate object can include properties such as \"type\" (to specify the type of predicate, e.g., verb or verb phrase) and \"value\" (to store the actual predicate word or phrase).\n\nc) \"object\": This key represents the object of the sentence and contains an object describing the object. The object object can include properties such as \"type\" (to specify the type of object, e.g., noun or pronoun) and \"value\" (to store the actual object word or phrase).\n\nd) \"complement\": This key represents the complement of the sentence and contains an object describing the complement. The complement object can include properties such as \"type\" (to specify the type of complement, e.g., adjective or noun phrase) and \"value\" (to store the actual complement word or phrase).\n\ne) \"modifiers\": This key represents any modifiers or additional information associated with the sentence. It contains an array of objects, where each object describes a specific modifier. Each modifier object can include properties such as \"type\" (to specify the type of modifier, e.g., adverbial or prepositional phrase) and \"value\" (to store the actual modifier word or phrase).\n\n2. Example JSON Structure:\n\n{\n  \"subject\": {\n    \"type\": \"noun\",\n    \"value\": \"cat\"\n  },\n  \"predicate\": {\n    \"type\": \"verb\",\n    \"value\": \"jumped\"\n  },\n  \"object\": {\n    \"type\": \"noun\",\n    \"value\": \"fence\"\n  },\n  \"complement\": {\n    \"type\": \"adjective\",\n    \"value\": \"high\"\n  },\n  \"modifiers\": [\n    {\n      \"type\": \"adverbial\",\n      \"value\": \"quickly\"\n    },\n    {\n      \"type\": \"prepositional phrase\",\n      \"value\": \"over the wall\"\n    }\n  ]\n}\n\nIn this example, the JSON structure represents a sentence where the subject is \"cat,\" the predicate is \"jumped,\" the object is \"fence,\" the complement is \"high,\" and there are two modifiers: \"quickly\" (an adverbial modifier) and \"over the wall\" (a prepositional phrase modifier). \n\n3. Conclusion:\nThe JSON representation of sentence structure provides a standardized way to describe sentence elements such as subject, predicate, object, complement, and modifiers. It allows for the structured representation of sentence components, making it easier to process and analyze sentence structures programmatically.\n\nNow that I've given you these specifications, your job is to make such an object for the following text string:\n\n{{highlighted}}\n\nNow provide your JSON object: \n",
      "model": "gpt-3.5-turbo",
      "temperature": 0,
      "max_tokens": 300,
      "output": 1,
      "json_mode": 1,
      "output_to": 0,
      "behavior": "stop",
      "hide_button": false
    },
    "Translate & reply in original language": {
      "prompt": "[# This template's \"big trick\" is that the Post-run Behavior is set to \"display translation and prompt,\" which is the name of another template. This means that after this prompt is run through an LLM, it will trigger \"display translation and prompt,\" and pass to it this template's output. Because the Output To is set to Hidden, however, the user will not see this structured data. #]You are helping translate text into English. Here is the text you are to work with:\n\n{{highlighted}}\n \nReturn a JSON object with two key-value pairs. The first key is called `language`, and its value is the language of the above text. The second key is called `translation`, and its value is the above text translated into English. \n\nNow return the object: \n\n",
      "model": "gpt-3.5-turbo-16k",
      "temperature": 0,
      "max_tokens": 250,
      "output": 1,
      "json_mode": 1,
      "output_to": 4,
      "behavior": "display translation and prompt",
      "hide_button": false
    },
    "display translation and prompt": {
      "prompt": "Translate the following text into {{passThrough[\"language\"]}}. Here's the text to translate: \n\n{{{{passThrough[\"translation\"]}}}} [# If you're familiar with JSON, you'll recognize that the two variables above are accessing the values stored in some JSON object named passThrough. Namely, the value for \"language\" and \"translation.\" In this way we can very cleanly slice up the output from the prior template. Because the Hide Button checkbox is checked, the user will not see a button for \"display translation and prompt.\" That of course is okay, because it is being triggered by \"Translate & reply in original language.\" #]\n",
      "model": "gpt-3.5-turbo",
      "temperature": 0.7,
      "max_tokens": 250,
      "output": 1,
      "json_mode": 0,
      "output_to": 1,
      "behavior": "stop",
      "hide_button": true
    },
    "Coin flip to poem": {
      "prompt": "I'm going to flip a coin. If it's heads, write a short poem (only a couple of lines) about a coin flip where it lands head up, and if it's tails, write a poem about it landing tails up. Be very clear about the result of the coin flip in the poem. \n\nCoin flip: {{coinFlip}} [# The value of {{coinFlip}} is random, or as \"random.\" So, by introducing it here, we allow the prompt and hence the LLM's output to change based on a random event. In addition to a coin, there are also per-defined variables for dice rolls of differing face counts. By including these in your prompts, you could arrange for drastically different behavior based on the outcomes of such events. Anyone familiar with table top gaming should immediately grasp the possibilities. #]\n\nNow give me your response/poem: \n",
      "model": "gpt-3.5-turbo",
      "temperature": 0.9,
      "max_tokens": 163,
      "output": 1,
      "json_mode": 0,
      "output_to": 0,
      "behavior": "stop",
      "hide_button": false
    },
    "Shorten selected text": {
      "prompt": "You're a helpful editor and you're going to help trim some text. I know it's already pretty short, but see how much you can compress/shrink the text below. When you rewrite it, knock off at least 20% of the length, but keep the main points: \n\n{{highlighted}}\n",
      "model": "gpt-3.5-turbo",
      "temperature": 0.7,
      "max_tokens": 250,
      "output": 1,
      "json_mode": 0,
      "output_to": 1,
      "behavior": "stop",
      "hide_button": false
    },
    "Expand selected (short) text": {
      "prompt": "[# This template is the first in a chain of templates that can either end or loop back on itself. It works by getting the LLM to generate some dialog and send that along with text the user has highlighted to another template. That template takes an action and feeds into another template, and so on and so on. Note: we're using gpt-3.5-turbo-1106 as a model here and in some of the subsequent templates in this chain. When this model is retired it will break things and require updating. #]You are an actor playing the role of a helpful writing assistant. In this scene you will interact with a writer. You will ask them some questions about some copy they are working on. You're goal is to ask them enough question such that their answers can be used to expand on the existing text. That is, you want them to give you things one could use to expand on the existing text. As this is a dialogue, we will present it in the form of a transcript. The writer will start by reading what they have so far. \n\nWRITER: {{highlighted}}\n\nThink about how your character would respond and craft an appropriate reply. You will provide the text of this reply along with one other piece of information as a JSON object. The object will have two key-value pairs. The first key-value pair's key is \"transcript\" and the value is that of the transcript above, starting with \"WRITER:\" and followed by the text of their copy. Be sure to escape an quotation marks. The second key-value pair has a key called \"reply\" and its value is the response you crafted above (i.e., it is the text of your character's reply to the above, your first question for the writer). Include only the text of your reply (e.g., do NOT preface the text with the name of the speaker).\n",
      "model": "gpt-3.5-turbo-1106",
      "temperature": 0.7,
      "max_tokens": 250,
      "output": 1,
      "json_mode": 1,
      "output_to": 4,
      "behavior": "Role Play 1",
      "hide_button": false
    },
    "Role Play 1": {
      "prompt": "{{passThrough[\"transcript\"]}}\nYOU: {{passThrough[\"reply\"]}}\nWRITER: {{{{passThrough[\"reply\"]}}*}} [# Here we've encased {{passThrough[\"reply\"]}} inside a set of curly brackets. Imagine {{passThrough[\"reply\"]}} has the value \"What made you think that?\" Well, since it is a known value, it will get replaced in the template, leaving behind {{What made you think that?}}. However, this is not a known value. So the user will be asked \"What made you think that?\" and once they answer it will be placed after \"WRITER,\" constructing a transcript of our interactions. Why the asterisk? It's a way to force user input. Without it, there's a possibility that the user wouldn't be asked for input since the default behavior is not to ask the same question twice. Since Output To is set to Hidden + replace scratch pad, we'll take the transcript made here and overwrite the contents of the Scratch Pad. And since Post-Run Behavior is set to \"Role Play 2\" that template will be triggered. #]\n",
      "model": "gpt-3.5-turbo",
      "temperature": 0.7,
      "max_tokens": 250,
      "output": 0,
      "json_mode": 0,
      "output_to": 7,
      "behavior": "Role Play 2",
      "hide_button": true
    },
    "Role Play 2": {
      "prompt": "[# This template looks very much like the first in our chain, except it pulls from the Scratch Pad and feeds into \"Role Play 3.\" #] You are an actor playing the role of a helpful writing assistant. In this scene you will interact with a writer. You are asks them questions about some copy they are working on. You're goal is to ask them enough question such that their answers can be used to expand on the existing text. That is, you want them to give you things one could use to expand on the existing text. As this is a dialogue, we will present it in the form of a transcript. The writer began by reading the copy they have so far. \n\n{{scratch}}\n\nThink about how your character would respond and craft an appropriate reply. You will provide the text of this reply along with one other piece of information as a JSON object. The object will have two key-value pairs. The first key-value pair's key is \"transcript\" and the value is that of the transcript above, starting with \"WRITER:\" the text of their copy and the subsequent questions and answers. Be sure to escape an quotation marks. And DO NOT repeat yourself (i.e., ask new questions). The second key-value pair has a key called \"reply\" and its value is the response you crafted above (i.e., it is the text of your character's reply to the above, your question for the writer). Make sure it's a question. Include only the text of your reply (e.g., do NOT preface the text with the name of the speaker). \n",
      "model": "gpt-3.5-turbo-1106",
      "temperature": 0.7,
      "max_tokens": 2000,
      "output": 1,
      "json_mode": 1,
      "output_to": 4,
      "behavior": "Role Play 3",
      "hide_button": true
    },
    "Role Play 3": {
      "prompt": "YOU: {{passThrough[\"reply\"]}}\nWRITER: {{{{passThrough[\"reply\"]}}*}} [# Here unlike \"Role Play 1\" we append to, rather than overwrite, the Scratch Pad, meaning we just add to the transcript before passing things on to \"Role Play 4.\" Again we place an asterisk before the closing curly brackets to force user input. #]\n",
      "model": "gpt-3.5-turbo",
      "temperature": 0.7,
      "max_tokens": 250,
      "output": 0,
      "json_mode": 0,
      "output_to": 6,
      "behavior": "Role Play 4",
      "hide_button": true
    },
    "Role Play 4": {
      "prompt": "[# This looks a lot like \"Role Play 2,\" but since it uses the Post-run Behavior DYNAMIC, it can trigger different templates based on the contents of the transcript (i.e., it will either loop back to \"Role Play 2\" or move us along to \"Role Play 5. #]You are an actor playing the role of a helpful writing assistant. In this scene you will interact with a writer. You are asks them questions about some copy they are working on. You're goal is to ask them enough question such that their answers can be used to expand on the existing text. That is, you want them to give you things one could use to expand on the existing text. As this is a dialogue, we will present it in the form of a transcript. The writer began by reading the copy they have so far. \n\n{{scratch}}\n\nYou will provide a JSON object in response to the above with a key named `next`. In your role as a writing assistant, consider if there is enough material in the above transcript to pad the original copy by 20%. You probably need at least three or four rounds of Q&A. However, if the replies are light on content, you may need more. If you have enough material to add 20% in length to the original copy, set the value of `next` to \"Role Play 5\".  Otherwise, if you feel you need more, the value of `next` should be \"Role Play 2\". \n",
      "model": "gpt-3.5-turbo-1106",
      "temperature": 0.7,
      "max_tokens": 250,
      "output": 1,
      "json_mode": 1,
      "output_to": 4,
      "behavior": "pass",
      "hide_button": true
    },
    "Role Play 5": {
      "prompt": "[# Having collected more context from the user, we're now ready to produce some new text and copy that to the clipboard (Output To = Screen + clipboard). #]You are a helpful writing assistant. You've just had a conversation with a writer about some copy they're working on, and your task is to take what you learned from that conversation and rewrite the original copy such that its about 20% longer. Here's the text of your conversation. The writer began by reading the copy they have so far.\n\n{{scratch}}\n\nUse what you learned above to rewrite the original copy, adding details learned above. Do your best to keep the writer's voice and style while adding relevant details from your conversation to that first entry. Do NOT embellish! Do NOT make things up! Keep your additions firmly based on the content of your conversation, and don't make your copy too long! You goal is simply to flesh out the original text (i.e., the writer's first utterance above), adding about 20% in length. That being said, provide your new longer copy below.\n",
      "model": "gpt-3.5-turbo-16k",
      "temperature": 0.7,
      "max_tokens": 1000,
      "output": 1,
      "json_mode": 0,
      "output_to": 1,
      "behavior": "stop",
      "hide_button": true
    },
    "BS with a \"bot\"": {
      "prompt": "{{Yes?}} [# {{Yes?}} isn't a predefined variable. So, the user will be presented with a text input, and since Post-run Behavior is set to CHAT, this ends up being a plain old chat with an LLM. #]\n",
      "model": "gpt-3.5-turbo-16k",
      "temperature": 0.7,
      "max_tokens": 250,
      "output": 1,
      "json_mode": 0,
      "output_to": 0,
      "behavior": "chat",
      "hide_button": false
    },
    "Generic form letter (no LLM)": {
      "prompt": "{{DayOfWeek}}, {{Month}} {{day}}, {{year}} [# These are all predefined variables, and since Output Type is set to Prompt, this will just echo out the text of this template with variables replaced. #]\n\n{{Who is this letter addressed to?}}:\n\n[This is where you ({{What's your name?}}) should put the text of your boilerplate letter.] \n\nSincerely, \n{{What's your name?}} [# Note: The user is only presented with \"What's your name?\" once because the default behavior is not to repeat user prompts. If you added an asterisk before the closing brackets, however, it would force user input. #]",
      "model": "gpt-3.5-turbo",
      "temperature": 0.7,
      "max_tokens": 250,
      "output": 0,
      "json_mode": 0,
      "output_to": 1,
      "behavior": "stop",
      "hide_button": false
    },
    "Variables \"random outcomes\" and \"time\"": {
      "prompt": "When building your prompts, consider using some of these preloaded variables. \n\nRandom Outcomes: \n\n- Coin Flip: {{coinFlip}}\n- D4 (1-4): {{d4}} \n- D6 (1-6): {{d6}}\n- D8 (1-8): {{d8}}\n- D% (0-9): {{d%}}\n- D20 (1-20): {{d20}}\n\nBrowser Date and Time:\n\n- Day of week (0-6): {{dayOfWeek}}\n- Day of week (English): {{DayOfWeek}}\n- Month (1-12): {{month}}\n- Month (01-12): {{month2d}}\n- Month (English): {{Month}}\n- Day of Month (0-31): {{day}}\n- Day of Month (01-31): {{day2d}}\n- Year: {{year}}\n- Hour (1-12): {{hours}}\n- Hour (01-12): {{hours2d}}\n- Hour (0-23): {{hours24}}\n- Hour (00-23): {{hours242d}}\n- AM or PM: {{ampm}}\n- Minute (0-59): {{minutes}}\n- Minute (00-59): {{minutes2d}}\n- Second (0-59): {{seconds}}\n- Second (00-59): {{seconds2d}}\n- All together: \n\nIt is {{hours}}:{{minutes2d}}:{{seconds2d}} {{ampm}} on {{DayOfWeek}}, {{Month}} {{day}}, {{year}}",
      "model": "gpt-3.5-turbo",
      "temperature": 0.7,
      "max_tokens": 250,
      "output": 0,
      "json_mode": 0,
      "output_to": 0,
      "behavior": "stop",
      "hide_button": false
    },
    "Variables \"from this page\"": {
      "prompt": "When building your prompts, consider using text from the current webpage, be it selected/highlighted text or the whole page. For example...\n\nPage Data: \n\n- Highlighted words: {{nSelectedWords}}\n- Highlighted text: {{highlighted}}\n- Page words: {{nWordsOnPage}}\n- innerText of page: {{innerText}}",
      "model": "gpt-3.5-turbo",
      "temperature": 0.7,
      "max_tokens": 250,
      "output": 0,
      "json_mode": 0,
      "output_to": 0,
      "behavior": "stop",
      "hide_button": false
    }
  }
  
  localStorage.setItem('default_templates', JSON.stringify(default_prompts));
  
  if (localStorage.templates) {
      templates = JSON.parse(localStorage.templates)
  } else {
      localStorage.setItem('templates', JSON.stringify(default_prompts));
      templates = JSON.parse(JSON.stringify(default_prompts))
  }