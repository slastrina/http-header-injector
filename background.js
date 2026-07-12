// Rebuilds declarativeNetRequest dynamic rules from the active profile in
// storage. Handles request/response targets, set/append/remove operations,
// and optional method / resource-type / regex conditions.

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

const OPERATIONS = ["set", "append", "remove"];

// Fill any missing fields with safe defaults. Old records (name/value/enabled/
// description/urlPatterns only) load cleanly through this.
function coerceHeader(h) {
  h = h || {};
  return {
    name: h.name || "",
    value: h.value || "",
    enabled: h.enabled !== false,
    description: h.description || "",
    urlPatterns: h.urlPatterns || "",
    matchType: h.matchType === "regex" ? "regex" : "wildcard",
    target: h.target === "response" ? "response" : "request",
    operation: OPERATIONS.includes(h.operation) ? h.operation : "set",
    methods: Array.isArray(h.methods) ? h.methods : [],
    resourceTypes: Array.isArray(h.resourceTypes) ? h.resourceTypes : []
  };
}

// Returns the active profile's headers, transparently migrating the legacy
// flat `headers` array if that's all that's stored.
function resolveActiveHeaders(store) {
  if (Array.isArray(store.profiles) && store.profiles.length) {
    const prof =
      store.profiles.find((p) => p.id === store.activeProfileId) ||
      store.profiles[0];
    return (prof.headers || []).map(coerceHeader);
  }
  if (Array.isArray(store.headers)) {
    return store.headers.map(coerceHeader);
  }
  return [];
}

// "a.com, *://*.b.com/*" -> ["a.com", "*://*.b.com/*"]
function parsePatterns(raw) {
  return (raw || "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
}

function isApplicable(h) {
  return h.enabled && VALID_HEADER_NAME.test(h.name);
}

async function buildConditions(h) {
  const base = {
    resourceTypes: h.resourceTypes.length ? h.resourceTypes : ALL_RESOURCE_TYPES
  };
  if (h.methods.length) base.requestMethods = h.methods;

  const patterns = parsePatterns(h.urlPatterns);
  if (patterns.length === 0) return [{ ...base }];

  const conditions = [];
  for (const p of patterns) {
    if (h.matchType === "regex") {
      const { isSupported } = await chrome.declarativeNetRequest.isRegexSupported(
        { regex: p }
      );
      if (!isSupported) continue; // skip a bad regex rather than break the batch
      conditions.push({ ...base, regexFilter: p });
    } else {
      conditions.push({ ...base, urlFilter: p });
    }
  }
  return conditions;
}

async function syncRules() {
  const store = await chrome.storage.sync.get([
    "profiles",
    "activeProfileId",
    "headers",
    "masterEnabled"
  ]);
  const masterEnabled = store.masterEnabled !== false;
  const active = masterEnabled
    ? resolveActiveHeaders(store).filter(isApplicable)
    : [];

  const addRules = [];
  const ruleMap = {};
  let id = 1;
  for (const h of active) {
    const spec = { header: h.name, operation: h.operation };
    if (h.operation !== "remove") spec.value = h.value;

    const action = { type: "modifyHeaders" };
    if (h.target === "response") action.responseHeaders = [spec];
    else action.requestHeaders = [spec];

    const conditions = await buildConditions(h);
    for (const condition of conditions) {
      addRules.push({ id, priority: 1, action, condition });
      ruleMap[id] = {
        name: h.name,
        description: h.description,
        target: h.target,
        operation: h.operation
      };
      id++;
    }
  }

  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  try {
    // updateDynamicRules is atomic — on error, the previous rules stay intact.
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: existing.map((r) => r.id),
      addRules
    });
    await chrome.storage.session.set({ ruleMap });
  } catch (e) {
    console.error("Header Injector: could not apply rules —", e.message);
  }

  const count = active.length;
  await chrome.action.setBadgeText({ text: count ? String(count) : "" });
  await chrome.action.setBadgeBackgroundColor({ color: "#e8a020" });
}

chrome.runtime.onInstalled.addListener(syncRules);
chrome.runtime.onStartup.addListener(syncRules);
chrome.storage.onChanged.addListener((changes, area) => {
  if (
    area === "sync" &&
    (changes.profiles ||
      changes.activeProfileId ||
      changes.headers ||
      changes.masterEnabled)
  ) {
    syncRules();
  }
});
