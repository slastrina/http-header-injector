const VALID_HEADER_NAME = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;

const listEl = document.getElementById("header-list");
const template = document.getElementById("row-template");
const addBtn = document.getElementById("add-btn");
const masterToggle = document.getElementById("master-toggle");
const statusLine = document.getElementById("status-line");
const emptyHint = document.getElementById("empty-hint");
const importBtn = document.getElementById("import-btn");
const exportBtn = document.getElementById("export-btn");
const importFile = document.getElementById("import-file");
const ioMsg = document.getElementById("io-msg");

let headers = [];
let masterEnabled = true;

async function load() {
  const stored = await chrome.storage.sync.get(["headers", "masterEnabled"]);
  headers = stored.headers ?? [];
  masterEnabled = stored.masterEnabled ?? true;
  masterToggle.checked = masterEnabled;
  document.body.classList.toggle("master-off", !masterEnabled);
  render();
}

function save() {
  chrome.storage.sync.set({ headers, masterEnabled });
  updateStatus();
}

function updateStatus() {
  const active = masterEnabled
    ? headers.filter((h) => h.enabled && VALID_HEADER_NAME.test(h.name)).length
    : 0;
  statusLine.textContent = masterEnabled ? `${active} ACTIVE` : "BYPASSED";
  statusLine.classList.toggle("live", active > 0);
  emptyHint.classList.toggle("visible", headers.length === 0);
}

function render() {
  listEl.textContent = "";
  headers.forEach((h, i) => listEl.appendChild(buildRow(h, i)));
  updateStatus();
}

function buildRow(header, index) {
  const row = template.content.firstElementChild.cloneNode(true);
  const toggle = row.querySelector(".row-toggle");
  const nameInput = row.querySelector(".name");
  const valueInput = row.querySelector(".value");
  const descInput = row.querySelector(".desc");
  const urlInput = row.querySelector(".url");
  const deleteBtn = row.querySelector(".delete-btn");

  toggle.checked = header.enabled;
  nameInput.value = header.name;
  valueInput.value = header.value;
  descInput.value = header.description ?? "";
  urlInput.value = header.urlPatterns ?? "";
  row.classList.toggle("disabled", !header.enabled);
  markValidity(nameInput);

  toggle.addEventListener("change", () => {
    headers[index].enabled = toggle.checked;
    row.classList.toggle("disabled", !toggle.checked);
    save();
  });

  nameInput.addEventListener("input", () => {
    headers[index].name = nameInput.value.trim();
    markValidity(nameInput);
    save();
  });

  valueInput.addEventListener("input", () => {
    headers[index].value = valueInput.value;
    save();
  });

  descInput.addEventListener("input", () => {
    headers[index].description = descInput.value;
    save();
  });

  urlInput.addEventListener("input", () => {
    headers[index].urlPatterns = urlInput.value;
    save();
  });

  deleteBtn.addEventListener("click", () => {
    headers.splice(index, 1);
    save();
    render();
  });

  return row;
}

function markValidity(nameInput) {
  const name = nameInput.value.trim();
  nameInput.classList.toggle("invalid", name !== "" && !VALID_HEADER_NAME.test(name));
}

addBtn.addEventListener("click", () => {
  headers.push({ name: "", value: "", enabled: true, description: "", urlPatterns: "" });
  save();
  render();
  const rows = listEl.querySelectorAll(".row");
  rows[rows.length - 1].querySelector(".name").focus();
});

masterToggle.addEventListener("change", () => {
  masterEnabled = masterToggle.checked;
  document.body.classList.toggle("master-off", !masterEnabled);
  save();
});

// ---- export ----

exportBtn.addEventListener("click", () => {
  const payload = {
    format: "header-injector",
    version: 1,
    masterEnabled,
    headers
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
  flash(`exported ${headers.length} header${headers.length === 1 ? "" : "s"}`, "ok");
});

// ---- import ----

importBtn.addEventListener("click", () => importFile.click());

importFile.addEventListener("change", async () => {
  const file = importFile.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    const result = normalizeImport(data);
    if (result.headers.length === 0) {
      flash("no headers found in file", "err");
    } else {
      headers.push(...result.headers);
      save();
      render();
      flash(
        `imported ${result.headers.length} from ${result.source}` +
          (result.note ? ` · ${result.note}` : ""),
        "ok"
      );
    }
  } catch (e) {
    flash("couldn't parse file — is it valid JSON?", "err");
  } finally {
    importFile.value = "";
  }
});

// Accepts either this extension's own export or a profiles-style export from
// another header tool, and returns a normalized { headers, source, note }.
function normalizeImport(data) {
  // Our own format: { format: "header-injector", headers: [...] }
  if (data && data.format === "header-injector" && Array.isArray(data.headers)) {
    return { headers: data.headers.map(coerceHeader), source: "backup" };
  }

  // A bare array — either our headers or profile objects from another tool.
  const arr = Array.isArray(data) ? data : data && data.headers ? [data] : null;
  if (arr) {
    // Profiles: array of objects that themselves contain `headers`.
    if (arr.some((el) => el && Array.isArray(el.headers))) {
      let skipped = 0;
      const out = [];
      for (const profile of arr) {
        for (const h of profile.headers || []) {
          if (h && h.appendMode) skipped++;
          out.push({
            name: h.name || "",
            value: h.value || "",
            enabled: h.enabled !== false,
            description: h.comment || "",
            urlPatterns: profileFilters(profile)
          });
        }
      }
      const note = skipped
        ? `${skipped} append-mode header${skipped === 1 ? "" : "s"} imported as set`
        : "";
      return { headers: out, source: "profile export", note };
    }

    // Otherwise treat as a bare array of our own header objects.
    if (arr.some((el) => el && "name" in el && "value" in el)) {
      return { headers: arr.map(coerceHeader), source: "backup" };
    }
  }

  return { headers: [] };
}

// Some tools store URL scoping as profile-level regex filters, which don't map
// cleanly onto our wildcard patterns — pull any plain-text ones through and
// leave the rest blank (all sites).
function profileFilters(profile) {
  const filters = profile.urlFilters || [];
  return filters
    .filter((f) => f && f.enabled !== false && typeof f.urlRegex === "string")
    .map((f) => f.urlRegex.trim())
    .filter(Boolean)
    .join(", ");
}

function coerceHeader(h) {
  return {
    name: (h && h.name) || "",
    value: (h && h.value) || "",
    enabled: !h || h.enabled !== false,
    description: (h && h.description) || "",
    urlPatterns: (h && h.urlPatterns) || ""
  };
}

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
