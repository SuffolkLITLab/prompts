# Browser portability

The source tree is organized so Firefox and Chrome/Chromium can share the same prompt, template, popup, persistence, and API-integration code. Provider/protocol differences are separately centralized in `js/api_adapters.js`, so they do not depend on the browser compatibility layer.

## Current distribution

The root `manifest.json` remains the Firefox manifest. That is the package intended for normal use at present.

Browser-specific manifests live under `manifests/`:

- `manifest.firefox.json` uses Firefox's Manifest V3 `background.scripts` model and declares `userScripts` as an optional permission.
- `manifest.chrome.json` uses a Manifest V3 background service worker and declares `userScripts` as an install-time permission. It also requires Chrome 135+ because JavaScript templates use `userScripts.execute()`.

## Compatibility layer

`js/platform.js` is the boundary for WebExtension APIs that differ by browser. New shared application code should prefer `LitPlatform` instead of calling `browser.*` or `chrome.*` directly when a browser difference is possible.

The layer currently normalizes:

- active-tab lookup;
- script injection;
- extension messaging;
- optional permission checks/requests;
- JavaScript-template capability checks; and
- `userScripts.execute()`.

JavaScript-template setup intentionally differs by browser. Firefox requires the optional-only `userScripts` permission and currently needs Firefox 153+ for `userScripts.execute()`. Chrome requires `userScripts` in the install-time manifest permissions, Chrome 135+ for `execute()`, and a browser UI setting that allows user scripts.

## Building

The checked-in root package stays Firefox-first. To produce a browser-specific ZIP from the same source tree:

```bash
python tools/build_extension.py firefox
python tools/build_extension.py chrome
```

The build script swaps only `manifest.json`; the rest of the extension code is shared.

The Chrome manifest/build is groundwork for a later Chrome release. Browser-store packaging, Chrome-specific end-to-end testing, and release documentation should still be completed before publishing it as a supported Chrome extension.

## Release-package invariant

Firefox and Chrome releases are built from the same source tree. The release ZIPs must be identical except for `manifest.json`; browser-specific UI/setup behavior is detected at runtime in `js/platform.js` and shared Settings code. Run `tools/test_browser_package_parity.py <firefox.zip> <chrome.zip>` after building both packages to verify this invariant.
