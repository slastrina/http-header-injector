// Rebuilds declarativeNetRequest dynamic rules from whatever is in storage.
// Each enabled header becomes one rule per URL pattern (or a single catch-all
// rule if it has no patterns).

const VALID_HEADER_NAME = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;

const ALL_RESOURCE_TYPES = [
  "main_frame",
  "sub_frame",
  "stylesheet",
  "script",
  "image",
  "font",
  "object",
  "xmlhttprequest",
  "ping",
  "csp_report",
  "media",
  "websocket",
  "webtransport",
  "webbundle",
  "other"
];

// "a.com, *://*.b.com/*" -> ["a.com", "*://*.b.com/*"]
function parsePatterns(raw) {
  return (raw || "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
}

async function syncRules() {
  const { headers = [], masterEnabled = true } = await chrome.storage.sync.get([
    "headers",
    "masterEnabled"
  ]);

  const active = masterEnabled
    ? headers.filter((h) => h.enabled && VALID_HEADER_NAME.test(h.name))
    : [];

  const addRules = [];
  let id = 1;
  for (const h of active) {
    const patterns = parsePatterns(h.urlPatterns);
    const conditions =
      patterns.length === 0
        ? [{ resourceTypes: ALL_RESOURCE_TYPES }]
        : patterns.map((urlFilter) => ({
            urlFilter,
            resourceTypes: ALL_RESOURCE_TYPES
          }));

    for (const condition of conditions) {
      addRules.push({
        id: id++,
        priority: 1,
        action: {
          type: "modifyHeaders",
          requestHeaders: [{ header: h.name, operation: "set", value: h.value }]
        },
        condition
      });
    }
  }

  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: existing.map((r) => r.id),
    addRules
  });

  // Badge shows the number of distinct enabled headers, not rules.
  const count = active.length;
  await chrome.action.setBadgeText({ text: count ? String(count) : "" });
  await chrome.action.setBadgeBackgroundColor({ color: "#e8a020" });
}

chrome.runtime.onInstalled.addListener(syncRules);
chrome.runtime.onStartup.addListener(syncRules);
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && (changes.headers || changes.masterEnabled)) {
    syncRules();
  }
});
