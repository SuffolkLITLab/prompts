var lastSettingsSelection = '';

function readLiveSettingsSelection() {
    var selected = '';
    try {
        selected = window.getSelection ? window.getSelection().toString() : '';
    } catch (error) {}

    if (!selected) {
        var focused = document.activeElement;
        if (focused && /^(textarea|input)$/i.test(focused.tagName || '') &&
            typeof focused.selectionStart === 'number' && typeof focused.selectionEnd === 'number') {
            selected = String(focused.value || '').substring(focused.selectionStart, focused.selectionEnd);
        }
    }
    return selected || '';
}

function selectedTextFromSettingsPage() {
    var selected = readLiveSettingsSelection();
    // After the toolbar popup takes focus, document.activeElement may already be
    // <body>, which makes textarea/input selections invisible to a fresh read.
    // Preserve the most recent in-page selection across that focus transition.
    if (!selected && typeof document.hasFocus === 'function' && !document.hasFocus()) {
        selected = lastSettingsSelection;
    }
    return selected || '';
}

function rememberSettingsSelection() {
    if (typeof document.hasFocus === 'function' && !document.hasFocus()) return;
    lastSettingsSelection = readLiveSettingsSelection();
}

// Keep a synchronous selection cache while Settings owns focus. This matters for
// textarea/input selections because browsers can clear activeElement before the
// popup's runtime message arrives. Collapsing/changing the selection in-page also
// updates the cache, so an old selection does not leak into a later invocation.
['selectionchange', 'select', 'mouseup', 'keyup', 'click', 'input', 'focusin'].forEach(function(eventName) {
    document.addEventListener(eventName, rememberSettingsSelection, true);
});

function syncSettingsPageContext() {
    var body = document.body;
    return setOptionsPageContext({
        highlighted: selectedTextFromSettingsPage(),
        innerText: body ? body.innerText : '',
        innerHTML: body ? body.innerHTML : ''
    });
}

// Prefer a live request from the popup over blur timing. The toolbar popup can
// begin executing before the active extension page's blur handler has finished,
// so expose the current selection/text/HTML directly from this page.
var litContextTabId = null;
if (typeof LitPlatform !== 'undefined') {
    if (typeof LitPlatform.getCurrentTab === 'function') {
        LitPlatform.getCurrentTab().then(function(tab) {
            if (tab && typeof tab.id !== 'undefined') litContextTabId = tab.id;
        }).catch(function() {});
    }
    LitPlatform.addMessageListener(function(request, sender, sendResponse) {
        if (!request || request.litContextRequest !== 'options') return;
        if (request.activeTabId != null && litContextTabId != null && String(request.activeTabId) !== String(litContextTabId)) return false;
        if (request.activeTabId != null && litContextTabId == null) return false;
        var context = syncSettingsPageContext();
        if (typeof sendResponse === 'function') sendResponse(context);
        return false;
    });
}

// Capture the final live DOM/selection synchronously as focus moves from the
// Templates & Settings tab to the browser toolbar popup. Initial and page-hide
// snapshots provide sensible fallbacks if no blur occurs.
window.addEventListener('blur', syncSettingsPageContext);
window.addEventListener('pagehide', syncSettingsPageContext);
document.addEventListener('DOMContentLoaded', function() {
    syncSettingsPageContext();
});

async function getJavaScriptPermissionState(requestPermission = false) {
    if (typeof LitPlatform === 'undefined') {
        return { ready: false, executable: false, reason: 'unsupported', canRequestPermission: false, message: 'JavaScript templates are unavailable in this context.' };
    }

    const state = await LitPlatform.getJavaScriptTemplateSupport({ requestPermission });
    return Object.assign({}, state, { executable: !!state.ready, granted: !!state.permissionGranted });
}

function describeJavaScriptBrowserSupport(state) {
    const family = state && state.family;
    if (family === 'firefox') {
        return "Firefox detected. JavaScript templates use Firefox\'s optional userScripts permission; this page can request that permission when needed.";
    }
    if (family === 'chromium') {
        return "Chrome/Chromium detected. JavaScript templates use Chrome\'s browser-level user-script setting; enable it in the extension\'s Details page when needed, then recheck here.";
    }
    if (family === 'standalone') {
        return 'Standalone HTML detected. JavaScript templates require the installed browser extension.';
    }
    return 'Browser support is detected at runtime so the same Templates & Settings code is used in Firefox and Chrome.';
}

async function refreshJavaScriptPermissionStatus() {
    const status = document.getElementById('javascript_permission_status');
    const browserSupport = document.getElementById('javascript_browser_support');
    const button = document.getElementById('enable_javascript_templates');
    if (!status || !button) return;

    const state = await getJavaScriptPermissionState(false);
    status.textContent = state.message;
    if (browserSupport) browserSupport.textContent = describeJavaScriptBrowserSupport(state);

    if (state.executable) {
        button.textContent = 'JavaScript Templates Enabled';
        button.disabled = true;
    } else if (state.canRequestPermission) {
        // Firefox reaches this state before the optional userScripts permission
        // has been granted. Keep the permission request attached directly to the
        // button click so transient user activation is not lost.
        button.textContent = 'Enable JavaScript Templates';
        button.disabled = false;
    } else if (state.reason === 'version' || state.reason === 'manifest_permission' || state.reason === 'standalone' || state.reason === 'unsupported') {
        button.textContent = 'JavaScript Templates Unavailable';
        button.disabled = true;
    } else {
        // Chrome's browser-level user-script toggle cannot be changed by the
        // extension. Let the user change it in Chrome's extension Details page
        // and then re-check without reloading the whole Settings page.
        button.textContent = 'Recheck JavaScript Status';
        button.disabled = false;
    }
}

async function requestJavaScriptPermission() {
    // Keep the permission request directly attached to the user's click/change
    // gesture. In Firefox, awaiting a separate permission-state check first can
    // consume transient user activation before permissions.request() runs.
    const state = await getJavaScriptPermissionState(true);
    await refreshJavaScriptPermissionStatus();
    return !!state.ready;
}


function promptField(promptListing, fieldName) {
    return promptListing ? promptListing.querySelector('[data-field="' + fieldName + '"]') : null;
}

function currentPromptNames() {
    const names = new Set();
    try {
        Object.keys(JSON.parse(localStorage.getItem('templates') || '{}')).forEach(function(name) {
            if (name && name.trim()) names.add(name.trim());
        });
    } catch (error) {}
    const promptList = document.getElementById('prompt_list');
    if (promptList) {
        Array.from(promptList.children).forEach(function(listing) {
            const input = promptField(listing, 'prompt_name');
            const name = input ? input.value.trim() : '';
            if (name) names.add(name);
        });
    }
    return Array.from(names);
}

function validatePromptNames(showMessage) {
    const promptList = document.getElementById('prompt_list');
    const status = document.getElementById('prompt_validation_status');
    if (!promptList) return true;
    const seen = new Set();
    let message = '';
    Array.from(promptList.children).forEach(function(listing) {
        const input = promptField(listing, 'prompt_name');
        if (!input) return;
        input.classList.remove('invalid-field');
        const name = input.value.trim();
        if (!name && !message) message = 'Template names cannot be blank.';
        if (name && seen.has(name) && !message) message = 'Template names must be unique. Duplicate: ' + name;
        if (!name || seen.has(name)) input.classList.add('invalid-field');
        if (name) seen.add(name);
    });
    if (status) status.textContent = message;
    if (message && showMessage) alert(message);
    return !message;
}

function updateInboundBehaviorReferences(oldName, newName) {
    if (!oldName || oldName === newName) return;
    document.querySelectorAll('#prompt_list [data-field="behavior"]').forEach(function(select) {
        if (select.value !== oldName) return;
        const option = Array.from(select.options).find(function(item) { return item.value === oldName; });
        if (option) { option.value = newName; option.textContent = newName; }
        select.value = newName;
        select.dataset.savedValue = newName;
    });
}

function handlePromptRename(input) {
    const listing = input.closest('.prompt_listing');
    const oldName = listing ? (listing.dataset.originalName || '') : '';
    const newName = input.value.trim();
    const duplicate = Array.from(document.querySelectorAll('#prompt_list [data-field="prompt_name"]')).some(function(other) {
        return other !== input && other.value.trim() === newName;
    });
    if (!newName || duplicate) {
        alert(!newName ? 'Template names cannot be blank.' : 'A template named "' + newName + '" already exists. Template names must be unique.');
        input.value = oldName || newName || 'Untitled Template';
        validatePromptNames(false);
        return false;
    }
    updateInboundBehaviorReferences(oldName, newName);
    if (listing) listing.dataset.originalName = newName;
    saveChanges();
    updateAllPostTemplateBehaviorOptions();
    return true;
}

function validPromptImport(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    return Object.keys(value).every(function(name) {
        const template = value[name];
        return !!name.trim() && template && typeof template === 'object' && !Array.isArray(template) && typeof template.prompt === 'string';
    });
}

function displayExtensionVersion() {
    const target = document.getElementById('version');
    if (!target) return;
    try {
        const api = (typeof browser !== 'undefined' && browser.runtime) ? browser : ((typeof chrome !== 'undefined' && chrome.runtime) ? chrome : null);
        if (api && api.runtime && api.runtime.getManifest) {
            target.textContent = 'v ' + api.runtime.getManifest().version;
        }
    } catch (error) {}
}

document.addEventListener('DOMContentLoaded', function() {
    const apiBaseInput = document.getElementById('api_base');
    const timeoutInput = document.getElementById('request_timeout_seconds');
    displayExtensionVersion();
    if (timeoutInput) {
        const storedTimeout = parseInt(localStorage.getItem('request_timeout_seconds') || '120', 10);
        timeoutInput.value = Number.isFinite(storedTimeout) ? Math.min(600, Math.max(5, storedTimeout)) : 120;
        timeoutInput.addEventListener('change', function() {
            const value = Math.min(600, Math.max(5, parseInt(this.value || '120', 10) || 120));
            this.value = value;
            localStorage.setItem('request_timeout_seconds', String(value));
        });
    }

    // One-time migration from the historical single-key setting. From here on,
    // API keys have exactly one source of truth: the endpoint-key registry.
    migrate_legacy_api_key_to_registry();
    apiBaseInput.value = normalize_api_endpoint(localStorage.getItem('api_base')) || get_default_api_endpoint();
    ensure_api_key_entry(get_default_api_endpoint());

    // Load and save the user-configurable default model.
    var default_model = localStorage.getItem('default_model');
    document.getElementById('default_model').value = (default_model && default_model.trim()) ? default_model.trim() : get_default_model();
    document.getElementById('default_model').addEventListener('input', function() {
        const value = this.value.trim();
        if (value) {
            localStorage.setItem('default_model', value);
        } else {
            localStorage.removeItem('default_model');
        }
        localStorage.setItem('default_templates', JSON.stringify(default_prompts_for_model(get_default_model())));
        updateEndpointCapabilities();
    });

    // Input updates capabilities immediately; change commits the new routing
    // default. The old endpoint/key entry stays in the registry and becomes
    // removable only when no prompt references it.
    apiBaseInput.addEventListener('input', function() {
        updateEndpointCapabilities();
    });
    apiBaseInput.addEventListener('change', function() {
        const entered = normalize_api_endpoint(this.value);
        if (entered) localStorage.setItem('api_base', entered);
        else localStorage.removeItem('api_base');

        ensure_api_key_entry(get_default_api_endpoint());
        updateEndpointCapabilities();
        renderEndpointKeyRegistry();
    });
    updateEndpointCapabilities();
    renderEndpointKeyRegistry();

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

    async function export_page(mode=0) {
        const keyRegistry = apiKeysNeededForCurrentPrompts();
        const credentialBundle = { apiKeys: keyRegistry };
        const hasAnyKey = Object.keys(keyRegistry).some(function(endpoint) { return String(keyRegistry[endpoint] || '').trim() !== ''; });
        let password = "";
        let encryptedKey = null;

        if (hasAnyKey) {
            const enteredPassword = window.prompt("Optional: enter a password to encrypt all API keys embedded in the exported HTML. Leave blank to embed the keys without password protection. Choose Cancel to abort the export.");
            if (enteredPassword === null) return;
            password = enteredPassword;
            if (password !== "") {
                encryptedKey = await encryptData(JSON.stringify(credentialBundle), password);
                if (!encryptedKey) {
                    alert("API-key encryption failed; the export was not created.");
                    return;
                }
            }
        }

        const html = (mode === 1)
            ? build_export_w_scrtach(encryptedKey, password)
            : build_export(encryptedKey, password);
        saveTextAsFile(
            html,
            timestampedDownloadFilename(
                mode === 1 ? "interactions_w_scratch_" : "interactions_",
                "html",
                new Date()
            )
        );
    }

    // Do something when a button is clicked
    var exportPrompts = document.getElementById('prompt2page');
    exportPrompts.addEventListener('click', function() {
        export_page(0)
    });

    // Do something when a button is clicked
    var exportSratchPrompts = document.getElementById('scratch_prompt2page');
    exportSratchPrompts.addEventListener('click', function() {
        export_page(1)
    });

    // Download prompts as timestamped JSON.
    var downloadPrompts = document.getElementById('downloadPrompts');
    downloadPrompts.addEventListener('click', function() {
        saveTextAsFile(
            JSON.stringify(JSON.parse(localStorage.templates), null, 2),
            timestampedDownloadFilename("lit_prompts_", "json", new Date())
        );
    });

    // delete prompts
    var deletePrompts = document.getElementById('deletePrompts');
    document.getElementById('deletePrompts').addEventListener('click', function() {
        if (confirm('This will delete the current prompts. Choose "OK" to continue or "Cancel" to keep things as they are.') == true) {
            localStorage.setItem('templates', "{}"); // Set to ""
            loadPrompts(); // Reload the prompts from localStorage
        }
    });

    // Restore default prompts
    var restoreDefaults = document.getElementById('restoreDefaults');
    document.getElementById('restoreDefaults').addEventListener('click', function() {
        if (confirm('This will replace your current prompts with the default values. Choose "OK" to continue or "Cancel" to keep things as they are.') == true) {
            localStorage.setItem('templates', localStorage.default_templates); // Set to default prompts
            loadPrompts(); // Reload the prompts from localStorage
        }
    });

    // Upload/merge prompts from a file. Existing templates are preserved; imported
    // templates are appended in file order. Name collisions are resolved by adding
    // a numeric suffix, and imported chains are rewritten to follow the renamed
    // imported target rather than accidentally jumping to an existing template.
    var uploadPrompts = document.getElementById('uploadPrompts');
    uploadPrompts.addEventListener('click', function() {
        // Commit any currently edited values before merging the file into storage.
        // If the editor already contains an invalid duplicate/blank name, avoid
        // importing into an ambiguous state and let the user fix that first.
        if (!saveChanges()) {
            alert('Resolve the template-name issue shown on this page before uploading another prompt file.');
            return;
        }
        document.getElementById('fileInput').click();
    });
    document.getElementById('fileInput').addEventListener('change', function(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = function(e) {
            const contents = e.target.result;
            try {
                const json = JSON.parse(contents);
                if (!validPromptImport(json)) throw new Error('The file does not contain a valid LIT Prompts template object.');
                const result = mergePromptsFromJson(json);
                event.target.value = '';

                if (result.renamed.length) {
                    const lines = result.renamed.map(function(item) {
                        return '• ' + item.from + ' → ' + item.to;
                    });
                    alert(
                        'Imported ' + result.importedCount + ' template' + (result.importedCount === 1 ? '' : 's') + '.\n\n' +
                        'The following duplicate names were renamed so your existing templates were not overwritten:\n' +
                        lines.join('\n')
                    );
                }
            } catch (error) {
                console.error("Error reading file: ", error);
                alert('Unable to import prompts: ' + (error && error.message ? error.message : 'invalid JSON file.'));
                event.target.value = '';
            }
        };
        reader.readAsText(file);
    });

    const forceDefaultEndpoint = document.getElementById('forceDefaultEndpoint');
    if (forceDefaultEndpoint) {
        forceDefaultEndpoint.addEventListener('click', function() {
            const defaultEndpoint = normalize_api_endpoint(apiBaseInput.value) || get_default_api_endpoint();
            if (!defaultEndpoint) {
                alert('Define a Default API Endpoint before forcing it onto all prompts.');
                return;
            }
            if (confirm('This will overwrite the Endpoint value on every prompt with the current Default API Endpoint. Choose "OK" to continue or "Cancel" to keep existing prompt endpoints.') == true) {
                document.querySelectorAll('#prompt_list input[data-field="endpoint"]').forEach(function(input) { input.value = defaultEndpoint; });
                saveChanges();
                updateEndpointCapabilities();
                renderEndpointKeyRegistry();
            }
        });
    }

    const forceDefaultModel = document.getElementById('forceDefaultModel');
    if (forceDefaultModel) {
        forceDefaultModel.addEventListener('click', function() {
            const defaultModel = (document.getElementById('default_model').value || '').trim() || get_default_model();
            if (confirm('This will overwrite the Model value on every prompt with the current Default Model ("' + defaultModel + '"). Choose "OK" to continue or "Cancel" to keep existing prompt models.') == true) {
                document.querySelectorAll('#prompt_list input[data-field="model"]').forEach(function(input) { input.value = defaultModel; });
                saveChanges();
                updateEndpointCapabilities();
            }
        });
    }

    const enableJavaScriptButton = document.getElementById('enable_javascript_templates');
    if (enableJavaScriptButton) {
        enableJavaScriptButton.addEventListener('click', function() {
            requestJavaScriptPermission();
        });
        refreshJavaScriptPermissionStatus();
    }

});

function explicitPromptEndpoints() {
    const endpoints = new Set();
    const promptList = document.getElementById('prompt_list');
    if (promptList && promptList.children.length) {
        for (const promptListing of promptList.children) {
            const input = promptListing.querySelector('[data-field="endpoint"]');
            const endpoint = normalize_api_endpoint(input ? input.value : '');
            if (endpoint) endpoints.add(endpoint);
        }
        return endpoints;
    }

    try {
        const templates = JSON.parse(localStorage.getItem('templates') || '{}');
        Object.keys(templates || {}).forEach(function(name) {
            const endpoint = normalize_api_endpoint((templates[name] || {}).endpoint);
            if (endpoint) endpoints.add(endpoint);
        });
    } catch (error) {
        console.error('Unable to inspect prompt endpoints:', error);
    }
    return endpoints;
}

function apiKeysNeededForCurrentPrompts() {
    const registry = get_api_key_registry();
    const needed = {};
    const defaultEndpoint = normalize_api_endpoint((document.getElementById('api_base') || {}).value) || get_default_api_endpoint();
    if (defaultEndpoint) needed[defaultEndpoint] = registry[defaultEndpoint] || '';
    explicitPromptEndpoints().forEach(function(endpoint) {
        needed[endpoint] = registry[endpoint] || '';
    });
    return needed;
}

function renderEndpointKeyRegistry() {
    const container = document.getElementById('endpoint_key_registry');
    if (!container) return;

    const defaultEndpoint = normalize_api_endpoint((document.getElementById('api_base') || {}).value) || get_default_api_endpoint();
    const referenced = explicitPromptEndpoints();
    let registry = get_api_key_registry();

    referenced.forEach(function(endpoint) {
        if (!Object.prototype.hasOwnProperty.call(registry, endpoint)) registry[endpoint] = '';
    });
    if (defaultEndpoint && !Object.prototype.hasOwnProperty.call(registry, defaultEndpoint)) {
        registry[defaultEndpoint] = '';
    }
    registry = save_api_key_registry(registry);

    container.innerHTML = '';
    const endpoints = Object.keys(registry).sort(function(a, b) {
        if (a === defaultEndpoint) return -1;
        if (b === defaultEndpoint) return 1;
        return a.localeCompare(b);
    });

    endpoints.forEach(function(endpoint) {
        const row = document.createElement('div');
        row.className = 'endpoint-key-row';

        const label = document.createElement('label');
        label.className = 'endpoint-key-endpoint';
        label.textContent = endpoint + (endpoint === defaultEndpoint ? ' (Default)' : '');
        label.title = endpoint;

        const input = document.createElement('input');
        input.type = 'password';
        input.className = 'endpoint-key-input';
        input.setAttribute('aria-label', 'API key for ' + endpoint);
        input.value = registry[endpoint] || '';
        input.addEventListener('input', function() {
            remember_api_key_for_endpoint(endpoint, this.value);
        });

        row.appendChild(label);
        row.appendChild(input);

        if (endpoint !== defaultEndpoint && !referenced.has(endpoint)) {
            const remove = document.createElement('button');
            remove.type = 'button';
            remove.className = 'endpoint-key-remove';
            remove.textContent = '×';
            remove.title = 'Remove saved endpoint/key entry';
            remove.setAttribute('aria-label', 'Remove saved API key entry for ' + endpoint);
            remove.addEventListener('click', function() {
                const current = get_api_key_registry();
                delete current[endpoint];
                save_api_key_registry(current);
                renderEndpointKeyRegistry();
            });
            row.appendChild(remove);
        }

        container.appendChild(row);
    });
}

function nextAvailablePromptName(baseName, usedNames) {
    const base = String(baseName || '').trim();
    if (!usedNames.has(base)) return base;
    let suffix = 2;
    let candidate = base + ' ' + suffix;
    while (usedNames.has(candidate)) {
        suffix += 1;
        candidate = base + ' ' + suffix;
    }
    return candidate;
}

function normalizeImportedPromptTemplate(sourceTemplate) {
    const template = Object.assign({}, sourceTemplate || {});

    // Endpoint/model inheritance is resolved only when a prompt runs. Importing a
    // prompt must never materialize the current defaults into the prompt itself;
    // otherwise a portable prompt file silently becomes pinned to whichever
    // defaults happened to be configured on the importing browser.
    template.endpoint = (template.endpoint == null || String(template.endpoint).trim() === '')
        ? ''
        : String(template.endpoint).trim();
    template.model = (template.model == null || String(template.model).trim() === '')
        ? ''
        : String(template.model).trim();

    return template;
}

function mergePromptObjects(existing, incoming) {
    const merged = {};
    const usedNames = new Set();
    const renamed = [];
    const importedNameMap = {};
    const incomingNames = Object.keys(incoming || {});
    const existingNames = new Set(Object.keys(existing || {}));

    Object.keys(existing || {}).forEach(function(name) {
        merged[name] = existing[name];
        usedNames.add(name);
    });

    // Preserve every incoming name that does not collide with the existing set.
    // Reserve those names before assigning numeric suffixes so importing both
    // "Example" and "Example 2" into a set that already has "Example" keeps
    // "Example 2" intact and renames only the true collision (to "Example 3").
    incomingNames.forEach(function(originalName) {
        if (!existingNames.has(originalName)) usedNames.add(originalName);
    });

    // Build the complete old->new map before copying templates so self-references
    // and forward Post-run Behavior chains can be rewritten consistently.
    incomingNames.forEach(function(originalName) {
        let finalName = originalName;
        if (existingNames.has(originalName)) {
            finalName = nextAvailablePromptName(originalName, usedNames);
            usedNames.add(finalName);
        }
        importedNameMap[originalName] = finalName;
        if (finalName !== originalName) renamed.push({ from: originalName, to: finalName });
    });

    incomingNames.forEach(function(originalName) {
        const finalName = importedNameMap[originalName];
        const sourceTemplate = incoming[originalName] || {};
        const template = normalizeImportedPromptTemplate(sourceTemplate);
        if (typeof template.behavior === 'string' && Object.prototype.hasOwnProperty.call(importedNameMap, template.behavior)) {
            template.behavior = importedNameMap[template.behavior];
        }
        merged[finalName] = template;
    });

    return {
        templates: merged,
        renamed: renamed,
        importedCount: Object.keys(incoming || {}).length,
        importedNameMap: importedNameMap
    };
}

function mergePromptsFromJson(json) {
    if (!validPromptImport(json)) throw new Error('Invalid prompt file structure.');
    let existing = {};
    try {
        existing = JSON.parse(localStorage.getItem('templates') || '{}');
        if (!existing || typeof existing !== 'object' || Array.isArray(existing)) existing = {};
    } catch (error) {
        existing = {};
    }

    const result = mergePromptObjects(existing, json);
    localStorage.setItem('templates', JSON.stringify(result.templates));
    loadPrompts();
    applyPromptFilter();
    return result;
}

// Historical helper retained for any callers that intentionally replace the full
// prompt set (for example restore-default flows). Upload no longer uses it.
function updatePromptsFromJson(json) {
    if (!validPromptImport(json)) throw new Error('Invalid prompt file structure.');
    localStorage.setItem('templates', JSON.stringify(json));
    loadPrompts();
    applyPromptFilter();
}

function promptFilterHaystack(listing) {
    if (!listing) return '';
    const fields = ['prompt_name', 'prompt', 'model', 'endpoint'];
    return fields.map(function(fieldName) {
        const field = promptField(listing, fieldName);
        return field && typeof field.value !== 'undefined' ? String(field.value) : '';
    }).join('\n').toLocaleLowerCase();
}

function applyPromptFilter() {
    const filterInput = document.getElementById('prompt_filter');
    const status = document.getElementById('prompt_filter_status');
    const promptList = document.getElementById('prompt_list');
    if (!promptList) return;

    const query = filterInput ? String(filterInput.value || '').trim().toLocaleLowerCase() : '';
    const listings = Array.from(promptList.querySelectorAll('.prompt_listing'));
    let visible = 0;
    listings.forEach(function(listing) {
        const matches = !query || promptFilterHaystack(listing).includes(query);
        listing.hidden = !matches;
        if (matches) visible += 1;
    });

    if (status) {
        status.textContent = query
            ? 'Showing ' + visible + ' of ' + listings.length + ' templates.'
            : listings.length + ' template' + (listings.length === 1 ? '' : 's') + '.';
    }
}

function clearPromptFilter() {
    const filterInput = document.getElementById('prompt_filter');
    if (filterInput) {
        filterInput.value = '';
        filterInput.focus();
    }
    applyPromptFilter();
}

// Function to load saved values from localStorage
function loadPrompts() {

    try {
        localStorageData = JSON.parse(localStorage.getItem('templates') || '{}');
        if (!localStorageData || typeof localStorageData !== 'object' || Array.isArray(localStorageData)) localStorageData = {};
    } catch (error) {
        console.error('Unable to load templates:', error);
        localStorageData = {};
        alert('Saved templates could not be read. Open a backup prompt file or restore defaults.');
    }

    const promptList = document.getElementById('prompt_list');
    promptList.innerHTML = '';

    for (const key in localStorageData) {
        if (localStorageData.hasOwnProperty(key)) {
            const template = localStorageData[key];

            // Pass the stored behavior value to createPromptElement
            const newPromptId = createPromptElement(key, template, template.behavior);
            updateJsonMode(newPromptId);
            updateJsonSchemaVisibility(newPromptId);
        }
    }
    
    updateEndpointCapabilities();
    renderEndpointKeyRegistry();
    applyPromptFilter();

    // Attach input change event listeners to all input elements
}

//
// Working with the prompt List 
//

function getPromptNames() {
    return currentPromptNames();
}

function updatePostTemplateBehaviorOptions(promptId) {
    const promptListing = document.getElementById(promptId);
    if (!promptListing) return;
    const select = promptField(promptListing, 'behavior');
    if (!select) return;
    const currentValue = Object.prototype.hasOwnProperty.call(select.dataset, 'savedValue') ? select.dataset.savedValue : (select.value || 'stop');
    delete select.dataset.savedValue;
    const promptNames = currentPromptNames();
    const builtIns = [
        ['stop', 'FULL STOP'],
        ['file', 'SAVE TO FILE'],
        ['pass', 'DYNAMIC'],
        ['chat', 'CHAT'],
        ['close', 'CLOSE POP-UP']
    ];
    select.innerHTML = '';
    builtIns.forEach(function(pair) {
        const option = document.createElement('option');
        option.value = pair[0];
        option.textContent = pair[1];
        select.appendChild(option);
    });
    promptNames.forEach(function(name) {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = name;
        select.appendChild(option);
    });
    const hasValue = Array.from(select.options).some(function(option) { return option.value === currentValue; });
    select.value = hasValue ? currentValue : 'stop';
    select.dataset.savedValue = select.value;
}

// Function to create a new prompt element
function createPromptElement(promptName, template, selectedBehavior) {
    const promptList = document.getElementById('prompt_list');
    const promptId = `prompt_listing_${promptList.childElementCount + 1}`;
    
    const promptListing = document.createElement('div');
    promptListing.id = promptId;
    promptListing.className = 'prompt_listing';
    promptListing.dataset.originalName = promptName;
    
    const promptNameInput = document.createElement('input');
    promptNameInput.id = 'prompt_name_' + promptId;
    promptNameInput.setAttribute('data-field', 'prompt_name');
    promptNameInput.className = 'prompt_name';
    promptNameInput.setAttribute('data-prompt', promptId);
    promptNameInput.value = promptName;
    promptNameInput.setAttribute('aria-label', 'Template name');
    
    const moveUpButton = document.createElement('button');
    moveUpButton.id = 'up_' + promptId;
    moveUpButton.setAttribute('data-prompt', promptId);
    moveUpButton.textContent = 'Move Up';
    moveUpButton.setAttribute('aria-label', 'Move ' + promptName + ' up');
    moveUpButton.className = 'move';
    moveUpButton.addEventListener('click', () => movePrompt(promptId, -1));

    const moveDownButton = document.createElement('button');
    moveDownButton.id = 'down_' + promptId;
    moveDownButton.setAttribute('data-prompt', promptId);
    moveDownButton.textContent = 'Move Down';
    moveDownButton.setAttribute('aria-label', 'Move ' + promptName + ' down');
    moveDownButton.className = 'move';
    moveDownButton.addEventListener('click', () => movePrompt(promptId, 1));

    const makeFirstButton = document.createElement('button');
    makeFirstButton.id = 'make_first_' + promptId;
    makeFirstButton.setAttribute('data-prompt', promptId);
    makeFirstButton.textContent = 'First';
    makeFirstButton.setAttribute('aria-label', 'Move ' + promptName + ' to first');
    makeFirstButton.className = 'move';
    makeFirstButton.addEventListener('click', () => movePrompt(promptId, "first"));

    const makeLastButton = document.createElement('button');
    makeLastButton.id = 'make_last_' + promptId;
    makeLastButton.setAttribute('data-prompt', promptId);
    makeLastButton.textContent = 'Last';
    makeLastButton.setAttribute('aria-label', 'Move ' + promptName + ' to last');
    makeLastButton.className = 'move';
    makeLastButton.addEventListener('click', () => movePrompt(promptId, "last"));

    const deleteButton = document.createElement('button');
    deleteButton.id = 'delete_' + promptId;
    deleteButton.setAttribute('data-prompt', promptId);
    deleteButton.textContent = 'Delete';
    deleteButton.setAttribute('aria-label', 'Delete ' + promptName);
    deleteButton.className = 'delete_prompt';
    deleteButton.addEventListener('click', () => deletePrompt(promptId));   

    const promptTextarea = document.createElement('textarea');
    promptTextarea.id = 'prompt_' + promptId;
    promptTextarea.setAttribute('data-field', 'prompt');
    promptTextarea.className = 'prompt_text';
    promptTextarea.setAttribute('data-prompt', promptId);
    promptTextarea.value = template.prompt;
    promptTextarea.setAttribute('aria-label', 'Template prompt or JavaScript source for ' + promptName);

    const endpointInput = createParameterInput('Endpoint', 'endpoint', promptId, 'text', template.endpoint || '');
    const modelInput = createParameterInput('Model', 'model', promptId, 'text', template.model || '');
    const modelCapabilityStatus = document.createElement('div');
    modelCapabilityStatus.className = 'model-capability-status model-capability-row';
    modelCapabilityStatus.setAttribute('aria-live', 'polite');
    const temperatureValue = Object.prototype.hasOwnProperty.call(template, 'temperature') && template.temperature != null ? template.temperature : '';
    const maxTokensValue = Object.prototype.hasOwnProperty.call(template, 'max_tokens') && template.max_tokens != null ? template.max_tokens : '';
    const temperatureInput = createParameterInput('Temperature', 'temperature', promptId, 'number', temperatureValue);
    const maxTokensInput = createParameterInput('Max Output Tokens', 'max_tokens', promptId, 'number', maxTokensValue);
    const reasoningEffortInput = createAdvancedParameterSelect('Reasoning Effort', 'reasoning_effort', promptId, [
        ['', 'Auto'], ['none', 'None'], ['minimal', 'Minimal'], ['low', 'Low'], ['medium', 'Medium'], ['high', 'High'], ['xhigh', 'XHigh'], ['max', 'Max']
    ], template.reasoning_effort || '');
    const verbosityInput = createAdvancedParameterSelect('Verbosity', 'verbosity', promptId, [
        ['', 'Auto'], ['low', 'Low'], ['medium', 'Medium'], ['high', 'High']
    ], template.verbosity || '');
    const outputTypeInput = createParameterSelect('Output Type', 'output', promptId, ['Prompt', 'LLM', 'JavaScript'], Number(template.output));
    const normalizedJsonMode = (template.json_mode === true || template.json_mode === 1 || template.json_mode === '1') ? 1 : 0;
    const jsonModeInput = createParameterSelect('JSON', 'json_mode', promptId, ['No', 'Yes'], normalizedJsonMode);
    const jsonSchemaInput = createJsonSchemaInput(promptId, template.json_schema || '');
    const outputDestinationInput = createParameterSelect('Default Output', 'output_to', promptId, ['Screen only', 'Screen + clipboard', 'Screen + append to scratch pad', 'Screen + replace scratch pad','Hidden','Hidden + clipboard', 'Hidden + append to scratch pad', 'Hidden + replace scratch pad'], template.output_to);
    
    const postTemplateBehaviorInput = createParameterSelect('Post-run Behavior', 'behavior', promptId, getPromptNames(), selectedBehavior);
    postTemplateBehaviorInput.querySelector('[data-field="behavior"]').dataset.savedValue = (selectedBehavior == null || selectedBehavior === 0) ? 'stop' : String(selectedBehavior);

    const hideButtonsCheckbox = createParameterInput('Hide Button ', 'hide_button', promptId, 'checkbox', template.hide_button);
    const runInNewTabCheckbox = createParameterInput('Run in New Tab ', 'run_in_new_tab', promptId, 'checkbox', template.run_in_new_tab === true || template.run_in_new_tab === 1 || template.run_in_new_tab === '1');
    
    //promptNameInput.addEventListener('change', saveChanges);
    promptNameInput.addEventListener('change', function() {
        handlePromptRename(this);
    });
    promptTextarea.addEventListener('change', saveChanges);
    // Derived prompt-card UI is refreshed centrally by the delegated data-field
    // handlers below. Per-control listeners here only commit data or handle
    // side effects that are unique to that field.
    endpointInput.addEventListener('change', function() { saveChanges(); renderEndpointKeyRegistry(); });
    modelInput.addEventListener('change', saveChanges);
    temperatureInput.addEventListener('change', saveChanges);
    maxTokensInput.addEventListener('change', saveChanges);
    reasoningEffortInput.addEventListener('change', saveChanges);
    verbosityInput.addEventListener('change', saveChanges);
    outputTypeInput.addEventListener('change', saveChanges);
    jsonModeInput.addEventListener('change', saveChanges);
    jsonSchemaInput.querySelector('[data-field="json_schema"]').addEventListener('change', saveChanges);
    outputDestinationInput.addEventListener('change', saveChanges);
    postTemplateBehaviorInput.addEventListener('change', function() {
        const select = promptField(promptListing, 'behavior');
        if (select) select.dataset.savedValue = select.value;
        saveChanges();
    });
    hideButtonsCheckbox.addEventListener('change', function() {
        updateRunInNewTabState(promptId);
        saveChanges();
    });
    runInNewTabCheckbox.addEventListener('change', saveChanges);

    promptListing.appendChild(promptNameInput);
    promptListing.appendChild(moveUpButton);
    promptListing.appendChild(moveDownButton);
    promptListing.appendChild(makeFirstButton);
    promptListing.appendChild(makeLastButton);
    promptListing.appendChild(deleteButton);
    promptListing.appendChild(promptTextarea);
    promptListing.appendChild(modelCapabilityStatus);
    promptListing.appendChild(outputTypeInput);
    promptListing.appendChild(endpointInput);
    promptListing.appendChild(modelInput);
    promptListing.appendChild(temperatureInput);
    promptListing.appendChild(maxTokensInput);
    promptListing.appendChild(reasoningEffortInput);
    promptListing.appendChild(verbosityInput);
    promptListing.appendChild(jsonModeInput);
    promptListing.appendChild(jsonSchemaInput);
    promptListing.appendChild(outputDestinationInput);
    promptListing.appendChild(postTemplateBehaviorInput);
    promptListing.appendChild(hideButtonsCheckbox);
    promptListing.appendChild(runInNewTabCheckbox);
    
    promptList.appendChild(promptListing);

    updateJsonSchemaVisibility(promptId);
    updateRunInNewTabState(promptId);
    updatePostTemplateBehaviorOptions(promptId);


    // Return the ID of the created prompt element
    return promptId;
}

// Run in New Tab is meaningful only for visible buttons launched from the
// extension Home screen. Preserve the checked value while disabled so toggling
// Hide Button off restores the user's prior launch preference.
function updateRunInNewTabState(promptId) {
    const promptListing = document.getElementById(promptId);
    if (!promptListing) return;
    const hideInput = promptListing.querySelector('[data-field="hide_button"]');
    const runInput = promptListing.querySelector('[data-field="run_in_new_tab"]');
    if (!runInput) return;
    const hidden = !!(hideInput && hideInput.checked);
    runInput.disabled = hidden;
    const wrapper = runInput.closest('.parameter');
    if (wrapper) wrapper.classList.toggle('disabled-parameter', hidden);
    runInput.title = hidden
        ? 'Unavailable while Hide Button is enabled because Run in New Tab only applies to buttons launched from Home.'
        : 'When this visible template is launched from the extension Home screen, run it in a persistent interaction tab.';
}

// Return endpoint/model capabilities without making the rest of the settings UI
// depend directly on provider-specific request details.
function endpointCapabilitiesForPrompt(promptListing) {
    const defaultEndpoint = normalize_api_endpoint((document.getElementById('api_base') && document.getElementById('api_base').value)) || get_default_api_endpoint();
    const endpointInput = promptListing ? promptListing.querySelector('[data-field="endpoint"]') : null;
    const endpoint = normalize_api_endpoint(endpointInput ? endpointInput.value : '') || defaultEndpoint;
    const modelInput = promptListing ? promptListing.querySelector('[data-field="model"]') : null;
    const reasoningInput = promptListing ? promptListing.querySelector('[data-field="reasoning_effort"]') : null;
    const model = modelInput && modelInput.value.trim() ? modelInput.value.trim() : (typeof get_default_model === 'function' ? get_default_model() : '');
    const reasoningEffort = reasoningInput ? reasoningInput.value : '';

    if (typeof LitApiAdapters !== 'undefined' && LitApiAdapters.getCapabilities) {
        return LitApiAdapters.getCapabilities(endpoint, model, reasoningEffort);
    }
    return { protocolLabel: 'OpenAI-compatible Chat Completions', temperature: true, maxOutputTokens: true, json: true, reasoningEffort: false, verbosity: false, temperatureReason: '', advancedNote: '', modelCapabilityStatus: 'Generic compatible endpoint — conservative compatibility mode.' };
}

function updateEndpointCapabilities() {
    const promptList = document.getElementById('prompt_list');
    if (promptList) {
        for (const promptListing of promptList.children) {
            const outputSelect = promptListing.querySelector('[data-field="output"]');
            updateJsonMode(promptListing.id);
        }
    }

    const status = document.getElementById('api_protocol_status');
    if (status) {
        const defaultEndpoint = normalize_api_endpoint((document.getElementById('api_base') || {}).value) || get_default_api_endpoint();
        const defaultModel = (document.getElementById('default_model') || {}).value || get_default_model();
        const caps = (typeof LitApiAdapters !== 'undefined' && LitApiAdapters.getCapabilities) ? LitApiAdapters.getCapabilities(defaultEndpoint, defaultModel, '') : null;
        if (caps) {
            status.textContent = 'Default: ' + caps.protocolLabel + (caps.advancedNote ? ' — ' + caps.advancedNote : '');
            const modelStatus = document.getElementById('default_model_capability_status');
            if (modelStatus) modelStatus.textContent = 'Capabilities: ' + (caps.modelCapabilityStatus || 'Auto-detected from endpoint and model.');
        }
    }
}

// Update controls based on Output Type, endpoint protocol, and (for direct OpenAI)
// the selected model family. Old prompt values are preserved even when a control
// is disabled; the request adapter simply omits fields that do not apply.
function updateJsonMode(promptId) {
    const promptListing = document.getElementById(promptId);
    if (!promptListing) return;

    // Always read Output Type from the actual select in this prompt. Several
    // control factories return wrapper <div>s, so relying on a caller-supplied
    // `.value` can yield undefined and incorrectly disable all LLM fields.
    const outputSelect = promptListing.querySelector('[data-field="output"]');
    const outputValue = outputSelect ? String(outputSelect.value) : '1';
    const jsonModeSelect = promptListing.querySelector('[data-field="json_mode"]');
    const endpointInput = promptListing.querySelector('[data-field="endpoint"]');
    const modelInput = promptListing.querySelector('[data-field="model"]');
    const temperatureInput = promptListing.querySelector('[data-field="temperature"]');
    const maxTokensInput = promptListing.querySelector('[data-field="max_tokens"]');
    const reasoningInput = promptListing.querySelector('[data-field="reasoning_effort"]');
    const verbosityInput = promptListing.querySelector('[data-field="verbosity"]');
    const modelCapabilityStatus = promptListing.querySelector('.model-capability-status');
    const promptTextarea = promptListing.querySelector('[data-field="prompt"]');

    const isLlmType = outputValue === '1';
    const isJavaScriptType = outputValue === '2';
    const caps = endpointCapabilitiesForPrompt(promptListing);

    if (endpointInput) endpointInput.disabled = !isLlmType;
    modelInput.disabled = !isLlmType;
    temperatureInput.disabled = !isLlmType || !caps.temperature;
    maxTokensInput.disabled = !isLlmType || !caps.maxOutputTokens;
    jsonModeSelect.disabled = !isLlmType || !caps.json;
    if (reasoningInput) reasoningInput.disabled = !isLlmType || !caps.reasoningEffort;
    if (verbosityInput) verbosityInput.disabled = !isLlmType || !caps.verbosity;

    if (modelCapabilityStatus) {
        modelCapabilityStatus.textContent = isLlmType
            ? 'Capabilities: ' + (caps.modelCapabilityStatus || 'Auto-detected from endpoint and model.')
            : 'Capabilities: LLM controls are disabled for this Output Type.';
    }

    if (temperatureInput) {
        temperatureInput.min = Number.isFinite(Number(caps.temperatureMin)) ? caps.temperatureMin : 0;
        temperatureInput.max = Number.isFinite(Number(caps.temperatureMax)) ? caps.temperatureMax : 1;
        temperatureInput.title = caps.temperatureReason || ('Leave blank to use the provider/model default. This endpoint uses a temperature range of ' + temperatureInput.min + '-' + temperatureInput.max + '.');
    }

    if (promptTextarea) {
        promptTextarea.classList.toggle('javascript-code', isJavaScriptType);
        promptTextarea.placeholder = isJavaScriptType
            ? 'JavaScript source. Use real variables such as passThrough, scratch, highlighted, innerText, document, and window. Explicitly return a value.'
            : '';
    }

    updateJsonSchemaVisibility(promptId);
}

// Show the schema editor only when JSON mode is enabled for this prompt.
function updateJsonSchemaVisibility(promptId) {
    const promptListing = document.getElementById(promptId);
    if (!promptListing) return;

    const jsonModeSelect = promptListing.querySelector('[data-field="json_mode"]');
    const jsonSchemaWrapper = promptListing.querySelector('.json-schema-parameter');
    if (!jsonModeSelect || !jsonSchemaWrapper) return;

    const outputSelect = promptListing.querySelector('[data-field="output"]');
    const isLlmType = outputSelect && outputSelect.value === '1';
    const jsonAvailable = isLlmType && !jsonModeSelect.disabled;
    jsonSchemaWrapper.style.display = (jsonAvailable && jsonModeSelect.value === '1') ? 'block' : 'none';
}

// Create the JSON Schema textarea. Users enter the bare schema object; the
// request adapter wraps it in the structured-output format required by the selected endpoint.
function createJsonSchemaInput(dataPrompt, inputValue) {
    const parameterDiv = document.createElement('div');
    parameterDiv.className = 'json-schema-parameter';

    const labelRow = document.createElement('div');
    labelRow.className = 'json-schema-label';
    labelRow.appendChild(document.createTextNode('JSON Schema '));

    const questionMark = document.createElement('button');
    questionMark.type = 'button';
    questionMark.className = 'question';
    questionMark.textContent = '?';
    questionMark.setAttribute('aria-label', 'Help for JSON Schema');
    questionMark.addEventListener('click', () => alert('Enter a bare JSON Schema object (for example, an object with type, properties, and required). OpenAI-compatible endpoints receive response_format/json_schema. Endpoints ending in /messages receive Anthropic output_config.format. Leave it blank for schema-less JSON mode (best-effort on native Anthropic).'));
    labelRow.appendChild(questionMark);

    const textarea = document.createElement('textarea');
    textarea.id = 'json_schema_' + dataPrompt;
    textarea.setAttribute('data-field', 'json_schema');
    textarea.className = 'json-schema-text';
    textarea.setAttribute('data-prompt', dataPrompt);
    textarea.setAttribute('aria-label', 'JSON Schema');
    textarea.placeholder = `{
  "type": "object",
  "properties": {
    "answer": { "type": "string" }
  },
  "required": ["answer"]
}`;
    textarea.value = (typeof inputValue === 'string') ? inputValue : JSON.stringify(inputValue, null, 2);

    parameterDiv.appendChild(labelRow);
    parameterDiv.appendChild(textarea);
    return parameterDiv;
}

// Function to create parameter input elements
function createParameterInput(labelText, inputId, dataPrompt, inputType, inputValue) {
    const parameterDiv = document.createElement('div');
    parameterDiv.className = 'parameter';
    
    const label = document.createElement('label');
    label.textContent = labelText + ' ';
    
    const input = document.createElement('input');
    input.id = inputId + '_' + dataPrompt;
    input.setAttribute('data-field', inputId);
    input.setAttribute('data-prompt', dataPrompt);
    input.type = inputType;
    input.value = inputValue;
    label.htmlFor = input.id;
    let questionMark;

    // Assign class based on inputId
    switch(inputId) {
        case 'endpoint':
            input.className = 'input-endpoint';
            input.placeholder = 'Blank = Default API Endpoint';
            questionMark = document.createElement('span');
            questionMark.innerHTML = ` <button type="button" class="question" aria-label="Help for ${labelText}">?</button>`;
            questionMark.addEventListener('click', () => alert('Optional endpoint for this prompt. Leave blank to use the Default API Endpoint. API keys are stored separately by endpoint and are not written into prompt files.'));
            break;
        case 'model':
            input.className = 'input-model';
            input.placeholder = 'Blank = default model';
            questionMark = document.createElement('span');
            questionMark.innerHTML = ` <button type="button" class="question" aria-label="Help for Model">?</button>`;
            questionMark.addEventListener('click', () => alert('Optional model for this prompt. Leave blank to use the Default Model. Otherwise enter the model name expected by the selected endpoint (e.g. gpt-4o-mini, gemini-2.5-flash, or a model exposed by your local server).'));
            break;
        case 'temperature':
            input.step = (inputType === 'number') ? '0.01' : '1';
            input.className = 'input-temperature';
            input.min = 0;
            input.max = 1;
            questionMark = document.createElement('span');
            questionMark.innerHTML = ` <button type="button" class="question" aria-label="Help for Temperature">?</button>`;
            questionMark.addEventListener('click', () => alert('Optional sampling temperature. Leave blank for Auto/provider default. The allowed range is adjusted for the selected endpoint (for example, direct OpenAI uses 0-2). Reasoning models may not use temperature while reasoning is active.'));
            break;
        case 'max_tokens':
            input.step = (inputType === 'number') ? '1' : '1';
            input.className = 'input-max-tokens';
            input.min = 0;
            questionMark = document.createElement('span');
            questionMark.innerHTML = ` <button type="button" class="question" aria-label="Help for ${labelText}">?</button>`;
            questionMark.addEventListener('click', () => alert('Optional maximum output-token cap. LIT Prompting keeps the historical max_tokens field in prompt files, then translates it to max_output_tokens for Responses, max_completion_tokens for direct OpenAI reasoning models on Chat, or max_tokens for GPT-4-family/compatible/native APIs.'));
            break;
        case 'hide_button':
        case 'run_in_new_tab':
            input.className = inputId === 'hide_button' ? 'input-hide-button' : 'input-run-in-new-tab';
            input.type = 'checkbox';
            input.checked = !!inputValue;
            questionMark = document.createElement('span');
            questionMark.innerHTML = ` <button type="button" class="question" aria-label="Help for ${labelText}">?</button>`;
            if (inputId === 'hide_button') {
                questionMark.addEventListener('click', () => alert('Hide this template\'s button for the main list of buttons.'));
            } else {
                questionMark.addEventListener('click', () => alert('When enabled, clicking this template from the extension Home screen opens a persistent interaction tab and runs the prompt there. It does not affect prompts reached through Post-run Behavior handoffs. If Hide Button is enabled, this option is unavailable because there is no Home button to launch it. Once already in an interaction tab, Home buttons reuse that tab rather than opening another one.'));
            }

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
    
    if (inputId!=="hide_button" && inputId!=="run_in_new_tab"){
        parameterDiv.appendChild(label);
        parameterDiv.appendChild(input);
        parameterDiv.appendChild(questionMark);    
    }
    
    return parameterDiv;
}

// Create optional string-valued advanced controls. Empty/Auto means omit the
// parameter entirely, which is important for cross-model compatibility.
function createAdvancedParameterSelect(labelText, selectId, dataPrompt, options, selectedValue) {
    const parameterDiv = document.createElement('div');
    parameterDiv.className = 'parameter advanced-parameter';

    const label = document.createElement('label');
    label.textContent = labelText + ' ';
    const select = document.createElement('select');
    select.id = selectId + '_' + dataPrompt;
    select.setAttribute('data-field', selectId);
    select.setAttribute('data-prompt', dataPrompt);
    select.className = selectId + '-dropdown';
    label.htmlFor = select.id;

    options.forEach(function(pair) {
        const option = document.createElement('option');
        option.value = pair[0];
        option.textContent = pair[1];
        if (String(pair[0]) === String(selectedValue || '')) option.selected = true;
        select.appendChild(option);
    });

    const questionMark = document.createElement('span');
    questionMark.innerHTML = ` <button type="button" class="question" aria-label="Help for ${labelText}">?</button>`;
    if (selectId === 'reasoning_effort') {
        questionMark.addEventListener('click', () => alert('Optional reasoning effort for models/endpoints that support it. Auto omits the field. Available values differ by model, so unsupported explicit values may be rejected by the provider.'));
    } else if (selectId === 'verbosity') {
        questionMark.addEventListener('click', () => alert('Optional GPT-5 verbosity control. Auto omits the field. LIT Prompting sends text.verbosity to Responses and verbosity to direct OpenAI Chat Completions.'));
    }

    parameterDiv.appendChild(label);
    parameterDiv.appendChild(select);
    parameterDiv.appendChild(questionMark);
    return parameterDiv;
}

// Function to create parameter select elements
function createParameterSelect(labelText, selectId, dataPrompt, options, selectedValue) {
    const parameterDiv = document.createElement('div');
    parameterDiv.className = 'parameter';
    
    const label = document.createElement('label');
    label.textContent = labelText + ' ';
    
    const select = document.createElement('select');
    select.id = selectId + '_' + dataPrompt;  // unique DOM id
    select.setAttribute('data-field', selectId);
    select.setAttribute('data-prompt', dataPrompt);  // 'promptId'
    label.htmlFor = select.id

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
    questionMark.innerHTML = ` <button type="button" class="question" aria-label="Help for ${labelText}">?</button>`;

    if (selectId=="output"){
        questionMark.addEventListener('click', () => alert("Choose what this template does: Prompt returns the resolved prompt text, LLM sends it to the configured model, and JavaScript executes the textarea as user-supplied code and uses its explicit return value as output/passThrough."));
    } else if (selectId=="json_mode") {
        questionMark.addEventListener('click', () => alert("If your model supports JSON Mode, we will turn on JSON Mode, if not, we will alert you when output isn't proper JSON."));
    } else if (selectId=="output_to") {
        questionMark.addEventListener('click', () => alert("Decide where output should go (e.g., to the screen or the screen and the clipboard)."));
    } else if (selectId=="behavior") {
        questionMark.addEventListener('click', () => alert("After this prompt template is run, what next? FULL STOP leaves the completed run visible. In the browser extension, CLOSE POP-UP clears the persisted run and closes the popup so the next open starts at Home; in exported interactions pages it clears the run and returns to Home without closing the page. SAVE TO FILE downloads the output and then follows the same close-or-return-Home behavior. CHAT continues the conversation, and another prompt name triggers that prompt. DYNAMIC triggers the prompt found in passThrough[\"next\"]. See above for a discussion of variables."));   
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
    const promptListing = document.getElementById(promptId);
    if (!promptListing) return;
    const promptName = promptField(promptListing, 'prompt_name').value.trim();
    const inbound = [];
    document.querySelectorAll('#prompt_list .prompt_listing').forEach(function(listing) {
        if (listing === promptListing) return;
        const behaviorSelect = promptField(listing, 'behavior');
        if (behaviorSelect && behaviorSelect.value === promptName) {
            const sourceName = promptField(listing, 'prompt_name');
            inbound.push(sourceName ? sourceName.value.trim() : 'another template');
        }
    });
    let message = 'Do you want to delete "' + promptName + '"? Choose "OK" to continue or "Cancel" to keep things as they are.';
    if (inbound.length) {
        message += '\n\nThe following templates currently run it next: ' + inbound.join(', ') + '. Their Post-run Behavior will be changed to FULL STOP.';
    }
    if (!confirm(message)) return;
    document.querySelectorAll('#prompt_list [data-field="behavior"]').forEach(function(select) {
        if (select.value === promptName) { select.value = 'stop'; select.dataset.savedValue = 'stop'; }
    });
    promptListing.remove();
    saveChanges();
    updateAllPostTemplateBehaviorOptions();
    renderEndpointKeyRegistry();
}

// Function to save changes to localStorage
function saveChanges() {
    const promptList = document.getElementById('prompt_list');
    if (!validatePromptNames(false)) return false;
    const localStorageData = {};
    
    for (const promptListing of promptList.children) {
        const promptId = promptListing.id;
        const promptName = promptListing.querySelector('[data-field="prompt_name"]').value.trim();
        const promptTextarea = promptListing.querySelector('[data-field="prompt"]');
        const endpoint = normalize_api_endpoint((promptListing.querySelector('[data-field="endpoint"]') || {}).value || '');
        const model = promptListing.querySelector('[data-field="model"]').value;
        const temperatureRaw = promptListing.querySelector('[data-field="temperature"]').value.trim();
        const maxTokensRaw = promptListing.querySelector('[data-field="max_tokens"]').value.trim();
        const temperature = temperatureRaw === '' ? '' : parseFloat(temperatureRaw);
        const maxTokens = maxTokensRaw === '' ? '' : parseInt(maxTokensRaw, 10);
        const reasoning_effort = (promptListing.querySelector('[data-field="reasoning_effort"]') || {}).value || '';
        const verbosity = (promptListing.querySelector('[data-field="verbosity"]') || {}).value || '';
        const output = parseInt(promptListing.querySelector('[data-field="output"]').value);
        const json_mode = parseInt(promptListing.querySelector('[data-field="json_mode"]').value);
        const json_schema = promptListing.querySelector('[data-field="json_schema"]').value;
        const output_to = parseInt(promptListing.querySelector('[data-field="output_to"]').value);

        const behaviorSelect = promptListing.querySelector('[data-field="behavior"]');
        const behavior = behaviorSelect ? behaviorSelect.value : ''; // Get the selected behavior value

        const hide_button = promptListing.querySelector('[data-field="hide_button"]').checked;
        const runInNewTabInput = promptListing.querySelector('[data-field="run_in_new_tab"]');
        const run_in_new_tab = !!(runInNewTabInput && runInNewTabInput.checked);

        localStorageData[promptName] = {
            prompt: promptTextarea.value,
            endpoint: endpoint,
            model: model,
            temperature: temperature,
            max_tokens: maxTokens,
            reasoning_effort: reasoning_effort,
            verbosity: verbosity,
            output: output,
            json_mode: json_mode,
            json_schema: json_schema,
            output_to: output_to,
            behavior: behavior,
            hide_button: hide_button,
            run_in_new_tab: run_in_new_tab
        };
    }
    
    try {
        localStorage.setItem('templates', JSON.stringify(localStorageData));
    } catch (error) {
        console.error('Unable to save templates:', error);
        alert('Templates could not be saved. Browser storage may be full. Download a backup before making further changes.');
        return false;
    }
    return true;

    // Endpoint-key registry entries are created on committed endpoint changes
    // and when prompts are loaded, not on every keystroke.
    //updateAllPostTemplateBehaviorOptions();
}

// Function to add a new prompt at the top of the list when the button is clicked
function addNewPrompt() {
    const promptList = document.getElementById('prompt_list'); // Ensure promptList is defined within the function scope

    const newPromptName = `New Prompt ${promptList.childElementCount + 1}`;
    const newPromptId = createPromptElement(newPromptName, {
        prompt: '',
        endpoint: '',
        model: '',
        temperature: '',
        max_tokens: '',
        reasoning_effort: '',
        verbosity: '',
        output: 1,
        json_mode: 0,
        json_schema: '',
        output_to: 0,
        behavior: 0,
        hide_button: false,
        run_in_new_tab: false
    });

    // Update JSON Mode for the new prompt
    updateJsonMode(newPromptId); // New templates default to LLM output.

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
    const promptList = document.getElementById('prompt_list');
    // Keep every derived part of a prompt card synchronized with the control values
    // that drive it. Controls have unique DOM ids, so use stable data-field names
    // rather than ids when deciding what needs to refresh.
    promptList.addEventListener('input', function(event) {
        const target = event.target;
        if (!target || !target.matches('[data-field]')) return;
        const field = target.getAttribute('data-field');
        const promptId = target.getAttribute('data-prompt');

        if (field === 'prompt_name') validatePromptNames(false);

        // Endpoint/model capability feedback should follow typing immediately.
        if (promptId && (field === 'endpoint' || field === 'model')) {
            updateJsonMode(promptId);
        }

        // The visible filter is derived from these editable values too.
        if (field === 'prompt_name' || field === 'prompt' || field === 'model' || field === 'endpoint') {
            applyPromptFilter();
        }
    });

    promptList.addEventListener('change', function(event) {
        const target = event.target;
        if (!target || !target.matches('[data-field]')) return;
        const field = target.getAttribute('data-field');
        const promptId = target.getAttribute('data-prompt');

        // These fields affect enabled/visible controls elsewhere in the same card.
        if (promptId && (field === 'output' || field === 'endpoint' || field === 'model' ||
                field === 'reasoning_effort' || field === 'json_mode')) {
            updateJsonMode(promptId);
        }

        if (field === 'output' && target.value === '2') {
            // Firefox uses this user gesture to request its optional permission.
            // Chrome uses the same shared code path to re-check browser-level access.
            requestJavaScriptPermission();
        }

        if (promptId && field === 'hide_button') {
            updateRunInNewTabState(promptId);
        }

        if (field === 'prompt_name' || field === 'prompt' || field === 'model' || field === 'endpoint') {
            applyPromptFilter();
        }
    });

    const promptFilter = document.getElementById('prompt_filter');
    if (promptFilter) promptFilter.addEventListener('input', applyPromptFilter);
    const clearFilter = document.getElementById('clear_prompt_filter');
    if (clearFilter) clearFilter.addEventListener('click', clearPromptFilter);

    // Add a new prompt at the top of the list when the button is clicked
    document.getElementById('add_prompt_to_list').addEventListener('click', () => {
        addNewPrompt();
        applyPromptFilter();
    });
});

(async () => {
    platformJS = await loadFile('js/platform.js');
    spinJS = await loadFile('js/spin.min.js');
    functionsJS = await loadFile('js/functions.js');
    apiAdaptersJS = await loadFile('js/api_adapters.js');
    promptsJS = await loadFile('js/prompts.js');
    popupJS = await loadFile('js/popup_exported.js');
    popupCSS = await loadFile('css/popup_exported.css');
    popup_scratchCSS = await loadFile('css/popup_scratch.css');
    popupHTML = await loadFile('./popup.html');
})()

function replaceExportChunk(source, marker, content) {
    // Replacement text can legitimately contain String.replace tokens such as
    // $&, $`, or $'. Returning it from a callback keeps it byte-for-byte intact.
    return source.replace(marker, function() { return content; });
}


function stripDelimitedBlocks(source, beginMarker, endMarker) {
    var depth = 0;
    return String(source || '').split('\n').filter(function(line) {
        if (line.indexOf(beginMarker) !== -1) { depth += 1; return false; }
        if (line.indexOf(endMarker) !== -1) { depth = Math.max(0, depth - 1); return false; }
        return depth === 0;
    }).join('\n');
}

function stripStandaloneLoggingSource(source) {
    var stripped = stripDelimitedBlocks(source, '// BEGIN EXTENSION-ONLY LOGGING', '// END EXTENSION-ONLY LOGGING');
    return stripDelimitedBlocks(stripped, '/* BEGIN EXTENSION-ONLY LOGGING */', '/* END EXTENSION-ONLY LOGGING */');
}

function stripStandaloneLoggingMarkup(source) {
    return stripDelimitedBlocks(source, '<!-- BEGIN EXTENSION-ONLY LOGGING -->', '<!-- END EXTENSION-ONLY LOGGING -->');
}

function stripStandaloneLoggingCss(source) {
    return stripDelimitedBlocks(source, '/* BEGIN EXTENSION-ONLY LOGGING */', '/* END EXTENSION-ONLY LOGGING */');
}

function safeInlineJson(value) {
    // JSON is valid JavaScript, but an inline <script> can still be terminated by
    // user data containing "</script>". Escape HTML-significant characters and
    // JavaScript line separators before embedding any user-controlled value.
    return JSON.stringify(value)
        .replace(/</g, '\\u003C')
        .replace(/>/g, '\\u003E')
        .replace(/&/g, '\\u0026')
        .replace(/\u2028/g, '\\u2028')
        .replace(/\u2029/g, '\\u2029');
}

function exportBootstrapScript() {
    const templatesJson = localStorage.getItem('templates') || '{}';
    return "localStorage.setItem('templates'," + safeInlineJson(templatesJson) + ");\n" +
        "localStorage.setItem('default_model'," + safeInlineJson(get_default_model()) + ");\n" +
        "localStorage.setItem('api_base'," + safeInlineJson(get_default_api_endpoint()) + ");\n";
}

function encryptedExportBootstrap(encrypted_key) {
    return `api_key_ready = (async () => { const decrypted = await decryptData(${safeInlineJson(encrypted_key)}); if (!decrypted) return false; let embedded_api_keys = {}; try { const bundle = JSON.parse(decrypted); embedded_api_keys = (bundle.apiKeys && typeof bundle.apiKeys === 'object') ? bundle.apiKeys : {}; if (bundle.defaultKey && !embedded_api_keys[get_default_api_endpoint()]) embedded_api_keys[get_default_api_endpoint()] = String(bundle.defaultKey); } catch (error) { embedded_api_keys = {}; embedded_api_keys[get_default_api_endpoint()] = decrypted; } api_keys = merge_api_key_defaults(embedded_api_keys); return true; })();`;
}

function build_export(encrypted_key=null, password="") {
    let fileText = stripStandaloneLoggingMarkup(popupHTML);
    const standalonePromptsJS = stripStandaloneLoggingSource(promptsJS);
    const standalonePopupCSS = stripStandaloneLoggingCss(popupCSS);
    fileText = replaceExportChunk(fileText, `</title>`, `</title>\n<script>\n\n${exportBootstrapScript()}`);
    fileText = replaceExportChunk(fileText, `<script src="js/platform.js"></script>`, `\n${platformJS}`);
    fileText = replaceExportChunk(fileText, `<script src="js/spin.min.js"></script>`, `\n${spinJS}`);
    fileText = replaceExportChunk(fileText, `<script src="js/functions.js"></script>`, `\n${functionsJS}`);
    fileText = replaceExportChunk(fileText, `<script src="js/api_adapters.js"></script>`, `\n${apiAdaptersJS}`);
    fileText = replaceExportChunk(fileText, `<script src="js/prompts.js"></script>`, `\n${standalonePromptsJS}`);
    fileText = replaceExportChunk(fileText, `<script src="js/popup.js"></script>`, `\n${popupJS}`);
    fileText = replaceExportChunk(fileText, `<link rel="stylesheet" type="text/css" href="css/popup.css">`, `</script>\n<style>\n${standalonePopupCSS}\n</style>`);

    if (encrypted_key) {
        fileText = replaceExportChunk(fileText, `//FOR EXPORT ENCRYPTED KEY: api_key_ready = Promise.resolve(true);`, encryptedExportBootstrap(encrypted_key));
    } else {
        const exportRegistry = apiKeysNeededForCurrentPrompts();
        fileText = replaceExportChunk(fileText, `var api_keys = get_api_key_registry();`, `var api_keys = merge_api_key_defaults(${safeInlineJson(exportRegistry)});`);
    }

    fileText = fileText.replaceAll(`Please check its contents by clicking "Templates & Settings" bellow.`,``);
    fileText = fileText.replaceAll(`, API Key, and model. You can edit these after clicking the "Templates & Settings" button below.`,` and API Key. The credentials may have expired.`);
    fileText = fileText.replaceAll(`//FOR EXPORT: `,``);

    fileText = replaceExportChunk(fileText, `<div class="custom_header"></div>`, `<div class="custom_header">${document.getElementById('custom_html').value}</div>`);

    return fileText;
}

function build_export_w_scrtach(encrypted_key=null, password="") {
    let fileText = stripStandaloneLoggingMarkup(popupHTML);
    const standalonePromptsJS = stripStandaloneLoggingSource(promptsJS);
    const standaloneScratchCSS = stripStandaloneLoggingCss(popup_scratchCSS);
    fileText = replaceExportChunk(fileText, `</title>`, `</title>\n<script>\n\n${exportBootstrapScript()}`);
    fileText = replaceExportChunk(fileText, `<script src="js/platform.js"></script>`, platformJS);
    fileText = replaceExportChunk(fileText, `<script src="js/spin.min.js"></script>`, spinJS);
    fileText = replaceExportChunk(fileText, `<script src="js/functions.js"></script>`, functionsJS);
    fileText = replaceExportChunk(fileText, `<script src="js/api_adapters.js"></script>`, apiAdaptersJS);
    fileText = replaceExportChunk(fileText, `<script src="js/prompts.js"></script>`, standalonePromptsJS);
    fileText = replaceExportChunk(fileText, `<script src="js/popup.js"></script>`, popupJS);
    fileText = replaceExportChunk(fileText, `<link rel="stylesheet" type="text/css" href="css/popup.css">`, `</script>\n<style>\n${standaloneScratchCSS}\n</style>`);

    fileText = fileText.replace(`window.scrollTo(0, 0);`,`document.getElementById('inner_wrapper').scrollTo(0, 0);`);
    fileText = fileText.replace(`var getScrollTopDocumentAtBegin = document.documentElement.scrollTop + document.body.scrollTop`,`var getScrollTopDocumentAtBegin = document.getElementById('inner_wrapper').scrollTop + document.body.scrollTop`);
    fileText = fileText.replace(`setTimeout(function(){  window.scrollTo(`,`setTimeout(function(){  document.getElementById('inner_wrapper').scrollTo(`);

    if (encrypted_key) {
        fileText = replaceExportChunk(fileText, `//FOR EXPORT ENCRYPTED KEY: api_key_ready = Promise.resolve(true);`, encryptedExportBootstrap(encrypted_key));
    } else {
        const exportRegistry = apiKeysNeededForCurrentPrompts();
        fileText = replaceExportChunk(fileText, `var api_keys = get_api_key_registry();`, `var api_keys = merge_api_key_defaults(${safeInlineJson(exportRegistry)});`);
    }

    fileText = fileText.replaceAll(`<title>Prompt Interactions</title>`,`<title>Prompt Interactions with Scratch Pad</title>`);
    fileText = fileText.replaceAll(`Please check its contents by clicking "Templates & Settings" bellow.`,``);
    fileText = fileText.replaceAll(`, API Key, and model. You can edit these after clicking the "Templates & Settings" button below.`,` and API Key. The credentials may have expired.`);
    fileText = fileText.replaceAll(`//FOR EXPORT: `,``);

    fileText = replaceExportChunk(fileText, `<div class="custom_header"></div>`, `<div class="custom_header">${document.getElementById('custom_html').value}</div>`);

    return fileText;
}
