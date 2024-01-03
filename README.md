# LIT Prompts

LIT Prompts is a browser extension that generates LLM prompts based on user-authored templates. It is a project of Suffolk University Law School's [Legal Innovation & Technology (LIT) Lab](https://suffolklitlab.org/). It was designed to help students explore [prompt engineering](https://suffolklitlab.org/). Users can create and save prompt templates for use within the extension. These templates can use data from your active browser window (e.g., selected text or the whole text of a webpage) as well as text input provided by you. They can also feed into each other, allowing one to create complex interactions. 

# OpenAI-Compatible API Integration

To run your interactions, you'll need to point to the [API](https://en.wikipedia.org/wiki/API) for a [Large Language Model](https://en.wikipedia.org/wiki/Large_language_model) (LLM). You can use an OpenAI endpoint/base (i.e., `https://api.openai.com/v1/chat/completions`) along with an OpenAI API key OR **you can use ANY endpoint that makes use of the same format!** For example, you could download something like [LM Studio](), spin up a local LLM, and point this extension at `localhost` (keeping your data on your computer). Alternatively, you could use a tool like [vLLM](https://docs.vllm.ai/en/latest/index.html) to spin up an OpenAI-compatible API server and point at that. 

## Using OpenAI with LIT Prompts

Login to [OpenAI](https://openai.com/), and navigate to the [API documentation](https://platform.openai.com/docs/). Note: when you create a new account you are given a limited API credit. If you created an account some time ago these may have expired. If your credits have expired, you will need to enter a [billing method](https://platform.openai.com/account/billing/overview) before you can use the API. 

![Screen shot of OpenAI API Keys page, showing where to click as described below](docs/images/OpenAI_keys.png)

1. Select "API keys" from the left menu
2. Click "+ Create new secret key"

On LIT Prompt's _Templates and Settings_ screen, set your API Base to `https://api.openai.com/v1/chat/completions` and your API Key equalt to the value you got above after clicking "+ Create new secret key".

## Using LM Studio with LIT Prompts

![Screen shot of LM Studio with numbers and arrows pointing to the sections described below](docs/images/LM_Studio.png)

After openig [LM Studio](https://lmstudio.ai/) and downloading a model/models. 

1. Select the "Local Inference Server" screen
2. Select your model
3. Make sure that Cross-Origin-Resource-Sharing is on
4. Start your server
5. copy the url for your server and use that as your API Base on LIT Prompt's _Templates and Settings_ screen (you can leave the API Key blank) 

# Export Interactions to HTML

You can export runnable versions of your interactions to one of two HTML output types: (1) a page that replicates this extension's "popup," the window with buttons that appears when you click the extension; or (2) a page that replicates both the "popup" and the "Scratch Pad." See the extention's _Templates & Settings_ screen for details. 

# Prompt Templates

When crafting a template, use a mix of plain language and variable placeholders. Specificlly, you can use double curly brackets to encase pre-defined variables and prompts for your user. If the text between the brackets matches one of our pre-defined variables, that section of text will be replaced with its content. For example, `{{highlighted}}` will be replaced by any selected/highlighted text on your current page, and `{{innerText}}` will be replaced by the text of your current page. If the text within brackets isn't a pre-defined variable, like `{{What is your name?}}`, it will trigger a user prompt that echo's its content (e.g., "What is your name?"). After the user answers, their reply will replace this placeholder (i.e., `{{What is your name?}}`). A list of pre-defined variables can be found below in [Variable Handling](#variable-handling). 

For a crash course on how everything fits together, you can read through this set of [sample templates](#sample-tempaltes) below in order. When looking at some templates, you will see comments between `[#` and `#]`. Such comments will not appear in the final prompts and are there to provide notes to template authors. For more detail, read the next section _Variable Handling_.

Note: You can explore and contribute to our [library of templates](templates) (pre-written template files you can upload here).

## Prompt Execution 

TK

## Trust and Safety

TK

## Sample Tempaltes

### Summarize & question this page
```
{{innerText}}
  
Provide a short 150 word summary of the above text. If asked any followup questions, use the above text, and ONLY the above text, to answer them. If you can't find an answer in the above text, reply, "I don't know." You can, however, finish a thought you started above if asked to continue, but don't write anything that isn't supported by the above text. And keep all of your replies short!


```
Output Type: `LLM`,  Model: `gpt-3.5-turbo-16k`,  Temperature: `0`,  Max Tokens: `250`,  JSON: `No`,  Default Output `Screen only`,  Post-run Behavior: `CHAT`,  Hide Button: `unchecked`  

### Politely decline an email (selected text)
```
{{highlighted}}

The above is an email. Draft a brief and professional reply politely declining its request. 


```
Output Type: `LLM`,  Model: `gpt-3.5-turbo-16k`,  Temperature: `0.7`,  Max Tokens: `250`,  JSON: `No`,  Default Output `Screen + clipboard`,  Post-run Behavior: `FULL STOP`,  Hide Button: `unchecked`  

### Define selected word/phrase
```
Define the following word/phrase: {{highlighted}}


```
Output Type: `LLM`,  Model: `gpt-3.5-turbo`,  Temperature: `0`,  Max Tokens: `250`,  JSON: `No`,  Default Output `Screen + append to scratch pad`,  Post-run Behavior: `FULL STOP`,  Hide Button: `unchecked`  

### Save Scratch Pad to file
```
{{scratch}}
```
Output Type: `Prompt`,  Model: `n/a`,  Temperature: `n/a`,  Max Tokens: `n/a`,  JSON: `No`,  Default Output `Screen only`,  Post-run Behavior: `SAVE TO FILE`,  Hide Button: `unchecked`  

### Summarize & question Scratch Pad
```
{{scratch}}
  
Provide a short 150 word summary of the above text. If asked any followup questions, use the above text, and ONLY the above text, to answer them. If you can't find an answer in the above text, reply, "I don't know." You can, however, finish a thought you started above if asked to continue, but don't write anything that isn't supported by the above text. And keep all of your replies short!


```
Output Type: `LLM`,  Model: `gpt-3.5-turbo-16k`,  Temperature: `0`,  Max Tokens: `250`,  JSON: `No`,  Default Output `Screen only`,  Post-run Behavior: `CHAT`,  Hide Button: `unchecked`  

### "Diagram" selected sentence
```
Below I will provide you with a string of text. Your job is to produce a JSON representation of its sentence structure. 

1. Representation and JSON Structure:

The JSON representation of sentence structure consists of the following key-value pairs:

a) "subject": This key represents the subject of the sentence and contains an object describing the subject. The subject object can include properties such as "type" (to specify the type of subject, e.g., noun or pronoun) and "value" (to store the actual subject word or phrase).

b) "predicate": This key represents the predicate of the sentence and contains an object describing the predicate. The predicate object can include properties such as "type" (to specify the type of predicate, e.g., verb or verb phrase) and "value" (to store the actual predicate word or phrase).

c) "object": This key represents the object of the sentence and contains an object describing the object. The object object can include properties such as "type" (to specify the type of object, e.g., noun or pronoun) and "value" (to store the actual object word or phrase).

d) "complement": This key represents the complement of the sentence and contains an object describing the complement. The complement object can include properties such as "type" (to specify the type of complement, e.g., adjective or noun phrase) and "value" (to store the actual complement word or phrase).

e) "modifiers": This key represents any modifiers or additional information associated with the sentence. It contains an array of objects, where each object describes a specific modifier. Each modifier object can include properties such as "type" (to specify the type of modifier, e.g., adverbial or prepositional phrase) and "value" (to store the actual modifier word or phrase).

2. Example JSON Structure:

{
  "subject": {
    "type": "noun",
    "value": "cat"
  },
  "predicate": {
    "type": "verb",
    "value": "jumped"
  },
  "object": {
    "type": "noun",
    "value": "fence"
  },
  "complement": {
    "type": "adjective",
    "value": "high"
  },
  "modifiers": [
    {
      "type": "adverbial",
      "value": "quickly"
    },
    {
      "type": "prepositional phrase",
      "value": "over the wall"
    }
  ]
}

In this example, the JSON structure represents a sentence where the subject is "cat," the predicate is "jumped," the object is "fence," the complement is "high," and there are two modifiers: "quickly" (an adverbial modifier) and "over the wall" (a prepositional phrase modifier). 

3. Conclusion:
The JSON representation of sentence structure provides a standardized way to describe sentence elements such as subject, predicate, object, complement, and modifiers. It allows for the structured representation of sentence components, making it easier to process and analyze sentence structures programmatically.

Now that I've given you these specifications, your job is to make such an object for the following text string:

{{highlighted}}

Now provide your JSON object:
```
Output Type: `LLM`,  Model: `gpt-3.5-turbo`,  Temperature: `0`,  Max Tokens: `250`,  JSON: `Yes`,  Default Output `Screen only`,  Post-run Behavior: `FULL STOP`,  Hide Button: `unchecked`  

### Translate & reply in orginal language
```
You are helping translate text into English. Here is the text you are to work with:

{{highlighted}}
 
Return a JSON object with two key-value pairs. The first key is called `language`, and its value is the language of the above text. The second key is called `translation`, and its value is the above text translated into English. 

Now return the object: 

```
Output Type: `LLM`,  Model: `gpt-3.5-turbo-16k`,  Temperature: `0`,  Max Tokens: `250`,  JSON: `Yes`,  Default Output `Hidden`,  Post-run Behavior: `display translation and prompt`,  Hide Button: `unchecked`  

### display translation and prompt
```
Translate the following text into {{passThrough["language"]}}. Here's the text to translate: 

{{{{passThrough["translation"]}}}}
```
Output Type: `LLM`,  Model: `gpt-3.5-turbo`,  Temperature: `0`,  Max Tokens: `250`,  JSON: `No`,  Default Output `Screen + clipboard`,  Post-run Behavior: `FULL STOP`,  Hide Button: `checked`  

### Coin flip to poem
```
I'm going to flip a coin. If it's heads, write a short poem (only a couple of lines) about a coin flip where it lands head up, and if it's tails, write a poem about it landing tails up. Be very clear about the result of the coin flip in the poem. 

Coin flip: {{coinFlip}} 

Now give me your response/poem: 


```
Output Type: `LLM`,  Model: `gpt-3.5-turbo`,  Temperature: `0.9`,  Max Tokens: `250`,  JSON: `No`,  Default Output `Screen only`,  Post-run Behavior: `FULL STOP`,  Hide Button: `unchecked`  

### Expand selected short text
```
[##]You are an actor playing the role of a helpful writing assistant. In this scene you will interact with a writer. You will ask them some questions about some copy they are working on. You're goal is to ask them enough question such that their answers can be used to expand on the existing text. That is, you want them to give you things one could use to expand on the existing text. As this is a dialogue, we will present it in the form of a transcript. The writer will start by reading what they have so far. 

WRITER: {{highlighted}}

Think about how your character would respond and craft an appropriate reply. You will provide the text of this reply along with one other piece of information as a JSON object. The object will have twp key-value pairs. The first key-value pair's key is "transcript" and the value is that of the transcript above, starting with "WRITER:" and followed by the text of their copy. Be sure to escape an quotation marks. The second key-value pair has a key called "reply" and its value is the response you crafted above (i.e., it is the text of your character's reply to the above, your first question for the writer). Include only the text of your reply (e.g., do NOT preface the text with the name of the speaker).
```
Output Type: `LLM`,  Model: `gpt-3.5-turbo-1106`,  Temperature: `0.7`,  Max Tokens: `250`,  JSON: `Yes`,  Default Output `Hidden`,  Post-run Behavior: `Role Play 1`,  Hide Button: `unchecked`  

### Role Play 1
```
{{passThrough["transcript"]}}
YOU: {{passThrough["reply"]}}
WRITER: {{{{passThrough["reply"]}}*}}

```
Output Type: `Prompt`,  Model: `n/a`,  Temperature: `n/a`,  Max Tokens: `n/a`,  JSON: `No`,  Default Output `Hidden + replace scratch pad`,  Post-run Behavior: `Role Play 2`,  Hide Button: `checked`  

### Role Play 2
```
You are an actor playing the role of a helpful writing assistant. In this scene you will interact with a writer. You are asks them questions about some copy they are working on. You're goal is to ask them enough question such that their answers can be used to expand on the existing text. That is, you want them to give you things one could use to expand on the existing text. As this is a dialogue, we will present it in the form of a transcript. The writer began by reading the copy they have so far. 

{{scratch}}

Think about how your character would respond and craft an appropriate reply. You will provide the text of this reply along with one other piece of information as a JSON object. The object will have three key-value pairs. The first key-value pair's key is "transcript" and the value is that of the transcript above, starting with "WRITER:" the text of their copy and the subsequent questions and answers. Be sure to escape an quotation marks. And DO NOT repeat yourself (i.e., ask new questions). The second key-value pair has a key called "reply" and its value is the response you crafted above (i.e., it is the text of your character's reply to the above, your question for the writer). Make sure it's a question. Include only the text of your reply (e.g., do NOT preface the text with the name of the speaker). 

```
Output Type: `LLM`,  Model: `gpt-3.5-turbo-1106`,  Temperature: `0.7`,  Max Tokens: `250`,  JSON: `Yes`,  Default Output `Hidden`,  Post-run Behavior: `Role Play 3`,  Hide Button: `checked`  

### Role Play 3
```
YOU: {{passThrough["reply"]}}
WRITER: {{{{passThrough["reply"]}}*}}

```
Output Type: `Prompt`,  Model: `n/a`,  Temperature: `n/a`,  Max Tokens: `n/a`,  JSON: `No`,  Default Output `Hidden + append to scratch`,  Post-run Behavior: `Role Play 4`,  Hide Button: `checked`  

### Role Play 4
```
You are an actor playing the role of a helpful writing assistant. In this scene you will interact with a writer. You are asks them questions about some copy they are working on. You're goal is to ask them enough question such that their answers can be used to expand on the existing text. That is, you want them to give you things one could use to expand on the existing text. As this is a dialogue, we will present it in the form of a transcript. The writer began by reading the copy they have so far. 

{{scratch}}

You will provide a JSON object in response to the above with a key named `next`. In your role as a writing assistant, consider if there is enough material in the above transcript to pad the original copy by 20%. You probably need at least three or four rounds of Q&A. However, if the replies are light on content, you may need more. If you have enough material to add 20% in length to the original copy, set the value of `next` to "Role Play 5".  Otherwise, if you feel you need more, the value of `next` should be "Role Play 2". 

```
Output Type: `LLM`,  Model: `gpt-3.5-turbo-1106`,  Temperature: `0.7`,  Max Tokens: `250`,  JSON: `Yes`,  Default Output `Hidden`,  Post-run Behavior: `DYNAMIC`,  Hide Button: `checked`  

### Role Play 5
```
You are a helpful writing assistant. You've just had a conversation with a writer about some copy they're working on, and your task is to take what you learned from that conversation and rewrite the original copy such that its about 20% longer. Here's the text of your conversation. The writer began by reading the copy they have so far.

{{scratch}}

Use what you learned above to rewrite the original copy, adding details learned above. Do your best to keep the writer's voice and style while adding relevant details from your conversation to that first entry. Do NOT embellish! Do NOT make things up! Keep your additions firmly based on the content of your conversation, and don't make your copy too long! You goal is simply to flesh out the original text (i.e., the writer's first utterance above), adding about 20% in length. That being said, provide your new longer copy below.


```
Output Type: `LLM`,  Model: `gpt-3.5-turbo-1106`,  Temperature: `0.7`,  Max Tokens: `2000`,  JSON: `No`,  Default Output `Screen + clipboard`,  Post-run Behavior: `FULL STOP`,  Hide Button: `checked`  

### BS with a "bot"
```
{{Yes?}}

```
Output Type: `LLM`,  Model: `gpt-3.5-turbo-16k`,  Temperature: `0.7`,  Max Tokens: `250`,  JSON: `No`,  Default Output `Screen only`,  Post-run Behavior: `CHAT`,  Hide Button: `unchecked`  

### Generic form letter (no LLM)
```
{{DayOfWeek}}, {{Month}} {{day}}, {{year}}

{{Who is this letter addressed to?}}:

[This is where you ({{What's your name}}) should put the text of your boilerplate letter.] 

Sincerely, 
{{What's your name}}
```
Output Type: `Prompt`,  Model: `n/a`,  Temperature: `n/a`,  Max Tokens: `250`,  JSON: `No`,  Default Output `Screen + clipboard`,  Post-run Behavior: `FULL STOP`,  Hide Button: `unchecked`  

### Variables "random outcomes" and "time"
```
When building your prompts, consider using some of these preloaded variables. 

Random Outcomes: 

- Coin Flip: {{coinFlip}}
- D4 (1-4): {{d4}} 
- D6 (1-6): {{d6}}
- D8 (1-8): {{d8}}
- D% (0-9): {{d%}}
- D20 (1-20): {{d20}}

Browser Date and Time:

- Day of week (0-6): {{dayOfWeek}}
- Day of week (English): {{DayOfWeek}}
- Month (1-12): {{month}}
- Month (01-12): {{month2d}}
- Month (English): {{Month}}
- Day of Month (0-31): {{day}}
- Day of Month (01-31): {{day2d}}
- Year: {{year}}
- Hour (1-12): {{hours}}
- Hour (01-12): {{hours2d}}
- Hour (0-23): {{hours24}}
- Hour (00-23): {{hours242d}}
- AM or PM: {{ampm}}
- Minute (0-59): {{minutes}}
- Minute (00-59): {{minutes2d}}
- Second (0-59): {{seconds}}
- Second (00-59): {{seconds2d}}
- All together: 

It is {{hours}}:{{minutes2d}}:{{seconds2d}} {{ampm}} on {{DayOfWeek}}, {{Month}} {{day}}, {{year}}
```
Output Type: `Prompt`,  Model: `n/a`,  Temperature: `n/a`,  Max Tokens: `250`,  JSON: `No`,  Default Output `Screen only`,  Post-run Behavior: `FULL STOP`,  Hide Button: `unchecked`  

### Variables "from this page"
```
When building your prompts, consider using text from the current webpage, be it selected/highlighted text or the whole page. For example...

Page Data: 

- Highlighted words: {{nSelectedWords}}
- Highlighted text: {{highlighted}}
- Page words: {{nWordsOnPage}}
- innerText of page: {{innerText}}

```
Output Type: `Prompt`,  Model: `n/a`,  Temperature: `n/a`,  Max Tokens: `250`,  JSON: `No`,  Default Output `Screen only`,  Post-run Behavior: `FULL STOP`,  Hide Button: `unchecked`  
