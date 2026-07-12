<p align="center">
  <img src="store/marquee-1400x560.png" alt="Header Injector — inject custom request headers into every page you visit" width="820">
</p>

# Header Injector

A minimal Chrome extension (Manifest V3) that injects custom request headers
into every request your browser makes. Each header is a simple key/value pair
you can toggle on and off individually, plus a master switch to bypass
everything at once.

Uses the `declarativeNetRequest` API, so headers are applied by the browser's
network stack itself — no request interception scripts, works on all resource
types (pages, XHR/fetch, images, websockets, etc.).

Product page: **[iokig.com/header-injector](https://www.iokig.com/header-injector)**

<p align="center">
  <img src="store/screenshot-1280x800.png" alt="Header Injector popup showing a configured header with name, value, description and URL pattern, plus import and export controls" width="720">
</p>

## Install

Install it free from the
**[Chrome Web Store](https://chromewebstore.google.com/detail/lmenpgenoahfecdigodcalifmnmdlffo)**.

To run it from source for development:

1. Open `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked** and select this folder

## Use

- Click the extension icon to open the panel
- **+ ADD HEADER** to create a key/value pair
- Each row also has:
  - a **description** — free-text note, just for you; it doesn't affect anything
  - **url patterns** — where this header should be sent. Leave blank to apply
    it to every site. Otherwise enter one or more patterns, comma-separated,
    using `*` as a wildcard (e.g. `*://*.example.com/*, https://api.foo.dev/*`).
    A header only fires on requests whose URL matches one of its patterns.
- Each row has its own toggle; the switch in the title bar disables everything
- The badge on the icon shows how many headers are currently enabled
- Changes apply immediately — reload the page you're testing to see them

### Import / Export

- **EXPORT** downloads all your headers as `header-injector-export.json`
- **IMPORT** reads a JSON file and appends its headers to your current list.
  Two shapes are auto-detected:
  - this extension's own export
  - a profiles-style export from another header tool — header
    names/values/enabled state carry over, a per-header `comment` becomes the
    description, and any plain URL filters are brought across. "Append" headers
    are imported as "set" (this extension only sets headers), and regex URL
    filters that don't map to wildcard patterns are left blank (all sites).

Notes:

- Header names must be valid HTTP token characters (letters, digits, `-`, etc.);
  invalid names turn red and are skipped
- Headers are stored in `chrome.storage.sync`, so they follow your Chrome profile
- Injected headers are visible to every site you visit while enabled — turn the
  master switch off when you're done testing
