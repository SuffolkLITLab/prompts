//
// Load defaults
//

if (localStorage.api_key) {
  api_key = localStorage.api_key
} else {
  api_key = ""
  //FOR EXPORT: localStorage.setItem('api_key',api_key)
}

if (localStorage.api_base) {
  api_base = localStorage.api_base
} else {
  api_base = "https://api.openai.com/v1/chat/completions"
  //FOR EXPORT: localStorage.setItem('api_base',api_base)
}

var bodyText = "";
var selectedText = "";
var question_arry = {};
var last_question = "";
var output_type = "";
var llm_prompt = "";
var llm_messages = [];
var LLM_text_collection = "";
var model = "";
var template = "";
var temperature = 0;
var max_tokens = 0;
var json_mode = 0;
var output_to = 0;
var behavior = "";
var passThrough = "";
var bubble = 0;
var calls = 0;

popup_CSS = `* {
  box-sizing: border-box;
}

input:focus, textarea {
  outline: none;
}

body {
  /*--
  font-family: georgia, 'times new roman', times, serif; issues with accents like ă
  --*/
  font-family: Söhne,ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Cantarell,Noto Sans,sans-serif,Helvetica Neue,Arial,Apple Color Emoji,Segoe UI Emoji,Segoe UI Symbol,Noto Color Emoji;
  box-sizing: border-box;
}

#scratch_pad {
  box-sizing: border-box;
  width:100%;
  height:100%;
  padding:20px;
  border:0px solid #ccc;
  resize: none;
  overflow-y: auto;
}

.text_wrap{
  float:left;
  width:100%;
  margin:0;
  padding:0;
}

.input_text {
  float:right;
  font-size: 16px;
  line-height: 20px;
  margin: 0px 5px 15px 0;
  max-width:100%;
  margin-left:20%;
  background:#eee;
  border-radius:8px;
  padding:15px;
}

.output_text {
  float:left;
  background:#425dd4;
  font-size: 16px;
  line-height: 20px;
  color: white;
  border-radius:8px;
  margin: 0px 0 15px 0;
  max-width:100%;
  margin-right:20%;
  padding:15px;
}

code {
  background:#2c3e8e;
}

.code_wrapper {
  padding:3px;
  margin: 0px;
  width:100%;
  overflow-x: auto;
  background:#2c3e8e;
}

.msg_text {
  float:left;
  font-family: Verdana, Geneva, sans-serif;
  font-variant: small-caps;
  width:100%;
  text-align: center;
  font-size: 14px;
  color:#7d7878;
  margin:0 0 15px 0;
}`

//
// General functions
//

function start_spinner(target_id) {
  var opts = {
    lines: 13, // The number of lines to draw
    length: 7, // The length of each line
    width: 4, // The line thickness
    radius: 10, // The radius of the inner circle
    corners: 1, // Corner roundness (0..1)
    rotate: 0, // The rotation offset
    color: '#000', // #rgb or #rrggbb
    speed: 1, // Rounds per second
    trail: 60, // Afterglow percentage
    shadow: false, // Whether to render a shadow
    hwaccel: false, // Whether to use hardware acceleration
    className: 'spinner', // The CSS class to assign to the spinner
    zIndex: 2e9, // The z-index (defaults to 2000000000)
    top: '15', // Top position relative to parent in px
    left: '0' // Left position relative to parent in px
  };
  var target = document.getElementById(target_id);
  var spinner = new Spinner(opts).spin(target);
}

document.addEventListener('DOMContentLoaded', function () {

  var myButton = document.getElementById('send');
  myButton.addEventListener('click', function() {
    submit_text();
  });  

  var myChatAns = document.getElementById('chat_user_input');
  myChatAns.addEventListener('keydown', submitChatOnEnter);  

  var myChatButton = document.getElementById('chat_send');
  myChatButton.addEventListener('click', function() {
    submit_chat_text();
  });    

  var myContinueButton = document.getElementById('continueButton');
  myContinueButton.addEventListener('click', function() {
    submit_continue();
  });    

  var toPromptButton = document.getElementById('toPrompt');
  toPromptButton.addEventListener('click', function() {
    choose_prompt();
  });

  var credentialsButton = document.getElementById('credentialsButton');
  credentialsButton.addEventListener('click', function() {
    saveAPICred();
  });

  document.getElementById("api_base").addEventListener("keydown", saveOnEnter);
  document.getElementById("api_key").addEventListener("keydown", saveOnEnter);

  var mySettings = document.getElementById('config');
  mySettings.addEventListener('click', function() {
    window.open("options.html", 'options').focus();
  });

  var myScratch = document.getElementById('scratch');
  myScratch.addEventListener('click', function() {
    window.open("scratch.html", 'scratch').focus();
  });

  var myAbout = document.getElementById('about');
  myAbout.addEventListener('click', function() {
    window.open("https://github.com/SuffolkLITLab/prompts", '_projectPage').focus();
  });

  var myFeedback = document.getElementById('feedback');
  myFeedback.addEventListener('click', function() {
    window.open("https://github.com/SuffolkLITLab/prompts/issues", '_logIssues').focus();
  });

  var save_transcript = document.getElementById('save_transcript');
  save_transcript.addEventListener('click', function() {
      const d = new Date();
      const day_list = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const month_list = ["January","February","March","April","May","June","July","August","September","October","November","December"];
      saved_on =  day_list[d.getDay()] + ", " + month_list[d.getMonth()] + " " + d.getDate() + ", " + d.getFullYear();

      transcript_html = "<html>\n<head>\n<title>Transcript: "+ saved_on +"</title><style>\n"+popup_CSS+"\n</style>\n</head>\n<body>\n";
      transcript_html += document.getElementById('transcript').innerHTML;
      transcript_html += "<div class='msg_text'>Saved "+saved_on+" at " + (d.getHours() % 12 || 12) + ":" + ('0' + d.getMinutes()).slice(-2) + " " + (d.getHours() >= 12 ? 'pm' : 'am') + "</div>"
      transcript_html += "\n</body>\n</html>";
      saveTextAsFile(transcript_html,"transcript_"+d.getFullYear()+"-"+('0'  + d.getMonth()).slice(-2)+"-"+('0'  + d.getDate()).slice(-2)+"T"+('0'  + d.getHours()).slice(-2)+('0' + d.getMinutes()).slice(-2)+('0'  + d.getSeconds()).slice(-2)+".html")
  });

  document.getElementById("restartButton").addEventListener("click", function() {
    location.reload();
  });

//FOR EXPORT:   if (!localStorage.scratch_pad) {
//FOR EXPORT:     localStorage.setItem('scratch_pad',"")
//FOR EXPORT:   } else {
//FOR EXPORT:      document.getElementById('scratch_pad').value = localStorage.scratch_pad
//FOR EXPORT:   }  

  var BORDER_SIZE = 8;
      
  let m_pos;
  function resize(e){
    if (window.innerWidth>=458) {
      const dx = m_pos - e.x;
      m_pos = e.x;
      panel_width = parseInt(getComputedStyle(panel, '').width)
      if (panel_width<180) {
        panel_width = 181;
      } else if ((window.innerWidth-panel_width)< 90) {
        panel_width = window.innerWidth - 91;
      }
      panel.style.width = (panel_width + dx) + "px";
      panel_l.style.right = (panel_width + dx) + "px";
      localStorage.panel_w = (panel_width + dx);  
    } else {
      panel.style.width = "100%"
      panel_l.style.right = "100%"
    }
  }

  if (window.innerWidth>=458) {
    panel_width = localStorage.panel_w
    if ((panel_width=="100%") & (window.getComputedStyle(document.getElementById("inline_scratch"), null).display =="none")) {
      document.getElementById("main_wrapper").style.width = "100%"
      document.getElementById("inline_scratch").style.right = "100%"  
    } else if (panel_width>(window.innerWidth-80)) {
      document.getElementById("main_wrapper").style.width =  "50%"
      document.getElementById("inline_scratch").style.right = "50%"
    } else if (panel_width>0) {
      document.getElementById("main_wrapper").style.width = localStorage.panel_w + "px";
      document.getElementById("inline_scratch").style.right = (parseInt(localStorage.panel_w)) + "px";
    } else {
      if (window.getComputedStyle(document.getElementById("inline_scratch"), null).display =="none") {
        document.getElementById("main_wrapper").style.width = "100%"
        document.getElementById("inline_scratch").style.right = "100%"    
      } else {
        panel_width = 450;
        localStorage.panel_w = panel_width
        document.getElementById("main_wrapper").style.width = localStorage.panel_w + "px";
        document.getElementById("inline_scratch").style.right = (parseInt(localStorage.panel_w)) + "px";  
      }
    }
  } else {
    document.getElementById("main_wrapper").style.width = "100%"
    document.getElementById("inline_scratch").style.right = "100%"
    localStorage.panel_w = "100%"
  }

  var panel = document.getElementById("main_wrapper");
  panel.addEventListener("mousedown", function(e){
    if (e.offsetX < BORDER_SIZE) {
      m_pos = e.x;
      document.addEventListener("mousemove", resize, false);
    }
  }, false);
  
  var panel_l = document.getElementById("inline_scratch");
  document.addEventListener("mouseup", function(){
      document.removeEventListener("mousemove", resize, false);
  }, false);

  // Save text to localStorage on change
  document.getElementById('scratch_pad').addEventListener('input', function() {
    localStorage.setItem('scratch_pad', this.value);
    current_text = this.value;
  });

});

//
// Construct, submit, and handel prompts
//

function choose_prompt(choice) {

  calls+=1;
  console.log("Choosing template: "+choice)
  console.log("Runs w/o interaction: "+calls)

  if (calls>=20) {
    if (confirm(`Are you in a loop? You've made 20 prompt calls without human interaction. Choose "OK" to continue or "Cancel" to stop here.`) == true) {
      calls = 0;
    } else {
      insert_restart();
    }
  }

  if (calls<20) {

    output_type = templates[choice]["output"]
    template = templates[choice]["prompt"];
    model = templates[choice]["model"];
    max_tokens = templates[choice]["max_tokens"]; // How long the answer should be 
    temperature = templates[choice]["temperature"]; // How free-ranging the reply is 0-1 
    json_mode = templates[choice]["json_mode"];
    output_to = templates[choice]["output_to"];
    behavior = templates[choice]["behavior"];

    llm_prompt = template

    // remove comments
    llm_prompt = llm_prompt.replace(/\[\#[\s\S]*?\#\]/g, "");

    if (llm_prompt){
      abandon_prompt = 0;
      // Place selected text into template
      if (selectedText=="" && template.match(/{{highlighted}}/g)) {
        console.log("Unable to find Highlighted / Selected text for this page.");
        if (confirm('Unable to find Highlighted / Selected text for this page. Choose "OK" to continue with an empty value or "Cancel" to stop this prompt.') == true) {
          llm_prompt = llm_prompt.replace(/{{highlighted}}/g, ""); 
          llm_prompt = llm_prompt.replace(/{{nSelectedWords}}/g, 0); 
        } else {
          abandon_prompt = 1;
        }
      } else {
        if (selectedText.length>0) {
          llm_prompt = llm_prompt.replace(/{{highlighted}}/g, selectedText.replace(/({|})/g, "\\$1")); 
          llm_prompt = llm_prompt.replace(/{{nSelectedWords}}/g, selectedText.match(/\b(\w+)\b/g).length); 
        } else {
          llm_prompt = llm_prompt.replace(/{{highlighted}}/g, ""); 

          llm_prompt = llm_prompt.replace(/{{nSelectedWords}}/g, 0); 
        }
      }

      if (abandon_prompt == 0) {
        // Place page text into template
        if (bodyText=="" && template.match(/{{innerText}}/g)) {
          console.log("Unable to parse innerText for this page.");
          if (confirm('Unable to parse innerText for this page. Choose "OK" to continue with an empty value or "Cancel" to stop this prompt.') == true) {
            llm_prompt = llm_prompt.replace(/{{innerText}}/g, "");
            llm_prompt = llm_prompt.replace(/{{nWordsOnPage}}/g, 0);
          } else {
            abandon_prompt = 1;
          }
        } else {
          if (bodyText.length>0) {
            llm_prompt = llm_prompt.replace(/{{innerText}}/g, bodyText.replace(/({|})/g, "\\$1"));
            llm_prompt = llm_prompt.replace(/{{nWordsOnPage}}/g, bodyText.match(/\b(\w+)\b/g).length);
          } else {
            llm_prompt = llm_prompt.replace(/{{innerText}}/g, "");
            llm_prompt = llm_prompt.replace(/{{nWordsOnPage}}/g, 0);
          }
        }
      }

    } else {
      alert(`Can't read prompt. Please check its contents by clicking "Templates & Settings" bellow.`)
      abandon_prompt = 1;

    }

    if (abandon_prompt == 0) {
      // Place scrtach pad text into template
      llm_prompt = llm_prompt.replace(/{{scratch}}/g, localStorage.getItem('scratch_pad'));
      try {
        console.log("Attempting to parse Scratch Pad for JSON...")
        scratch = JSON.parse(localStorage.getItem('scratch_pad').trim());
      } catch (error) {
        console.log("Scratch Pad isn't JSON.")
      }
      var scratchjson = llm_prompt.match(/{{scratch\["[a-zA-Z_-]+"\]}}/g);
      // Loop through each variable and present it as a question
      if (scratchjson) {
        console.log("Checking scratch...");
        for (item of scratchjson) {
            key = [...item.matchAll(/{{scratch\["([a-zA-Z_]+)"\]}}/g)][0][1];
            console.log(" - scratch[\""+key+"\"]="+scratch[key]);
            llm_prompt = llm_prompt.replace("{{scratch[\""+key+"\"]}}", scratch[key]);  
        }
      }
      

      llm_prompt = llm_prompt.replace(/{{passThrough}}/g, passThrough);
      var passThroughjson = llm_prompt.match(/{{passThrough\["[a-zA-Z_-]+"\]}}/g);
      // Loop through each variable and present it as a question
      if (passThroughjson) {
        console.log("Checking passThrough...");
        for (item of passThroughjson) {
            key = [...item.matchAll(/{{passThrough\["([a-zA-Z_]+)"\]}}/g)][0][1];
            console.log(" - passThrough[\""+key+"\"]="+passThrough[key]);
            llm_prompt = llm_prompt.replace("{{passThrough[\""+key+"\"]}}", passThrough[key]);  
        }
      }

      // ------------------------------------------------------
      // Add predefined variables to the the template
      // ------------------------------------------------------
    
      // Coin
      flip = Math.floor(Math.random() * 2)
      flip_out = ["heads","tails"]
      llm_prompt = llm_prompt.replace(/{{coinFlip}}/g,flip_out[flip]);
      // Dice 
      roll = Math.floor(Math.random() * 4) + 1
      llm_prompt = llm_prompt.replace(/{{d4}}/g,roll);
      roll = Math.floor(Math.random() * 6) + 1
      llm_prompt = llm_prompt.replace(/{{d6}}/g,roll);
      roll = Math.floor(Math.random() * 8) + 1
      llm_prompt = llm_prompt.replace(/{{d8}}/g,roll);
      roll = Math.floor(Math.random() * 11)
      llm_prompt = llm_prompt.replace(/{{d%}}/g,roll);
      roll = Math.floor(Math.random() * 12) + 1
      llm_prompt = llm_prompt.replace(/{{d12}}/g,roll);
      roll = Math.floor(Math.random() * 20) + 1
      llm_prompt = llm_prompt.replace(/{{d20}}/g,roll);

      // Dates 
      const d = new Date();
      const day_list = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      llm_prompt = llm_prompt.replace(/{{dayOfWeek}}/g, d.getDay()); // number
      llm_prompt = llm_prompt.replace(/{{DayOfWeek}}/g, day_list[d.getDay()]); // english
      const month_list = ["January","February","March","April","May","June","July","August","September","October","November","December"];
      llm_prompt = llm_prompt.replace(/{{month}}/g, d.getMonth()); // number
      llm_prompt = llm_prompt.replace(/{{month2d}}/g, ('0'  + d.getMonth()).slice(-2)); // number
      llm_prompt = llm_prompt.replace(/{{Month}}/g, month_list[d.getMonth()]); // english
      llm_prompt = llm_prompt.replace(/{{day}}/g, d.getDate()); // day of month
      llm_prompt = llm_prompt.replace(/{{day2d}}/g, ('0'  + d.getDate()).slice(-2)); // day of month
      llm_prompt = llm_prompt.replace(/{{year}}/g, d.getFullYear()); // YEAR
      llm_prompt = llm_prompt.replace(/{{hours24}}/g, d.getHours()); // hours (out of 24)
      llm_prompt = llm_prompt.replace(/{{hours242d}}/g, ('0'  + d.getHours()).slice(-2)); // hours (out of 24)
      llm_prompt = llm_prompt.replace(/{{hours}}/g, (d.getHours() % 12 || 12)); // hours (out of 12)
      llm_prompt = llm_prompt.replace(/{{hours2d}}/g, ('0'  + (d.getHours() % 12 || 12)).slice(-2)); // hours (out of 12)
      llm_prompt = llm_prompt.replace(/{{ampm}}/g, d.getHours() >= 12 ? 'pm' : 'am');
      llm_prompt = llm_prompt.replace(/{{minutes}}/g, d.getMinutes());
      llm_prompt = llm_prompt.replace(/{{minutes2d}}/g, ('0'  + d.getMinutes()).slice(-2));
      llm_prompt = llm_prompt.replace(/{{seconds}}/g, d.getSeconds());
      llm_prompt = llm_prompt.replace(/{{seconds2d}}/g, ('0'  + d.getSeconds()).slice(-2));

      if (llm_prompt.trim()=="") {
        alert(`Error: Empty prompt. Please check its contents by clicking "Templates & Settings" bellow.`)
        abandon_prompt = 1;
      } else {
        build_prompt();
      }
      
    }
  }

}

function scroll2Q(id) {
  document.getElementById('save_transcript').style.display='block';

  if (bubble>0) {
    var top = document.getElementById(id).offsetTop; //Getting Y of target element
    console.log("Jump to Y for ("+id+"): "+top);
    //adapted from https://github.com/Yappli/smooth-scroll
    moving_frequency = 0.75
    var getScrollTopDocumentAtBegin = document.documentElement.scrollTop + document.body.scrollTop;
    console.log("Y:",top,getScrollTopDocumentAtBegin)
    var hop_count = Math.round((top - getScrollTopDocumentAtBegin)/moving_frequency)
    var gap = (top - getScrollTopDocumentAtBegin) / hop_count;
    for(var i = 1; i <= hop_count; i++)
        {
          (function()
            {
              var hop_top_position = gap*i;
                setTimeout(function(){  window.scrollTo(0, hop_top_position + getScrollTopDocumentAtBegin); }, moving_frequency*i);
              })();
        }
  }
}

function build_prompt() {
  console.log("Building prompt...");
  LLM_text_collection = "";
      
  // Make a list of all other variables (i.e. text of the form {{variable}}). 
  var questions = llm_prompt.match(/{{[^}]+}}/g)

  console.log("Questions:",questions)
  document.getElementById('button_list').style.display='none';
  document.getElementById('transcript').style.display='block';

  // Loop through each variable and present it as a question
  if (questions) {
    for (question of questions) {
      last_question = question;
      if ((!question_arry[question]) || (question_arry[question].match(/\*}}$/))) {
        question_ = question.replace(/\*}}$/,"}}")
        question_ = question_.replace(/{|}/g,"");
        if (document.getElementById('thinking_box').style.display=="block") {
          setTimeout(() => {
            document.getElementById('thinking_box').style.display='none';
            document.getElementById('text_input').style.display='block';
            document.getElementById('user_input').focus();
            bubble+=1;
            document.getElementById('output_window').innerHTML += "<div class='text_wrap' id='text_"+bubble+"'><div class='output_text'>"+question_+"</div></div>";
            scroll2Q("text_"+bubble);
            document.getElementById("user_input").addEventListener("keydown", submitOnEnter);
          }, 300);        
        } else {
          document.getElementById('thinking_box').style.display='none';
          document.getElementById('text_input').style.display='block';
          document.getElementById('user_input').focus();
          bubble+=1;
          document.getElementById('output_window').innerHTML += "<div class='text_wrap' id='text_"+bubble+"'><div class='output_text'>"+question_+"</div></div>";
          scroll2Q("text_"+bubble);
          document.getElementById("user_input").addEventListener("keydown", submitOnEnter);
        }
        break
      } else {
        llm_prompt = llm_prompt.replaceAll(last_question,question_arry[last_question]);
        build_prompt(0);
        break
      }
    }
  } else {

    document.getElementById('thinking_box').style.display='block';

    // Count the words in the prompt
    words = llm_prompt.match(/\b(\w+)\b/g).length;
    token_est = Math.round(words*1.75)

    console.log("Words in prompt: "+words+" (~"+token_est+" tokens)\nMODEL: "+model+"\nPROMPT:\n\n"+llm_prompt)

    if (output_type==1) {
      console.log("Mode: Calling LLM")
      openai_call(llm_prompt)
    } else {
      console.log("Mode: Prompt only")
      after_build(llm_prompt)
    }
    
  }
}

function submit_text() {
  
  answer =  document.getElementById('user_input').value;
  if (answer.length>0) {
    console.log("Sending text...")
    calls=0;
    document.getElementById('text_input').style.display='none'
    document.getElementById('thinking_box').style.display='block';
    bubble+=1;
    document.getElementById('output_window').innerHTML += "<div class='text_wrap' id='text_"+bubble+"'><div class='input_text'>"+answer+"</div></div>";
    scroll2Q("text_"+bubble);
    llm_prompt = llm_prompt.replaceAll(last_question, answer);
    question_arry[last_question] = answer;
    console.log("Q: "+question_+"\nA: "+answer);
    document.getElementById('user_input').value = "";
    build_prompt(0);  
  } else {
    alert("You cannot leave this input blank.");
    document.getElementById('user_input').focus();
  }
}

function saveAPICred() {
  localStorage.setItem("api_base",document.getElementById('api_base').value)
  localStorage.setItem("api_key",document.getElementById('api_key').value)
  document.getElementById('credentials').style.display='none';
  document.getElementById('output_window').innerHTML += "<div class='msg_text'>credentials saved</div>";
  insert_restart();
}

function saveOnEnter(event) {
  if (event.which === 13) {
      if (!event.repeat) {
        saveAPICred()
      }
      event.preventDefault(); // Prevents the addition of a new line in the text field
  }
}

function submitOnEnter(event) {
  if (event.which === 13) {
      if (!event.repeat) {
        submit_text();
      }
      event.preventDefault(); // Prevents the addition of a new line in the text field
  }
}

function submit_chat_text() {
  answer =  document.getElementById('chat_user_input').value;
  if (answer.length>0) {
    console.log("Sending text...")
    calls=0;
    document.getElementById('chat_text_input').style.display='none'
    document.getElementById('thinking_box').style.display='block';
    bubble+=1;
    document.getElementById('output_window').innerHTML += "<div class='text_wrap' id='text_"+bubble+"'><div class='input_text'>"+answer+"</div></div>";
    scroll2Q("text_"+bubble);
    document.getElementById('chat_user_input').value = "";
    openai_call(answer)  
  } else {
    alert("You cannot leave this input blank.");
    document.getElementById('user_input').focus();
  }
}

function submitChatOnEnter(event) {
  if (event.which === 13) {
      if (!event.repeat) {
        submit_chat_text();
      }
      event.preventDefault(); // Prevents the addition of a new line in the text field
  }
}

function submit_continue() {
  console.log("Sending continue request...")
  calls=0;
  document.getElementById('continue_gen').style.display='none';
  document.getElementById('thinking_box').style.display='block';
  openai_call("You got cutoff. Pickup where you left off and continue.")  
}

async function openai_call(prompt_text) {

  var xhr = new XMLHttpRequest();
  xhr.open("POST", api_base);

  xhr.setRequestHeader("Content-Type", "application/json");
  xhr.setRequestHeader("Authorization", "Bearer "+api_key);

  xhr.onreadystatechange = function () {
     if (xhr.readyState === 4) {
      try {
        console.log(xhr.responseText);
        LLM_text = JSON.parse(xhr.responseText)["choices"][0]["message"]["content"];
        llm_messages.push({"role": "assistant", "content": LLM_text})
        after_build(LLM_text, JSON.parse(xhr.responseText)["choices"][0]["finish_reason"]);
      } catch (error) {
        llm_messages.pop();
        try {
          if (JSON.parse(xhr.responseText)["error"]["code"]=="context_length_exceeded") {
            est_token_limit = [...JSON.parse(xhr.responseText)["error"]["message"].matchAll(/\d+/g)]
            keep_n = Math.floor((est_token_limit[0] - max_tokens)/2);
            if (llm_messages.length==0) {
              console.log("ERROR: The prompt and its expected reply exceeds the token limit for this model.");
              LLM_text = "ERROR: The prompt and its expected reply exceeds the token limit for this model."
              output_to=0;
              behavior="stop"
              after_build(LLM_text)

            } else {
              console.log("ERROR: Over the course of this chat, you have reached the token limit for this model.");
              LLM_text = "ERROR: Over the course of this chat, you have reached the token limit for this model."
              output_to=0;
              behavior="stop"
              after_build(LLM_text)

            }
          } else if ((output_type==1) & (json_mode==1) & (JSON.parse(xhr.responseText)["error"]["message"].includes("response_format"))) {
            console.log("Removing json flag, trying again...")
            json_mode = 2;
            openai_call(prompt_text);
          } else {
            LLM_text = `There was an ERROR calling the LLM. Make sure you are using a valid endpoint, API Key, and model. You can edit these after clicking the "Templates & Settings" button below.`
            output_to=0;
            behavior="stop"
            //LLM_text += "\n"+error            
            after_build(LLM_text);
            //FOR EXPORT: document.getElementById('restartButton').style.display='none';
            //FOR EXPORT: document.getElementById('credentials').style.display='block';
            //FOR EXPORT: document.getElementById('api_base').value = localStorage.api_base || "https://api.openai.com/v1/chat/completions";
            //FOR EXPORT: document.getElementById('api_key').value = localStorage.api_key || "";
            //FOR EXPORT: document.getElementById('api_key').focus();
          }            
        } catch (error) {
          LLM_text = `There was an ERROR calling the LLM. Make sure you are using a valid endpoint, API Key, and model. You can edit these after clicking the "Templates & Settings" button below.`
          output_to=0;
          behavior="stop"
          //LLM_text += "\n"+error            
          after_build(LLM_text)
          //FOR EXPORT: document.getElementById('restartButton').style.display='none';
          //FOR EXPORT: document.getElementById('credentials').style.display='block';
          //FOR EXPORT: document.getElementById('api_base').value = localStorage.api_base || "https://api.openai.com/v1/chat/completions";
          //FOR EXPORT: document.getElementById('api_key').value = localStorage.api_key || "";
          //FOR EXPORT: document.getElementById('api_key').focus();
      }
      }
    }};

    if (behavior!="chat") { 
      llm_messages = []  
    }

    llm_messages.push({"role": "user", "content": prompt_text})
    var data = {
              "model": model, 
              "messages": llm_messages,
              "temperature": temperature,
              "max_tokens": max_tokens
            };

  if (json_mode==1) {
    console.log("Attempting JSON mode");
    data["response_format"]={ "type": "json_object" }  
  }

  console.log(data);

  return xhr.send(JSON.stringify(data));    
  
}


function accountForHTML(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function insert_restart(){
  document.getElementById('restartButton').style.display='block';
  document.getElementById("restartButton").focus(); 
}

function after_build(LLM_text,finish_reason="stop") {
  
  LLM_text_collection += LLM_text;

  // add line breaks for screen output
  LLM_text_formatted = accountForHTML(LLM_text);
  LLM_text_formatted = LLM_text_formatted.replaceAll(/```([^`]*)```\n?/g, "<pre class='code_wrapper'><code>$1</code></pre>");
  LLM_text_formatted = LLM_text_formatted.replaceAll(/`([^`]*)`/g, "<code>$1</code>");
  document.getElementById('thinking_box').style.display='none';

  // If not hidden
  if (output_to<4) {
    bubble+=1;
    document.getElementById('output_window').innerHTML += "<div class='text_wrap' id='text_"+bubble+"'><div class='output_text' style='white-space: pre-wrap;'>"+LLM_text_formatted+"</div></div>";
    scroll2Q("text_"+bubble);
  }

  // Check on json formatting
  if (json_mode>=1) {
    console.log("Attempting to parse JSON...")
    try {
      passThrough = JSON.parse(LLM_text_collection.trim());
      LLM_text_collection = JSON.stringify(passThrough, null, 2);        
    } catch (error) {
      alert("Warning: Output isn't JSON. Leaving as is! This may cause issues.")
      passThrough = LLM_text_collection;     
    }
  } else {
    passThrough = LLM_text_collection;
  }

  // Output location
  if (output_to==1) {
    document.getElementById('output_window').innerHTML += "<div class='msg_text'>above output copied to clipboard</div>";
    copy_to_clipboard(LLM_text_collection);
  } else if (output_to==2) {
    //FOR EXPORT: document.getElementById('scratch_pad').value += LLM_text_collection;
    document.getElementById('output_window').innerHTML += "<div class='msg_text'>above output appended to scratch pad</div>";
    localStorage.setItem('scratch_pad', localStorage.getItem('scratch_pad')+LLM_text); // used LLM_text, not LLM_text_collection because will have already been appended
  } else if (output_to==3) {
    //FOR EXPORT: document.getElementById('scratch_pad').value = LLM_text_collection;
    document.getElementById('output_window').innerHTML += "<div class='msg_text'>above output replaced scratch pad</div>";
    localStorage.setItem('scratch_pad', LLM_text_collection);
  } else if (output_to==5) {
    //document.getElementById('output_window').innerHTML += "<div class='msg_text'>above output copied to clipboard</div>";
    copy_to_clipboard(LLM_text_collection);
  } else if (output_to==6) {
    //FOR EXPORT: document.getElementById('scratch_pad').value += LLM_text_collection;
    //document.getElementById('output_window').innerHTML += "<div class='msg_text'>above output appended to scratch pad</div>";
    localStorage.setItem('scratch_pad', localStorage.getItem('scratch_pad')+LLM_text); // used LLM_text, not LLM_text_collection because will have already been appended
  } else if (output_to==7) {
    //FOR EXPORT: document.getElementById('scratch_pad').value = LLM_text_collection;
    //document.getElementById('output_window').innerHTML += "<div class='msg_text'>above output replaced scratch pad</div>";
    localStorage.setItem('scratch_pad', LLM_text_collection);
  } 
  
  // Behavior

  if (finish_reason=="length"){
    document.getElementById('continue_gen').style.display='block';
    calls=0;
    scroll2Q("text_"+bubble); 

  } else if (behavior=="stop") {
    // End
    //document.getElementById('output_window').innerHTML += "<div class='msg_text'>end</div>";
    calls=0;
    insert_restart();
    scroll2Q("text_"+bubble); 

  } else if (behavior=="chat") {
    // Continue chat
    //document.getElementById('output_window').innerHTML += "<div class='msg_text'>engage with the above</div>";
    document.getElementById('chat_text_input').style.display='block';
    document.getElementById('chat_user_input').focus();
    calls=0;
    scroll2Q("text_"+bubble); 

  } else if (behavior=="file") {
    // Save to file
    document.getElementById('output_window').innerHTML += "<div class='msg_text'>triggered save to file</div>";
    calls=0;
    insert_restart();
    scroll2Q("text_"+bubble); 
    saveTextAsFile(LLM_text_collection,"output.txt")

  } else if (behavior=="pass") {
    // passThrough
    if (passThrough["next"]){
      try {
        choose_prompt(passThrough["next"])        
      } catch (error) {
        alert('No matching prompt found for "'+passThrough["next"]+'." Defaulting to FULL STOP')
        //document.getElementById('output_window').innerHTML += "<div class='msg_text'>end</div>";          
        calls=0;
        insert_restart();
        scroll2Q("text_"+bubble); 
      }
    } else {
      alert('No value found for passThrough["next"] defaulting to FULL STOP')
      //document.getElementById('output_window').innerHTML += "<div class='msg_text'>end</div>";
      calls=0;
      insert_restart();
      scroll2Q("text_"+bubble); 
    }

  } else {
    // Run another prompt
    choose_prompt(behavior)

  }

}
