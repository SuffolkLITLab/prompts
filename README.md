# LIT Prompts

This is a branch of the main project which can be found at: https://github.com/SuffolkLITLab/prompts 

This branch contains the code for the Chrome variant of the the extension. The main branch contains the code for the FireFox Add-on.

The two differ in the following ways. 

## manifest.js

This branch does not have include `"browser_specific_settings"`. It uses 

```
  "background": {
    "service_worker": "js/background.js",
    "type": "module"
  },
``` 

instead of 

```
  "background": {
    "scripts": ["js/background.js"]
  },
``` 

It also includes `tabs` under `"permissions"` 

## get_selection.js 

Renamed the `getSelection` function to `getSelectionFromPage` to avoid conflict with `window.getSelection()`

## popup_exported.js

Renamed the `getSelection` function to `getSelectionFromPage` for consistency. See above.

## popup.css

This branch uses 

```
	#main_wrapper{
		width:650px !important;
		margin: 0px auto;
	}
```

instead of 

```
	#main_wrapper{
		float:left;
		width:100%;
		min-height: 135px;
		overflow-y: on;
	}

```

## options.css

This branch includes

```
  body {
    font-family: georgia, 'times new roman', times, serif; 
    box-sizing: border-box;
    font-size: 15px;
    line-height: 22px;        
  }
```

## README.md

And of course this file contains a diff log, not a description of the project.  