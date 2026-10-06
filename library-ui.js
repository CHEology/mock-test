"use strict";
const L = window.MockTestLibrary;
let libraryLocation = "category-default",
  libraryQuery = "",
  librarySelection = new Set(),
  sidebarHidden = false,
  sidebarPeek = false,
  sidebarHideTimer;
try {
  sidebarHidden = localStorage.getItem("mock-sidebar-hidden") === "true";
  libraryLocation =
    sessionStorage.getItem("mock-library-location") || libraryLocation;
} catch (_) {}
const libIcon = (kind) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">${kind === "folder" ? '<path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v10H3z"/>' : kind === "category" ? '<rect x="4" y="3" width="16" height="18" rx="3"/><path d="M8 8h8M8 12h8M8 16h4"/>' : '<path d="M6 3h8l4 4v14H6zM14 3v5h4M9 12h6M9 16h6"/>'}</svg>`;
const libItem = (id) => db.library.find((r) => r.id === id);
const libVisible = (r) => L.visible(db.library, r);
function syncLibrary() {
  db.library = L.seed(
    db.library,
    BASE_DATA,
    window.MOCK_TEST_CATEGORY || "Practice",
  );
  DATA = [
    ...BASE_DATA,
    ...db.library
      .filter((r) => r.kind === "test" && r.content)
      .map((r) => ({ ...r.content, id: r.testId })),
  ];
}
function libraryCommit() {
  syncLibrary();
  librarySelection.clear();
  closeModal();
  closeLibraryMenu();
  save(false);
  renderHome();
}
function libraryNavigate(id) {
  closeLibraryMenu();
  libraryLocation = id;
  libraryQuery = "";
  librarySelection.clear();
  renderHome();
}
function libraryPath(r) {
  const parent = libItem(r.parent);
  return parent
    ? `${parent.kind === "folder" ? `${libItem(parent.parent)?.name || ""} / ` : ""}${parent.name}`
    : "";
}
function libraryMenu(r) {
  return `<button class="item-more quiet" data-lib-menu="${esc(r.id)}" aria-label="Manage ${esc(r.name)}" aria-haspopup="menu" aria-expanded="false">···</button>`;
}
function libraryShell(content, location) {
  const current = libItem(location),
    category = current?.kind === "folder" ? libItem(current.parent) : current;
  const categories = db.library.filter(
    (r) => r.kind === "category" && libVisible(r),
  );
  const toggle = `<button class="sidebar-toggle quiet" data-sidebar-toggle aria-label="${sidebarHidden ? "Pin sidebar" : "Auto-hide sidebar"}" aria-pressed="${!sidebarHidden}" aria-controls="library-sidebar" title="${sidebarHidden ? "Pin sidebar" : "Auto-hide sidebar"}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/></svg></button>`;
  return `<div class="library-shell ${sidebarHidden ? `sidebar-hidden ${sidebarPeek ? "sidebar-peeking" : ""}` : ""}"><div class="sidebar-edge" tabindex="0" aria-label="Show navigation" ${sidebarHidden ? "" : "hidden"}></div><aside class="library-sidebar" id="library-sidebar" ${sidebarHidden && !sidebarPeek ? "inert" : ""}><div class="sidebar-heading"><div class="brand"><b>M</b>Mock Test</div>${toggle}</div><nav aria-label="Library"><button class="side-link ${location === "all" && screen !== "history" ? "chosen" : ""}" data-lib-open="all">Library</button><div class="side-section"><span>Categories</span><button class="quiet icon-button" data-lib-new="category" aria-label="New category">+</button></div>${categories
    .map(
      (r) =>
        `<button class="side-link ${category?.id === r.id ? "chosen" : ""}" data-lib-open="${esc(r.id)}">${libIcon("category")}<span>${esc(r.name)}</span></button><div class="side-folders">${db.library
          .filter(
            (f) => f.kind === "folder" && f.parent === r.id && libVisible(f),
          )
          .map(
            (f) =>
              `<button class="side-link" data-lib-open="${esc(f.id)}">${libIcon("folder")}<span>${esc(f.name)}</span></button>`,
          )
          .join("")}</div>`,
    )
    .join(
      "",
    )}<div class="side-bottom"><button class="side-link ${screen === "history" && historyGroup === "all" ? "chosen" : ""}" data-action="history">Attempts</button><button class="side-link ${screen === "settings" ? "chosen" : ""}" data-action="settings">Settings</button><button class="side-link ${screen === "help" ? "chosen" : ""}" data-action="help">Help</button></div></nav></aside><main class="library-main ${screen === "history" ? "library-history" : ""}"><div class="library-topline"><nav class="breadcrumbs" aria-label="Breadcrumb"><button data-lib-open="all">Library</button>${category ? `<span>/</span><button data-lib-open="${esc(category.id)}" ${current?.kind === "category" ? 'aria-current="page"' : ""}>${esc(category.name)}</button>` : ""}${current?.kind === "folder" ? `<span>/</span><button data-lib-open="${esc(current.id)}" aria-current="page">${esc(current.name)}</button>` : ""}${["settings", "help"].includes(location) ? `<span>/</span><span aria-current="page">${location === "settings" ? "Settings" : "Help"}</span>` : ""}</nav></div>${content}</main></div>`;
}
function libraryTabs(location, attempts = false) {
  const current = libItem(location);
  if (!current || !["category", "folder"].includes(current.kind)) return "";
  return `<nav class="library-tabs" aria-label="${esc(current.name)} views"><button data-lib-open="${esc(location)}" ${!attempts ? 'aria-current="page"' : ""}>${current.kind === "category" ? "Contents" : "Tests"}</button><button data-group-attempts="${esc(location)}" ${attempts ? 'aria-current="page"' : ""}>Attempts</button></nav>`;
}
function peekLibrarySidebar(show) {
  clearTimeout(sidebarHideTimer);
  sidebarHideTimer = null;
  if (!sidebarHidden) return;
  sidebarPeek = show;
  const shell = $(".library-shell"),
    sidebar = $("#library-sidebar");
  if (!shell || !sidebar) return;
  if (!show && sidebar.contains(document.activeElement))
    document.activeElement.blur();
  shell.classList.toggle("sidebar-peeking", show);
  sidebar.inert = !show;
}
function setLibrarySidebar(hidden, persist = true) {
  clearTimeout(sidebarHideTimer);
  sidebarHideTimer = null;
  sidebarHidden = hidden;
  sidebarPeek = false;
  try {
    if (persist)
      localStorage.setItem("mock-sidebar-hidden", String(sidebarHidden));
  } catch (_) {}
  const shell = $(".library-shell"),
    sidebar = $("#library-sidebar");
  if (!shell || !sidebar) return;
  shell.classList.toggle("sidebar-hidden", sidebarHidden);
  shell.classList.remove("sidebar-peeking");
  if (sidebarHidden && sidebar.contains(document.activeElement))
    document.activeElement.blur();
  sidebar.inert = sidebarHidden;
  $(".sidebar-edge").hidden = !sidebarHidden;
  const button = $("[data-sidebar-toggle]");
  button.setAttribute("aria-pressed", String(!sidebarHidden));
  button.setAttribute(
    "aria-label",
    sidebarHidden ? "Pin sidebar" : "Auto-hide sidebar",
  );
  button.title = sidebarHidden ? "Pin sidebar" : "Auto-hide sidebar";
  if ($("#setting-sidebar")) $("#setting-sidebar").checked = !sidebarHidden;
}
function toggleLibrarySidebar() {
  setLibrarySidebar(!sidebarHidden);
}
document.addEventListener("pointermove", (e) => {
  if (!sidebarHidden || !$(".library-shell") || e.pointerType === "touch")
    return;
  const sidebar = $("#library-sidebar");
  if (
    e.clientX <= 12 ||
    (sidebarPeek && e.clientX <= sidebar.getBoundingClientRect().right + 16)
  ) {
    peekLibrarySidebar(true);
  } else if (sidebarPeek && !sidebarHideTimer) {
    sidebarHideTimer = setTimeout(() => {
      sidebarHideTimer = null;
      peekLibrarySidebar(false);
    }, 180);
  }
});
document.documentElement.addEventListener("pointerleave", () =>
  peekLibrarySidebar(false),
);
document.addEventListener("focusin", (e) => {
  if (e.target.matches(".sidebar-edge")) peekLibrarySidebar(true);
  else if (sidebarHidden && !e.target.closest("#library-sidebar"))
    peekLibrarySidebar(false);
});
document.addEventListener("pointerdown", (e) => {
  if (e.target.matches(".sidebar-edge")) peekLibrarySidebar(true);
  else if (sidebarHidden && !e.target.closest("#library-sidebar"))
    peekLibrarySidebar(false);
});

function renderLibrary() {
  closeLibraryMenu();
  if (libraryLocation !== "all" && !libVisible(libItem(libraryLocation)))
    libraryLocation = "all";
  try {
    sessionStorage.setItem("mock-library-location", libraryLocation);
  } catch (_) {}
  const current = libItem(libraryLocation);
  let items = db.library.filter(
    (r) =>
      libVisible(r) &&
      (libraryLocation === "all"
        ? r.kind === "category"
        : r.parent === libraryLocation),
  );
  if (libraryQuery.trim()) {
    const query = libraryQuery.trim().toLowerCase();
    items = db.library.filter(
      (r) =>
        libVisible(r) &&
        r.name.toLowerCase().includes(query) &&
        (libraryLocation === "all" ||
          r.parent === libraryLocation ||
          (current?.kind === "category" &&
            libItem(r.parent)?.parent === libraryLocation)),
    );
  }
  items.sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { numeric: true }),
  );
  librarySelection = new Set(
    [...librarySelection].filter((id) => items.some((r) => r.id === id)),
  );
  const title = libraryLocation === "all" ? "Library" : current.name;
  app.innerHTML = libraryShell(
    `<header class="library-heading row spread"><h1>${esc(title)}</h1><div class="row">${current ? libraryMenu(current) : ""}${libraryLocation === "all" ? '<button class="primary" data-lib-new="category">+ Category</button>' : current?.kind === "category" ? '<button data-lib-new="folder">+ Folder</button><button class="primary" data-lib-add>Add test</button>' : current?.kind === "folder" ? '<button class="primary" data-lib-add>Add test</button>' : ""}</div></header>${libraryTabs(libraryLocation)}<div class="library-tools row spread"><input type="search" id="library-search" aria-label="Search library" placeholder="Search${current ? " in " + esc(current.name) : ""}" value="${esc(libraryQuery)}"><div class="row" id="library-selection-actions">${librarySelectionHTML()}</div></div><div class="library-items ${items.every((r) => r.kind === "category" || r.kind === "folder") && items.length ? "folder-grid" : "file-list"}">${items.map((r) => libraryItemHTML(r)).join("") || `<div class="library-empty">${libraryQuery ? "No matches." : current?.kind === "folder" ? "No tests yet." : libraryLocation === "all" ? "No categories yet." : "No items yet."}</div>`}</div>`,
    libraryLocation,
  );
}
function librarySelectionHTML() {
  if (!librarySelection.size) return "";
  const canMove = [...librarySelection].every(
    (id) => libItem(id)?.kind !== "category",
  );
  return `${librarySelection.size > 1 ? `<button data-lib-bulk="move" ${canMove ? "" : "disabled"}>Move</button><button class="danger quiet" data-lib-bulk="delete">Delete</button>` : ""}<span>${librarySelection.size} selected</span>`;
}
function libraryItemHTML(r) {
  const isTest = r.kind === "test";
  const t = isTest ? DATA.find((t) => t.id === r.testId) : null;
  const attempts = isTest ? db.attempts.filter((a) => a.test === r.testId) : [];
  const open = attempts.findLast((a) => a.status !== "done"),
    last = attempts.findLast((a) => a.status === "done");
  const status = open
    ? attemptStatus(open)
    : last
      ? t.sections.length
        ? `Latest ${attemptScore(last)}`
        : "Writing saved"
      : "";
  return `<article class="library-item ${isTest ? "test-file" : "folder-card"} ${librarySelection.has(r.id) ? "selected" : ""}" data-lib-item="${esc(r.id)}" tabindex="0" aria-label="${esc(r.name)}" aria-selected="${librarySelection.has(r.id)}"><div class="item-icon ${r.kind}">${libIcon(r.kind)}</div><div class="item-title">${isTest ? `<h2>${esc(r.name)}</h2>` : `<button class="folder-open" data-lib-open="${esc(r.id)}">${esc(r.name)}</button>`}${libraryQuery && libraryPath(r) ? `<span class="muted">${esc(libraryPath(r))}</span>` : status ? `<span class="muted">${esc(status)}</span>` : ""}</div><div class="item-actions row">${isTest && t ? `${attempts.length ? `<button class="quiet" data-history="${r.testId}">${attempts.length} ${attempts.length === 1 ? "attempt" : "attempts"}</button>` : ""}${open ? `<button class="primary" data-resume="${open.id}">Resume</button>` : `<button class="primary" data-start="${r.testId}">${last ? "Try again" : "Start"}</button>`}` : ""}${libraryMenu(r)}</div></article>`;
}
function libraryNameDialog(kind, id) {
  const item = id ? libItem(id) : null;
  libraryPanel(
    `<form id="library-name-form"><h2>${item ? "Rename" : `New ${kind}`}</h2><label class="field">Name<input id="library-name" required maxlength="80" value="${esc(item?.name || "")}" autofocus></label><div class="dialog-actions"><button type="button" data-action="close">Cancel</button><button class="primary">${item ? "Save" : "Create"}</button></div></form>`,
  );
  $("#library-name-form").onsubmit = (e) => {
    e.preventDefault();
    const name = $("#library-name").value.trim();
    if (!name) return;
    const parent =
      item?.parent || (kind === "category" ? null : libraryLocation);
    if (
      db.library.some(
        (r) =>
          r.id !== id &&
          r.parent === parent &&
          r.kind === kind &&
          libVisible(r) &&
          r.name.toLowerCase() === name.toLowerCase(),
      )
    ) {
      notify("That name is already in use here.");
      return;
    }
    if (item) Object.assign(libItem(id), { name, updated: Date.now() });
    else {
      const created = {
        id: crypto.randomUUID(),
        kind,
        name,
        parent,
        updated: Date.now(),
        deleted: false,
      };
      db.library.push(created);
      libraryLocation = created.id;
      libraryQuery = "";
    }
    libraryCommit();
  };
}
function libraryItemMenu(id, anchor) {
  const r = libItem(id);
  libraryContextMenu(
    anchor,
    `<button role="menuitem" data-lib-rename="${esc(id)}">Rename</button>${r.kind !== "category" ? `<button role="menuitem" data-lib-move="${esc(id)}">Move to…</button>` : ""}${r.kind === "test" ? `<button role="menuitem" data-lib-copy="${esc(id)}">Create a copy or practice…</button><button role="menuitem" data-lib-export="${esc(id)}">Export test</button>` : ""}<button role="menuitem" class="danger" data-lib-delete="${esc(id)}">Delete…</button>`,
  );
}
function libraryMoveDialog(ids) {
  const kinds = new Set(ids.map((id) => libItem(id)?.kind));
  if (kinds.has("category")) {
    notify("Categories stay at the library root.");
    return;
  }
  const targetKind = kinds.has("folder") ? "category" : "folder";
  const destinations = db.library.filter(
    (r) =>
      (r.kind === "category" ||
        (targetKind === "folder" && r.kind === "folder")) &&
      libVisible(r),
  );
  if (!destinations.length) {
    notify(`Create a ${targetKind} first.`);
    return;
  }
  libraryPanel(
    `<form id="library-move-form"><h2>Move to</h2><label class="field">Destination<select id="library-destination">${destinations.map((r) => `<option value="${esc(r.id)}" ${r.id === libItem(ids[0]).parent ? "selected" : ""}>${esc(r.kind === "folder" ? `${libItem(r.parent).name} / ${r.name}` : r.name)}</option>`).join("")}</select></label><div class="dialog-actions"><button type="button" data-action="close">Cancel</button><button class="primary">Move</button></div></form>`,
  );
  $("#library-move-form").onsubmit = (e) => {
    e.preventDefault();
    const target = $("#library-destination").value;
    db.library = L.move(db.library, ids, target);
    libraryLocation = target;
    libraryQuery = "";
    libraryCommit();
  };
}
function libraryDeleteDialog(ids) {
  const items = ids.map(libItem).filter((r) => r && libVisible(r));
  if (!items.length) return;
  closeLibraryMenu();
  dialog(
    `<h2>Delete ${items.length === 1 ? esc(items[0].name) : `${items.length} items`}?</h2><p>${items.some((r) => r.kind !== "test") ? "Everything inside will also be removed. " : ""}This cannot be undone. Saved attempts will be kept.</p><div class="dialog-actions"><button data-action="close">Cancel</button><button class="danger" id="confirm-library-delete">Delete</button></div>`,
  );
  $("#confirm-library-delete").onclick = () => {
    db.library = L.remove(
      db.library,
      items.map((r) => r.id),
    );
    libraryCommit();
    notify("Deleted.");
  };
}
function addLibraryTest(content, name, parent) {
  let id = Date.now();
  while (
    DATA.some((t) => t.id === id) ||
    db.library.some((r) => r.testId === id)
  )
    id++;
  db.library.push({
    id: crypto.randomUUID(),
    kind: "test",
    name,
    parent,
    testId: id,
    content: { ...content, id },
    updated: Date.now(),
    deleted: false,
  });
}
function libraryAddDialog(anchor) {
  libraryContextMenu(
    anchor,
    '<button role="menuitem" id="new-writing">Writing task</button><button role="menuitem" id="import-tests">Import test files</button>',
  );
  $("#new-writing").onclick = () => libraryWritingDialog();
  $("#import-tests").onclick = () => libraryImportDialog();
}
function libraryWritingDialog() {
  libraryPanel(
    `<form id="writing-form"><h2>New writing task</h2><label class="field">Name<input id="writing-name" maxlength="80" required autofocus></label><label class="field">Prompt<textarea id="writing-prompt" rows="6" required></textarea></label><label class="field">Minutes<input id="writing-minutes" type="number" min="1" max="1440" value="30" required></label><div class="dialog-actions"><button type="button" data-action="close">Cancel</button><button class="primary">Create</button></div></form>`,
  );
  $("#writing-form").onsubmit = (e) => {
    e.preventDefault();
    const name = $("#writing-name").value.trim(),
      essay = $("#writing-prompt").value.trim();
    if (!name || !essay) return;
    addLibraryTest(
      { sections: [], essay, essayMinutes: +$("#writing-minutes").value },
      name,
      libraryLocation,
    );
    libraryCommit();
  };
}
function libraryCopyDialog(id) {
  const r = libItem(id),
    t = DATA.find((t) => t.id === r.testId);
  const folders = db.library.filter(
    (r) => ["folder", "category"].includes(r.kind) && libVisible(r),
  );
  libraryPanel(
    `<form id="copy-form"><h2>Create practice</h2><label class="field">Name<input id="copy-name" required maxlength="80" value="${esc(r.name)} — copy"></label><label class="field">Folder<select id="copy-folder">${folders.map((f) => `<option value="${esc(f.id)}" ${f.id === r.parent ? "selected" : ""}>${esc(f.kind === "folder" ? libItem(f.parent).name + " / " + f.name : f.name)}</option>`).join("")}</select></label><div class="copy-sections">${t.essay ? '<label><input type="checkbox" id="copy-writing" checked> Writing</label>' : ""}${t.sections.map((s, i) => `<label><input type="checkbox" data-copy-section="${i}" checked> ${esc(s.label)}</label>`).join("")}</div><div class="dialog-actions"><button type="button" data-action="close">Cancel</button><button class="primary">Create</button></div></form>`,
  );
  $("#copy-form").onsubmit = (e) => {
    e.preventDefault();
    const indices = [
        ...document.querySelectorAll("[data-copy-section]:checked"),
      ].map((el) => +el.dataset.copySection),
      writing = !!$("#copy-writing")?.checked;
    if (!writing && !indices.length) {
      notify("Select a section or writing.");
      return;
    }
    const content = JSON.parse(JSON.stringify(t));
    content.sections = indices.map((i) => content.sections[i]);
    if (!writing) delete content.essay;
    const folder = $("#copy-folder").value;
    addLibraryTest(content, $("#copy-name").value.trim() || r.name, folder);
    libraryLocation = folder;
    libraryQuery = "";
    libraryCommit();
  };
}
function downloadJSON(value, name) {
  const url = URL.createObjectURL(
      new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }),
    ),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}
async function libraryExport(id) {
  const r = libItem(id),
    t = JSON.parse(JSON.stringify(DATA.find((t) => t.id === r.testId)));
  t.title = r.name;
  try {
    for (const q of t.sections.flatMap((s) => s.questions))
      if (q.image && !q.image.startsWith("data:")) {
        const response = await fetch(q.image);
        if (!response.ok) throw Error("Unable to export an image.");
        q.image = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = reject;
          response
            .blob()
            .then((blob) => reader.readAsDataURL(blob))
            .catch(reject);
        });
      }
    downloadJSON(t, `${r.name.replace(/[\\/:*?"<>|]/g, "-")}.json`);
    closeLibraryMenu();
  } catch (e) {
    notify(e.message || "Export failed.");
  }
}
function libraryImportDialog() {
  libraryPanel(
    '<form id="import-form"><h2>Import tests</h2><label class="field">JSON test files<input id="test-files" type="file" accept=".json,application/json" multiple required></label><p id="import-error" role="alert"></p><div class="dialog-actions"><button type="button" id="test-template" class="quiet">Example file</button><button type="button" data-action="close">Cancel</button><button class="primary">Import</button></div></form>',
  );
  $("#test-template").onclick = () =>
    downloadJSON(
      {
        title: "Sample test",
        sections: [
          {
            label: "Section 1",
            minutes: 10,
            questions: [
              {
                id: "sample-1",
                number: 1,
                type: "single",
                count: 3,
                key: "B",
                text: "What is 2 + 3?",
                labels: ["4", "5", "6"],
              },
            ],
          },
        ],
      },
      "sample-test.json",
    );
  $("#import-form").onsubmit = async (e) => {
    e.preventDefault();
    const button = e.submitter;
    button.disabled = true;
    try {
      const files = [...$("#test-files").files],
        incoming = [];
      if (files.reduce((sum, f) => sum + f.size, 0) > 15000000)
        throw Error("Import up to 15 MB at a time.");
      for (const file of files) {
        const parsed = JSON.parse(await file.text());
        const tests = Array.isArray(parsed) ? parsed : parsed.tests || [parsed];
        if (!Array.isArray(tests) || !tests.length)
          throw Error("The file contains no tests.");
        for (const t of tests) incoming.push(L.validateTest(t));
      }
      if (!incoming.length) throw Error("Choose a test file.");
      if (
        JSON.stringify(db).length + JSON.stringify(incoming).length >
        25000000
      )
        throw Error(
          "This library is too large for one save. Import fewer tests.",
        );
      for (const t of incoming)
        addLibraryTest(
          t,
          String(t.title || "Imported test").slice(0, 80),
          libraryLocation,
        );
      libraryCommit();
      notify(
        `${incoming.length} ${incoming.length === 1 ? "test" : "tests"} imported.`,
      );
    } catch (error) {
      $("#import-error").textContent =
        error instanceof SyntaxError
          ? "This file is not valid JSON."
          : error.message;
      button.disabled = false;
    }
  };
}
document.addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  if (b.hasAttribute("data-lib-cancel")) renderHome();
  else if (b.hasAttribute("data-sidebar-toggle")) toggleLibrarySidebar();
  else if (b.dataset.groupAttempts) groupHistory(b.dataset.groupAttempts);
  else if (b.dataset.libOpen) libraryNavigate(b.dataset.libOpen);
  else if (b.dataset.libNew) libraryNameDialog(b.dataset.libNew);
  else if (b.dataset.libMenu) libraryItemMenu(b.dataset.libMenu, b);
  else if (b.dataset.libRename)
    libraryNameDialog(libItem(b.dataset.libRename).kind, b.dataset.libRename);
  else if (b.dataset.libMove) libraryMoveDialog([b.dataset.libMove]);
  else if (b.dataset.libDelete) libraryDeleteDialog([b.dataset.libDelete]);
  else if (b.dataset.libCopy) libraryCopyDialog(b.dataset.libCopy);
  else if (b.dataset.libExport) libraryExport(b.dataset.libExport);
  else if (b.hasAttribute("data-lib-add")) libraryAddDialog(b);
  else if (b.dataset.libBulk) {
    const ids = [...librarySelection];
    if (b.dataset.libBulk === "move") libraryMoveDialog(ids);
    else if (b.dataset.libBulk === "delete") libraryDeleteDialog(ids);
    else {
      librarySelection.clear();
      renderHome();
    }
  }
});
document.addEventListener("input", (e) => {
  if (e.target.id === "library-search") {
    const position = e.target.selectionStart;
    libraryQuery = e.target.value;
    renderHome();
    $("#library-search").focus();
    if (position !== null)
      try {
        $("#library-search").setSelectionRange(position, position);
      } catch (_) {}
  }
});

let libraryGesture = null,
  libraryMenuAnchor = null,
  librarySuppressClick = false;
function closeLibraryMenu() {
  $("#library-context-menu")?.remove();
  libraryMenuAnchor?.setAttribute("aria-expanded", "false");
  libraryMenuAnchor = null;
}
function libraryContextMenu(anchor, content) {
  if (libraryMenuAnchor === anchor) {
    closeLibraryMenu();
    return;
  }
  closeLibraryMenu();
  libraryMenuAnchor = anchor;
  anchor.setAttribute("aria-expanded", "true");
  const menu = document.createElement("div");
  menu.id = "library-context-menu";
  menu.className = "library-context-menu";
  menu.setAttribute("role", "menu");
  menu.innerHTML = content;
  document.body.append(menu);
  const rect = anchor.getBoundingClientRect();
  menu.style.left =
    Math.max(
      8,
      Math.min(
        rect.right - menu.offsetWidth,
        innerWidth - menu.offsetWidth - 8,
      ),
    ) + "px";
  menu.style.top =
    Math.max(
      8,
      rect.bottom + menu.offsetHeight + 6 <= innerHeight
        ? rect.bottom + 6
        : rect.top - menu.offsetHeight - 6,
    ) + "px";
  menu.querySelector("button")?.focus();
}
function libraryPanel(html) {
  closeLibraryMenu();
  closeModal();
  screen = "library-edit";
  app.innerHTML = libraryShell(
    `<div class="content-page library-editor">${html.replaceAll('data-action="close"', "data-lib-cancel")}</div>`,
    libraryLocation,
  );
  $("[autofocus]")?.focus();
}
function paintLibrarySelection() {
  document.querySelectorAll("[data-lib-item]").forEach((el) => {
    const selected = librarySelection.has(el.dataset.libItem);
    el.classList.toggle("selected", selected);
    el.setAttribute("aria-selected", String(selected));
  });
  if ($("#library-selection-actions"))
    $("#library-selection-actions").innerHTML = librarySelectionHTML();
}
function libraryCanDrop(ids, target) {
  try {
    L.move(db.library, ids, target);
    return ids.some((id) => libItem(id)?.parent !== target);
  } catch (_) {
    return false;
  }
}
function finishLibraryGesture(cancel = false) {
  const g = libraryGesture;
  if (!g) return;
  clearTimeout(g.hoverTimer);
  cancelAnimationFrame(g.frame);
  if (document.documentElement.hasPointerCapture(g.pointerId))
    document.documentElement.releasePointerCapture(g.pointerId);
  libraryGesture = null;
  document.body.classList.remove("library-dragging", "library-selecting");
  $("#library-drag-preview")?.remove();
  $("#library-marquee")?.remove();
  document
    .querySelectorAll(".drop-target")
    .forEach((el) => el.classList.remove("drop-target"));
  if (g.moved) {
    librarySuppressClick = true;
    setTimeout(() => {
      librarySuppressClick = false;
    }, 0);
  }
  if (cancel) {
    librarySelection = g.before;
    paintLibrarySelection();
  } else if (
    g.mode === "move" &&
    g.moved &&
    g.destination &&
    libraryCanDrop(g.ids, g.destination)
  ) {
    db.library = L.move(db.library, g.ids, g.destination);
    libraryCommit();
  }
  if (sidebarHidden) peekLibrarySidebar(false);
}
function updateLibraryGesture() {
  const g = libraryGesture;
  if (!g?.moved) return;
  if (g.mode === "box") {
    const top = g.startY - (scrollY - g.scrollY),
      left = Math.min(g.startX, g.x),
      right = Math.max(g.startX, g.x),
      y1 = Math.min(top, g.y),
      y2 = Math.max(top, g.y);
    Object.assign($("#library-marquee").style, {
      left: left + "px",
      top: y1 + "px",
      width: right - left + "px",
      height: y2 - y1 + "px",
    });
    const selected = new Set(g.additive ? g.before : []);
    document.querySelectorAll("[data-lib-item]").forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.left < right && r.right > left && r.top < y2 && r.bottom > y1)
        selected.add(el.dataset.libItem);
    });
    librarySelection = selected;
    paintLibrarySelection();
  } else {
    const preview = $("#library-drag-preview");
    preview.style.left =
      Math.min(g.x + 16, innerWidth - preview.offsetWidth - 8) + "px";
    preview.style.top = Math.min(g.y + 16, innerHeight - 50) + "px";
    if (sidebarHidden) {
      const edge = $("#library-sidebar")?.getBoundingClientRect().right || 0;
      peekLibrarySidebar(g.x <= 12 || (sidebarPeek && g.x <= edge + 16));
    }
    const hit = document.elementFromPoint(g.x, g.y);
    let node = hit?.closest("[data-lib-open], [data-lib-item]");
    if (
      !node &&
      sidebarPeek &&
      hit?.closest("#library-sidebar, .sidebar-edge")
    ) {
      node = [
        ...document.querySelectorAll("#library-sidebar [data-lib-open]"),
      ].find((el) => {
        const r = el.getBoundingClientRect();
        return r.height && g.y >= r.top && g.y <= r.bottom;
      });
    }
    let target = node?.dataset.libOpen || node?.dataset.libItem;
    const record = libItem(target);
    if (record?.kind === "test") target = null;
    if (!target && hit?.closest(".library-items")) target = libraryLocation;
    g.destination = libraryCanDrop(g.ids, target) ? target : null;
    document
      .querySelectorAll(".drop-target")
      .forEach((el) => el.classList.remove("drop-target"));
    if (g.destination)
      (node || $(".library-items"))?.classList.add("drop-target");
    preview.classList.toggle("can-drop", !!g.destination);
    // Hovering directories opens them without ending the held drag.
    const navigate =
      target &&
      target !== libraryLocation &&
      !g.ids.includes(target) &&
      (target === "all" ||
        ["category", "folder"].includes(libItem(target)?.kind))
        ? target
        : null;
    if (navigate !== g.hoverTarget) {
      clearTimeout(g.hoverTimer);
      g.hoverTarget = navigate;
      if (navigate)
        g.hoverTimer = setTimeout(() => {
          if (libraryGesture !== g) return;
          libraryLocation = navigate;
          libraryQuery = "";
          renderHome();
          g.hoverTarget = null;
          updateLibraryGesture();
        }, 650);
    }
  }
}
function scrollLibraryGesture() {
  const g = libraryGesture;
  if (!g?.moved) return;
  const hit = document.elementFromPoint(g.x, g.y);
  const pane = hit?.closest(".library-sidebar");
  const bounds = pane?.getBoundingClientRect() || {
    top: 0,
    bottom: innerHeight,
  };
  const amount =
    g.y < bounds.top + 44 ? -12 : g.y > bounds.bottom - 44 ? 12 : 0;
  if (amount) {
    if (pane) pane.scrollTop += amount;
    else window.scrollBy(0, amount);
    updateLibraryGesture();
  }
  g.frame = requestAnimationFrame(scrollLibraryGesture);
}
document.addEventListener("pointerdown", (e) => {
  if (
    e.button !== 0 ||
    screen !== "home" ||
    e.target.closest("#library-context-menu")
  )
    return;
  const row = e.target.closest("[data-lib-item]");
  const item =
    row &&
    (librarySelection.has(row.dataset.libItem) ||
      e.target.closest(".item-icon, .item-title h2, .folder-open"))
      ? row
      : null;
  if (
    e.target.closest("button,input,select,textarea,a") &&
    !e.target.closest(".folder-open")
  )
    return;
  if (e.target.closest("#library-sidebar, .sidebar-edge")) return;
  if (!e.target.closest(".library-shell")) return;
  closeLibraryMenu();
  const before = new Set(librarySelection);
  const additive = e.metaKey || e.ctrlKey || e.shiftKey;
  libraryGesture = {
    pointerId: e.pointerId,
    startX: e.clientX,
    startY: e.clientY,
    x: e.clientX,
    y: e.clientY,
    scrollY,
    before,
    additive,
    mode: item ? "move" : "box",
    id: item?.dataset.libItem,
    moved: false,
  };
  if (item) {
    const id = item.dataset.libItem;
    libraryGesture.ids = librarySelection.has(id)
      ? [...librarySelection]
      : [id];
  }
});
document.addEventListener("pointermove", (e) => {
  const g = libraryGesture;
  if (!g || g.pointerId !== e.pointerId) return;
  g.x = e.clientX;
  g.y = e.clientY;
  if (!g.moved && Math.hypot(g.x - g.startX, g.y - g.startY) >= 6) {
    if (
      g.mode === "move" &&
      (!g.ids.length ||
        g.ids.some(
          (id) => libItem(id)?.kind === "category" || !libVisible(libItem(id)),
        ))
    )
      return;
    g.moved = true;
    if (g.mode === "move" && !librarySelection.has(g.id)) {
      librarySelection.clear();
      paintLibrarySelection();
    }
    document.documentElement.setPointerCapture(e.pointerId);
    const overlay = document.createElement("div");
    overlay.id = g.mode === "box" ? "library-marquee" : "library-drag-preview";
    if (g.mode === "move")
      overlay.textContent =
        g.ids.length === 1 ? libItem(g.ids[0]).name : `${g.ids.length} items`;
    document.body.append(overlay);
    document.body.classList.add(
      g.mode === "box" ? "library-selecting" : "library-dragging",
    );
    g.frame = requestAnimationFrame(scrollLibraryGesture);
  }
  if (g.moved) {
    e.preventDefault();
    updateLibraryGesture();
  }
});
document.addEventListener("pointerup", (e) => {
  const g = libraryGesture;
  if (!g || g.pointerId !== e.pointerId) return;
  if (!g.moved) {
    librarySelection.clear();
    paintLibrarySelection();
  }
  finishLibraryGesture();
});
document.addEventListener("pointercancel", () => finishLibraryGesture(true));
window.addEventListener("blur", () => finishLibraryGesture(true));
document.addEventListener("dragstart", (e) => {
  if (e.target.closest("[data-lib-item]")) e.preventDefault();
});
document.addEventListener(
  "click",
  (e) => {
    if (librarySuppressClick) {
      e.preventDefault();
      e.stopImmediatePropagation();
      return;
    }
    const selectionAction = e.target.closest(
      "#library-selection-actions, #library-context-menu, [data-lib-menu]",
    );
    if (screen === "home" && librarySelection.size && !selectionAction) {
      librarySelection.clear();
      paintLibrarySelection();
    }
    if (
      !e.target.closest(
        "#library-context-menu, [data-lib-menu], [data-lib-add]",
      )
    )
      closeLibraryMenu();
    if (
      !e.target.closest("button,input,select,textarea,a") &&
      openLibraryCard(e.target)
    ) {
      e.preventDefault();
      e.stopPropagation();
    }
  },
  true,
);
function openLibraryCard(target) {
  const row = target.closest("[data-lib-item]");
  const item = row && libItem(row.dataset.libItem);
  if (
    screen !== "home" ||
    !item ||
    !["folder", "category"].includes(item.kind) ||
    !libVisible(item)
  )
    return false;
  libraryNavigate(item.id);
  return true;
}
document.addEventListener("keydown", (e) => {
  if (
    e.key === "Enter" &&
    e.target.matches("[data-lib-item]") &&
    openLibraryCard(e.target)
  ) {
    e.preventDefault();
    return;
  }
  const menu = $("#library-context-menu");
  if (e.key === "Escape") {
    if (libraryGesture) finishLibraryGesture(true);
    else if (menu) {
      const anchor = libraryMenuAnchor;
      closeLibraryMenu();
      anchor?.focus();
    } else {
      librarySelection.clear();
      paintLibrarySelection();
    }
  }
  if (menu && ["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) {
    e.preventDefault();
    const buttons = [...menu.querySelectorAll("button")],
      i = buttons.indexOf(document.activeElement);
    buttons[
      e.key === "Home"
        ? 0
        : e.key === "End"
          ? buttons.length - 1
          : (i + (e.key === "ArrowDown" ? 1 : -1) + buttons.length) %
            buttons.length
    ]?.focus();
  }
});
window.addEventListener("resize", closeLibraryMenu);

document.addEventListener(
  "scroll",
  (e) => {
    if (!e.target.closest?.("#library-context-menu")) closeLibraryMenu();
  },
  true,
);
