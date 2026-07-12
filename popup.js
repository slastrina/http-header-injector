const VALID_HEADER_NAME = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;
const OPERATIONS = ["set", "append", "remove"];

// method / resource-type options for the advanced chips
const METHOD_OPTIONS = ["get", "post", "put", "delete", "patch", "head", "options"];
const RESOURCE_OPTIONS = [
  ["main_frame", "doc"],
  ["sub_frame", "frame"],
  ["xmlhttprequest", "xhr"],
  ["script", "script"],
  ["stylesheet", "css"],
  ["image", "img"],
  ["font", "font"],
  ["media", "media"],
  ["websocket", "ws"],
  ["other", "other"]
];

// ---- elements ----
const listEl = document.getElementById("header-list");
const template = document.getElementById("row-template");
const addBtn = document.getElementById("add-btn");
const masterToggle = document.getElementById("master-toggle");
const statusLine = document.getElementById("status-line");
const emptyHint = document.getElementById("empty-hint");
const profileSelect = document.getElementById("profile-select");
const profileNew = document.getElementById("profile-new");
const profileRename = document.getElementById("profile-rename");
const profileDel = document.getElementById("profile-del");
const pasteBtn = document.getElementById("paste-btn");
const pastePanel = document.getElementById("paste-panel");
const pasteInput = document.getElementById("paste-input");
const pasteParse = document.getElementById("paste-parse");
const pasteCancel = document.getElementById("paste-cancel");
const importBtn = document.getElementById("import-btn");
const exportBtn = document.getElementById("export-btn");
const importFile = document.getElementById("import-file");
const ioMsg = document.getElementById("io-msg");
const debugEl = document.getElementById("debug");
const debugRefresh = document.getElementById("debug-refresh");
const debugList = document.getElementById("debug-list");

// ---- state ----
let state = { profiles: [], activeProfileId: null, masterEnabled: true };

function uid() {
  return "p-" + crypto.randomUUID().slice(0, 8);
}

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

function activeProfile() {
  return (
    state.profiles.find((p) => p.id === state.activeProfileId) ||
    state.profiles[0]
  );
}

function activeHeaders() {
  return activeProfile().headers;
}

// ---- load / migrate ----
async function load() {
  const store = await chrome.storage.sync.get([
    "profiles",
    "activeProfileId",
    "headers",
    "masterEnabled"
  ]);
  state.masterEnabled = store.masterEnabled !== false;

  if (Array.isArray(store.profiles) && store.profiles.length) {
    state.profiles = store.profiles.map((p) => ({
      id: p.id || uid(),
      name: p.name || "Profile",
      headers: (p.headers || []).map(coerceHeader)
    }));
    state.activeProfileId =
      store.activeProfileId &&
      state.profiles.some((p) => p.id === store.activeProfileId)
        ? store.activeProfileId
        : state.profiles[0].id;
  } else if (Array.isArray(store.headers)) {
    // migrate legacy flat headers into a Default profile
    const id = uid();
    state.profiles = [
      { id, name: "Default", headers: store.headers.map(coerceHeader) }
    ];
    state.activeProfileId = id;
    await chrome.storage.sync.set({
      profiles: state.profiles,
      activeProfileId: id
    });
    await chrome.storage.sync.remove("headers");
  } else {
    const id = uid();
    state.profiles = [{ id, name: "Default", headers: [] }];
    state.activeProfileId = id;
  }

  masterToggle.checked = state.masterEnabled;
  document.body.classList.toggle("master-off", !state.masterEnabled);
  renderProfiles();
  render();
}

function save() {
  chrome.storage.sync.set({
    profiles: state.profiles,
    activeProfileId: state.activeProfileId,
    masterEnabled: state.masterEnabled
  });
  updateStatus();
}

function updateStatus() {
  const hs = activeHeaders();
  const active = state.masterEnabled
    ? hs.filter((h) => h.enabled && VALID_HEADER_NAME.test(h.name)).length
    : 0;
  statusLine.textContent = state.masterEnabled ? `${active} ACTIVE` : "BYPASSED";
  statusLine.classList.toggle("live", active > 0);
  emptyHint.classList.toggle("visible", hs.length === 0);
}

// ---- profiles ----
function renderProfiles() {
  profileSelect.textContent = "";
  for (const p of state.profiles) {
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = p.name;
    if (p.id === state.activeProfileId) opt.selected = true;
    profileSelect.appendChild(opt);
  }
  profileDel.disabled = state.profiles.length <= 1;
}

profileSelect.addEventListener("change", () => {
  state.activeProfileId = profileSelect.value;
  save();
  render();
});

profileNew.addEventListener("click", () => {
  const name = (window.prompt("Name for the new profile:", "") || "").trim();
  if (!name) return;
  const id = uid();
  state.profiles.push({ id, name, headers: [] });
  state.activeProfileId = id;
  save();
  renderProfiles();
  render();
});

profileRename.addEventListener("click", () => {
  const prof = activeProfile();
  const name = (window.prompt("Rename profile:", prof.name) || "").trim();
  if (!name) return;
  prof.name = name;
  save();
  renderProfiles();
});

profileDel.addEventListener("click", () => {
  if (state.profiles.length <= 1) return;
  const prof = activeProfile();
  if (!window.confirm(`Delete profile "${prof.name}" and its headers?`)) return;
  state.profiles = state.profiles.filter((p) => p.id !== prof.id);
  state.activeProfileId = state.profiles[0].id;
  save();
  renderProfiles();
  render();
});

// ---- rows ----
function render() {
  listEl.textContent = "";
  const hs = activeHeaders();
  hs.forEach((h, i) => listEl.appendChild(buildRow(h, i)));
  updateStatus();
}

function buildRow(header, index) {
  const row = template.content.firstElementChild.cloneNode(true);
  const toggle = row.querySelector(".row-toggle");
  const nameInput = row.querySelector(".name");
  const valueInput = row.querySelector(".value");
  const descInput = row.querySelector(".desc");
  const urlInput = row.querySelector(".url");
  const opSelect = row.querySelector(".op-select");
  const targetSelect = row.querySelector(".target-select");
  const matchSelect = row.querySelector(".match-select");
  const methodChips = row.querySelector(".chips.methods");
  const typeChips = row.querySelector(".chips.types");
  const deleteBtn = row.querySelector(".delete-btn");

  toggle.checked = header.enabled;
  nameInput.value = header.name;
  valueInput.value = header.value;
  descInput.value = header.description;
  urlInput.value = header.urlPatterns;
  opSelect.value = header.operation;
  targetSelect.value = header.target;
  matchSelect.value = header.matchType;
  row.classList.toggle("disabled", !header.enabled);
  row.classList.toggle("no-value", header.operation === "remove");
  markValidity(nameInput);

  // method chips
  for (const m of METHOD_OPTIONS) {
    const chip = document.createElement("button");
    chip.className = "chip" + (header.methods.includes(m) ? " on" : "");
    chip.textContent = m.toUpperCase();
    chip.addEventListener("click", () => {
      toggleIn(header.methods, m);
      chip.classList.toggle("on");
      save();
    });
    methodChips.appendChild(chip);
  }

  // resource-type chips
  for (const [val, label] of RESOURCE_OPTIONS) {
    const chip = document.createElement("button");
    chip.className = "chip" + (header.resourceTypes.includes(val) ? " on" : "");
    chip.textContent = label;
    chip.addEventListener("click", () => {
      toggleIn(header.resourceTypes, val);
      chip.classList.toggle("on");
      save();
    });
    typeChips.appendChild(chip);
  }

  toggle.addEventListener("change", () => {
    header.enabled = toggle.checked;
    row.classList.toggle("disabled", !toggle.checked);
    save();
  });
  nameInput.addEventListener("input", () => {
    header.name = nameInput.value.trim();
    markValidity(nameInput);
    save();
  });
  valueInput.addEventListener("input", () => {
    header.value = valueInput.value;
    save();
  });
  descInput.addEventListener("input", () => {
    header.description = descInput.value;
    save();
  });
  urlInput.addEventListener("input", () => {
    header.urlPatterns = urlInput.value;
    save();
  });
  opSelect.addEventListener("change", () => {
    header.operation = opSelect.value;
    row.classList.toggle("no-value", header.operation === "remove");
    save();
  });
  targetSelect.addEventListener("change", () => {
    header.target = targetSelect.value;
    save();
  });
  matchSelect.addEventListener("change", () => {
    header.matchType = matchSelect.value;
    save();
  });
  deleteBtn.addEventListener("click", () => {
    activeHeaders().splice(index, 1);
    save();
    render();
  });

  return row;
}

function toggleIn(arr, val) {
  const i = arr.indexOf(val);
  if (i === -1) arr.push(val);
  else arr.splice(i, 1);
}

function markValidity(nameInput) {
  const name = nameInput.value.trim();
  nameInput.classList.toggle(
    "invalid",
    name !== "" && !VALID_HEADER_NAME.test(name)
  );
}

addBtn.addEventListener("click", () => {
  activeHeaders().push(coerceHeader({ enabled: true }));
  save();
  render();
  const rows = listEl.querySelectorAll(".row");
  rows[rows.length - 1].querySelector(".name").focus();
});

masterToggle.addEventListener("change", () => {
  state.masterEnabled = masterToggle.checked;
  document.body.classList.toggle("master-off", !state.masterEnabled);
  save();
});

// ---- paste import ----
pasteBtn.addEventListener("click", () => {
  pastePanel.hidden = !pastePanel.hidden;
  if (!pastePanel.hidden) pasteInput.focus();
});
pasteCancel.addEventListener("click", () => {
  pasteInput.value = "";
  pastePanel.hidden = true;
});
pasteParse.addEventListener("click", () => {
  const parsed = parsePasted(pasteInput.value);
  if (parsed.length === 0) {
    flash("no headers found in pasted text", "err");
    return;
  }
  activeHeaders().push(...parsed);
  save();
  render();
  pasteInput.value = "";
  pastePanel.hidden = true;
  flash(`added ${parsed.length} header${parsed.length === 1 ? "" : "s"}`, "ok");
});

// Parse a `Name: Value` block or a curl command into header objects.
function parsePasted(text) {
  const trimmed = (text || "").trim();
  if (!trimmed) return [];
  const out = [];

  if (/(^|\s)curl(\s|$)/.test(trimmed)) {
    const re = /(?:-H|--header)\s+(['"])([\s\S]*?)\1/g;
    let m;
    while ((m = re.exec(trimmed))) {
      pushPair(out, m[2]);
    }
  } else {
    for (const line of trimmed.split(/\r?\n/)) {
      pushPair(out, line);
    }
  }
  return out;
}

function pushPair(out, raw) {
  const line = (raw || "").trim();
  const idx = line.indexOf(":");
  if (idx <= 0) return; // skip blanks and HTTP/2 pseudo-headers (":authority")
  const name = line.slice(0, idx).trim();
  const value = line.slice(idx + 1).trim();
  if (name) out.push(coerceHeader({ name, value, enabled: true }));
}

// ---- export ----
exportBtn.addEventListener("click", () => {
  const payload = {
    format: "header-injector",
    version: 2,
    masterEnabled: state.masterEnabled,
    activeProfileId: state.activeProfileId,
    profiles: state.profiles
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json"
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "header-injector-export.json";
  a.click();
  URL.revokeObjectURL(url);
  const total = state.profiles.reduce((n, p) => n + p.headers.length, 0);
  flash(`exported ${state.profiles.length} profile(s), ${total} header(s)`, "ok");
});

// ---- file import ----
importBtn.addEventListener("click", () => importFile.click());

importFile.addEventListener("change", async () => {
  const file = importFile.files[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    const msg = importData(data);
    if (!msg) {
      flash("no headers found in file", "err");
    } else {
      save();
      renderProfiles();
      render();
      flash(msg, "ok");
    }
  } catch (e) {
    flash("couldn't parse file — is it valid JSON?", "err");
  } finally {
    importFile.value = "";
  }
});

// Mutates state with imported data; returns a summary string or "" if nothing.
function importData(data) {
  // Our v2 export: bring in the whole profile set as new profiles.
  if (data && data.format === "header-injector" && Array.isArray(data.profiles)) {
    let added = 0;
    let firstId = null;
    for (const p of data.profiles) {
      const id = uid();
      if (!firstId) firstId = id;
      state.profiles.push({
        id,
        name: uniqueName(p.name || "Imported"),
        headers: (p.headers || []).map(coerceHeader)
      });
      added++;
    }
    if (firstId) state.activeProfileId = firstId;
    return added ? `imported ${added} profile${added === 1 ? "" : "s"}` : "";
  }

  // Everything else flattens into the active profile.
  const flat = flattenToHeaders(data);
  if (flat.headers.length === 0) return "";
  activeHeaders().push(...flat.headers);
  return (
    `imported ${flat.headers.length} header${
      flat.headers.length === 1 ? "" : "s"
    } from ${flat.source}` + (flat.note ? ` · ${flat.note}` : "")
  );
}

// v1 self-export, a bare header array, or a profiles-style export from another
// header tool -> a flat list of headers.
function flattenToHeaders(data) {
  if (data && data.format === "header-injector" && Array.isArray(data.headers)) {
    return { headers: data.headers.map(coerceHeader), source: "backup" };
  }
  const arr = Array.isArray(data) ? data : data && data.headers ? [data] : null;
  if (arr) {
    if (arr.some((el) => el && Array.isArray(el.headers))) {
      let skipped = 0;
      const out = [];
      for (const profile of arr) {
        for (const h of profile.headers || []) {
          if (h && h.appendMode) skipped++;
          out.push(
            coerceHeader({
              name: h.name,
              value: h.value,
              enabled: h.enabled !== false,
              description: h.comment || "",
              urlPatterns: profileFilters(profile)
            })
          );
        }
      }
      const note = skipped
        ? `${skipped} append-mode header${skipped === 1 ? "" : "s"} imported as set`
        : "";
      return { headers: out, source: "profile export", note };
    }
    if (arr.some((el) => el && "name" in el && "value" in el)) {
      return { headers: arr.map(coerceHeader), source: "backup" };
    }
  }
  return { headers: [], source: "" };
}

function profileFilters(profile) {
  const filters = profile.urlFilters || [];
  return filters
    .filter((f) => f && f.enabled !== false && typeof f.urlRegex === "string")
    .map((f) => f.urlRegex.trim())
    .filter(Boolean)
    .join(", ");
}

function uniqueName(base) {
  let name = base;
  let n = 2;
  const taken = new Set(state.profiles.map((p) => p.name));
  while (taken.has(name)) name = `${base} ${n++}`;
  return name;
}

// ---- debug: what fired on this tab ----
debugEl.addEventListener("toggle", () => {
  if (debugEl.open) refreshDebug();
});
debugRefresh.addEventListener("click", refreshDebug);

async function refreshDebug() {
  debugList.className = "debug-list empty";
  debugList.textContent = "";
  const li = (t) => {
    const el = document.createElement("li");
    el.innerHTML = t;
    debugList.appendChild(el);
  };

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) {
    li("no active tab");
    return;
  }

  let matched;
  try {
    const res = await chrome.declarativeNetRequest.getMatchedRules({
      tabId: tab.id
    });
    matched = res.rulesMatchedInfo || [];
  } catch (e) {
    li("matched-rule info unavailable");
    return;
  }

  const { ruleMap = {} } = await chrome.storage.session.get("ruleMap");
  const seen = new Set();
  const ids = [];
  for (const info of matched) {
    const id = info.rule.ruleId;
    if (!seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
  }

  if (ids.length === 0) {
    li("nothing matched yet — reload the tab, then refresh");
    return;
  }

  debugList.className = "debug-list";
  for (const id of ids) {
    const info = ruleMap[id];
    if (info) {
      const label = info.description
        ? `${info.name} — ${info.description}`
        : info.name;
      li(
        `<span class="tag">${info.target}·${info.operation}</span> ${escapeHtml(
          label
        )}`
      );
    } else {
      li(`<span class="tag">rule</span> #${id}`);
    }
  }
}

function escapeHtml(s) {
  return String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      })[c]
  );
}

// ---- flash ----
let flashTimer;
function flash(text, kind) {
  ioMsg.textContent = text;
  ioMsg.className = "io-msg " + (kind || "");
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => {
    ioMsg.textContent = "";
    ioMsg.className = "io-msg";
  }, 4000);
}

load();
