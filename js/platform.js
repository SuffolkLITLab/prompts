/*
 * Browser compatibility layer for LIT Prompting.
 *
 * Keep browser-specific WebExtension behavior here so the prompt/template engine
 * can remain shared between Firefox and Chromium builds. This file is also safe
 * to include in standalone HTML exports, where no extension API is available.
 */
(function (global) {
  'use strict';

  function getApi() {
    if (typeof global.browser !== 'undefined') return global.browser;
    if (typeof global.chrome !== 'undefined') return global.chrome;
    return null;
  }

  function userAgent() {
    try {
      return (global.navigator && global.navigator.userAgent) || '';
    } catch (error) {
      return '';
    }
  }

  function browserFamily() {
    var ua = userAgent();
    if (/Firefox\//i.test(ua)) return 'firefox';
    if (/(Chrome|Chromium)\//i.test(ua) || /Edg\//i.test(ua)) return 'chromium';
    return getApi() ? 'webextension' : 'standalone';
  }

  function browserLabel() {
    var family = browserFamily();
    if (family === 'firefox') return 'Firefox';
    if (family === 'chromium') return 'Chrome/Chromium';
    if (family === 'standalone') return 'Standalone HTML';
    return 'this browser';
  }

  function browserMajorVersion() {
    var ua = userAgent();
    var family = browserFamily();
    var match;
    if (family === 'firefox') {
      match = ua.match(/Firefox\/(\d+)/i);
    } else if (family === 'chromium') {
      match = ua.match(/(?:Chrome|Chromium)\/(\d+)/i) || ua.match(/Edg\/(\d+)/i);
    }
    return match ? Number(match[1]) : null;
  }

  function isExtensionContext() {
    var api = getApi();
    try {
      return !!(api && api.runtime && api.runtime.id);
    } catch (error) {
      return false;
    }
  }

  function getURL(path) {
    var api = getApi();
    try {
      if (api && api.runtime && typeof api.runtime.getURL === 'function') {
        return api.runtime.getURL(String(path || ''));
      }
    } catch (error) {
      // Fall through to an empty string outside a usable extension context.
    }
    return '';
  }

  async function queryTabs(query) {
    var api = getApi();
    if (!api || !api.tabs || !api.tabs.query) {
      throw new Error('The tabs API is unavailable in this context.');
    }
    return await api.tabs.query(query);
  }

  async function getActiveTab() {
    var tabs = await queryTabs({ active: true, currentWindow: true });
    if (!tabs || !tabs[0] || typeof tabs[0].id === 'undefined') {
      throw new Error('Unable to identify the active browser tab.');
    }
    return tabs[0];
  }

  async function getCurrentTab() {
    var api = getApi();
    if (!api || !api.tabs || !api.tabs.getCurrent) return null;
    try {
      return await api.tabs.getCurrent();
    } catch (error) {
      return null;
    }
  }

  async function getTab(tabId) {
    var api = getApi();
    if (!api || !api.tabs || !api.tabs.get) {
      throw new Error('The tabs.get API is unavailable in this context.');
    }
    return await api.tabs.get(tabId);
  }

  async function createTab(createProperties) {
    var api = getApi();
    if (!api || !api.tabs || !api.tabs.create) {
      throw new Error('The tabs.create API is unavailable in this context.');
    }
    return await api.tabs.create(createProperties || {});
  }

  function safeWindowOpen(url, target) {
    if (typeof global.open !== 'function') return false;
    try {
      var opened = global.open(String(url || ''), target || '_blank');
      // Some popup contexts return null even when a new tab/window is accepted.
      // Never assume .focus() exists; that was the source of fragile footer links.
      if (opened && typeof opened.focus === 'function') {
        try { opened.focus(); } catch (focusError) { /* Navigation already succeeded. */ }
      }
      return opened !== false;
    } catch (error) {
      return false;
    }
  }

  async function openOptionsPage() {
    var api = getApi();
    if (isExtensionContext() && api && api.runtime && typeof api.runtime.openOptionsPage === 'function') {
      await api.runtime.openOptionsPage();
      return true;
    }
    var fallbackUrl = getURL('options.html') || 'options.html';
    if (safeWindowOpen(fallbackUrl, 'options')) return true;
    throw new Error('Unable to open Templates & Settings.');
  }

  async function openInternalPage(path, target) {
    var pagePath = String(path || '');
    var extensionUrl = getURL(pagePath);
    if (isExtensionContext() && extensionUrl) {
      await createTab({ url: extensionUrl });
      return true;
    }
    if (safeWindowOpen(pagePath, target || '_blank')) return true;
    throw new Error('Unable to open extension page: ' + pagePath);
  }

  async function openExternalPage(url, target) {
    var destination = String(url || '');
    if (isExtensionContext()) {
      await createTab({ url: destination });
      return true;
    }
    if (safeWindowOpen(destination, target || '_blank')) return true;
    throw new Error('Unable to open link: ' + destination);
  }

  async function closeCurrentTab() {
    var api = getApi();
    if (!api || !api.tabs || !api.tabs.getCurrent || !api.tabs.remove) {
      throw new Error('The tabs API cannot close the current interaction tab.');
    }
    var tab = await api.tabs.getCurrent();
    if (!tab || typeof tab.id === 'undefined') {
      throw new Error('Unable to identify the current interaction tab.');
    }
    await api.tabs.remove(tab.id);
    return true;
  }

  async function executeScript(details) {
    var api = getApi();
    if (!api || !api.scripting || !api.scripting.executeScript) {
      throw new Error('The scripting API is unavailable in this browser/context.');
    }
    return await api.scripting.executeScript(details);
  }

  function sendMessage(message) {
    var api = getApi();
    if (!api || !api.runtime || !api.runtime.sendMessage) return null;
    try {
      return api.runtime.sendMessage(message);
    } catch (error) {
      console.error('Unable to send extension message:', error);
      return null;
    }
  }

  function addMessageListener(listener) {
    var api = getApi();
    if (!api || !api.runtime || !api.runtime.onMessage) return false;
    api.runtime.onMessage.addListener(listener);
    return true;
  }

  async function containsPermissions(permissions) {
    var api = getApi();
    if (!api || !api.permissions || !api.permissions.contains) return false;
    var requested = Array.isArray(permissions) ? permissions.filter(Boolean) : [];
    if (!requested.length) return true;
    return !!(await api.permissions.contains({ permissions: requested }));
  }

  async function requestPermissions(permissions) {
    var api = getApi();
    if (!api || !api.permissions || !api.permissions.request) return false;
    var requested = Array.isArray(permissions) ? permissions.filter(Boolean) : [];
    if (!requested.length) return true;
    return !!(await api.permissions.request({ permissions: requested }));
  }

  async function containsPermission(permission) {
    return await containsPermissions([permission]);
  }

  async function requestPermission(permission) {
    return await requestPermissions([permission]);
  }

  function javascriptSupportResult(overrides) {
    return Object.assign({
      ready: false,
      family: browserFamily(),
      browser: browserLabel(),
      canRequestPermission: false,
      permissionGranted: false,
      reason: 'unsupported',
      message: 'JavaScript templates are unavailable in this browser/context.'
    }, overrides || {});
  }

  async function testChromiumUserScriptsApi(api) {
    if (!api.userScripts || typeof api.userScripts.getScripts !== 'function') return false;
    try {
      // Chrome recommends making a userScripts API call rather than checking only
      // for the namespace because its UI toggle can make calls unavailable.
      await api.userScripts.getScripts();
      return true;
    } catch (error) {
      return false;
    }
  }

  async function getJavaScriptTemplateSupport(options) {
    options = options || {};
    var api = getApi();
    var family = browserFamily();
    var major = browserMajorVersion();

    if (!isExtensionContext() || !api || !api.permissions) {
      return javascriptSupportResult({
        family: family,
        reason: 'standalone',
        message: 'JavaScript templates require the browser extension; standalone HTML exports cannot execute user scripts.'
      });
    }

    try {
      var granted;

      if (family === 'firefox') {
        // userScripts is optional-only in Firefox. When the caller is handling a
        // user gesture, request it immediately: doing an awaited contains() check
        // first can lose the transient activation required by permissions.request().
        granted = options.requestPermission
          ? await requestPermission('userScripts')
          : await containsPermission('userScripts');

        if (!granted) {
          return javascriptSupportResult({
            family: family,
            permissionGranted: false,
            canRequestPermission: true,
            reason: 'permission',
            message: "JavaScript templates need Firefox's optional userScripts permission."
          });
        }

        if (!api.userScripts || typeof api.userScripts.execute !== 'function') {
          return javascriptSupportResult({
            family: family,
            permissionGranted: true,
            reason: 'version',
            message: 'JavaScript templates require Firefox 153 or newer because this feature uses userScripts.execute().'
          });
        }

        return javascriptSupportResult({
          ready: true,
          family: family,
          permissionGranted: true,
          reason: 'ready',
          message: 'Enabled — JavaScript templates are ready in Firefox.'
        });
      }

      if (family === 'chromium') {
        // Chrome requires userScripts in manifest.permissions rather than as an
        // optional-only permission. The Chrome build manifest handles this.
        granted = await containsPermission('userScripts');
        if (!granted) {
          return javascriptSupportResult({
            family: family,
            reason: 'manifest_permission',
            message: 'This Chrome build is missing the required userScripts manifest permission. Rebuild with the Chrome manifest.'
          });
        }

        if (major !== null && major < 135) {
          return javascriptSupportResult({
            family: family,
            permissionGranted: true,
            reason: 'version',
            message: 'JavaScript templates require Chrome/Chromium 135 or newer because this feature uses userScripts.execute().'
          });
        }

        var apiEnabled = await testChromiumUserScriptsApi(api);
        if (!apiEnabled || !api.userScripts || typeof api.userScripts.execute !== 'function') {
          var toggleMessage;
          if (major !== null && major >= 138) {
            toggleMessage = 'Open chrome://extensions, open this extension\'s Details page, enable “Allow User Scripts,” then reopen this page.';
          } else {
            toggleMessage = 'Open chrome://extensions, enable Developer mode to allow user scripts, then reopen this page.';
          }
          return javascriptSupportResult({
            family: family,
            permissionGranted: true,
            reason: 'user_scripts_toggle',
            message: toggleMessage
          });
        }

        return javascriptSupportResult({
          ready: true,
          family: family,
          permissionGranted: true,
          reason: 'ready',
          message: 'Enabled — JavaScript templates are ready in Chrome/Chromium.'
        });
      }

      granted = options.requestPermission
        ? await requestPermission('userScripts')
        : await containsPermission('userScripts');
      if (!granted) {
        return javascriptSupportResult({
          family: family,
          canRequestPermission: true,
          reason: 'permission',
          message: 'JavaScript templates require the userScripts permission in this browser.'
        });
      }
      if (!api.userScripts || typeof api.userScripts.execute !== 'function') {
        return javascriptSupportResult({
          family: family,
          permissionGranted: true,
          reason: 'unsupported',
          message: 'This browser does not expose a compatible userScripts.execute() API.'
        });
      }
      return javascriptSupportResult({
        ready: true,
        family: family,
        permissionGranted: true,
        reason: 'ready',
        message: 'Enabled — JavaScript templates are ready.'
      });
    } catch (error) {
      return javascriptSupportResult({
        family: family,
        reason: 'error',
        message: 'Unable to check JavaScript-template support: ' + (error && error.message ? error.message : String(error))
      });
    }
  }

  async function executeUserScript(injection) {
    var api = getApi();
    if (!api || !api.userScripts || typeof api.userScripts.execute !== 'function') {
      throw new Error('userScripts.execute() is unavailable in this browser/context.');
    }
    return await api.userScripts.execute(injection);
  }

  global.LitPlatform = {
    getApi: getApi,
    isExtensionContext: isExtensionContext,
    getURL: getURL,
    browserFamily: browserFamily,
    browserLabel: browserLabel,
    browserMajorVersion: browserMajorVersion,
    queryTabs: queryTabs,
    getActiveTab: getActiveTab,
    getCurrentTab: getCurrentTab,
    getTab: getTab,
    createTab: createTab,
    openOptionsPage: openOptionsPage,
    openInternalPage: openInternalPage,
    openExternalPage: openExternalPage,
    closeCurrentTab: closeCurrentTab,
    executeScript: executeScript,
    sendMessage: sendMessage,
    addMessageListener: addMessageListener,
    containsPermission: containsPermission,
    requestPermission: requestPermission,
    containsPermissions: containsPermissions,
    requestPermissions: requestPermissions,
    getJavaScriptTemplateSupport: getJavaScriptTemplateSupport,
    executeUserScript: executeUserScript
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
