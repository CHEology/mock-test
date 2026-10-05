"use strict";
const L = window.MockTestLibrary;
let libraryLocation = "category-default",
  libraryQuery = "",
  librarySelection = new Set();
try {
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
  save(false);
  renderHome();
}
function libraryNavigate(id) {
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
  return `<button class="item-more quiet" data-lib-menu="${esc(r.id)}" aria-label="Manage ${esc(r.name)}">···</button>`;
}
function renderLibrary() {
  if (
    !["all", "trash"].includes(libraryLocation) &&
    !libVisible(libItem(libraryLocation))
  )
    libraryLocation = "all";
  try {
    sessionStorage.setItem("mock-library-location", libraryLocation);
  } catch (_) {}
  const current = libItem(libraryLocation),
    category = current?.kind === "folder" ? libItem(current.parent) : current;
  const categories = db.library.filter(
    (r) => r.kind === "category" && libVisible(r),
  );
  let items =
    libraryLocation === "trash"
      ? db.library.filter((r) => r.trashed)
      : db.library.filter(
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
        (libraryLocation === "trash" ? r.trashed : libVisible(r)) &&
        r.name.toLowerCase().includes(query) &&
        (libraryLocation === "all" ||
          libraryLocation === "trash" ||
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
  const title =
    libraryLocation === "all"
      ? "Library"
      : libraryLocation === "trash"
        ? "Trash"
        : current.name;
  app.innerHTML = `<div class="library-shell"><aside class="library-sidebar"><div class="brand"><b>M</b>Mock Test</div><nav aria-label="Library"><button class="side-link ${libraryLocation === "all" ? "chosen" : ""}" data-lib-open="all">Library</button><div class="side-section"><span>Categories</span><button class="quiet icon-button" data-lib-new="category" aria-label="New category">+</button></div>${categories.map((r) => `<button class="side-link ${category?.id === r.id ? "chosen" : ""}" data-lib-open="${esc(r.id)}">${libIcon("category")}<span>${esc(r.name)}</span></button>`).join("")}<div class="side-bottom"><button class="side-link" data-action="history">Attempts</button><button class="side-link ${libraryLocation === "trash" ? "chosen" : ""}" data-lib-open="trash">Trash</button><button class="side-link" data-action="help">Help</button></div></nav></aside><main class="library-main"><nav class="breadcrumbs" aria-label="Breadcrumb"><button data-lib-open="all">Library</button>${category ? `<span>/</span><button data-lib-open="${esc(category.id)}" ${current?.kind === "category" ? 'aria-current="page"' : ""}>${esc(category.name)}</button>` : ""}${current?.kind === "folder" ? `<span>/</span><span aria-current="page">${esc(current.name)}</span>` : ""}${libraryLocation === "trash" ? '<span>/</span><span aria-current="page">Trash</span>' : ""}</nav><header class="library-heading row spread"><h1>${esc(title)}</h1><div class="row">${current ? libraryMenu(current) : ""}${libraryLocation === "all" ? '<button class="primary" data-lib-new="category">+ Category</button>' : current?.kind === "category" ? '<button class="primary" data-lib-new="folder">+ Folder</button>' : current?.kind === "folder" ? '<button class="primary" data-lib-add>Add test</button>' : ""}</div></header><div class="library-tools row spread"><input type="search" id="library-search" aria-label="Search library" placeholder="Search${current ? " in " + esc(current.name) : ""}" value="${esc(libraryQuery)}"><div class="row" id="library-selection-actions">${librarySelectionHTML()}</div></div><div class="library-items ${items.every((r) => r.kind === "category" || r.kind === "folder") && items.length ? "folder-grid" : "file-list"}">${items.map((r) => libraryItemHTML(r)).join("") || `<div class="library-empty">${libraryQuery ? "No matches." : libraryLocation === "trash" ? "Trash is empty." : current?.kind === "folder" ? "No tests yet." : libraryLocation === "all" ? "No categories yet." : "No folders yet."}</div>`}</div></main></div>`;
}
function librarySelectionHTML() {
  if (!librarySelection.size) return "";
  return `<span>${librarySelection.size} selected</span>${libraryLocation === "trash" ? '<button data-lib-bulk="restore">Restore</button>' : '<button data-lib-bulk="move">Move</button><button class="danger quiet" data-lib-bulk="trash">Trash</button>'}<button class="quiet" data-lib-bulk="clear" aria-label="Clear selection">×</button>`;
}
function libraryItemHTML(r) {
  const trashed = libraryLocation === "trash",
    isTest = r.kind === "test";
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
  return `<article class="library-item ${isTest ? "test-file" : "folder-card"}"><input type="checkbox" class="item-select" data-lib-select="${esc(r.id)}" aria-label="Select ${esc(r.name)}" ${librarySelection.has(r.id) ? "checked" : ""}><div class="item-icon ${r.kind}">${libIcon(r.kind)}</div><div class="item-title">${isTest || trashed ? `<h2>${esc(r.name)}</h2>` : `<button class="folder-open" data-lib-open="${esc(r.id)}">${esc(r.name)}</button>`}${(trashed || libraryQuery) && libraryPath(r) ? `<span class="muted">${esc(libraryPath(r))}</span>` : status ? `<span class="muted">${esc(status)}</span>` : ""}</div><div class="item-actions row">${trashed ? `<button data-lib-restore="${esc(r.id)}">Restore</button>` : isTest && t ? `${attempts.length ? `<button class="quiet" data-history="${r.testId}">${attempts.length} ${attempts.length === 1 ? "attempt" : "attempts"}</button>` : ""}${open ? `<button class="primary" data-resume="${open.id}">Resume</button>` : `<button class="primary" data-start="${r.testId}">${last ? "Try again" : "Start"}</button>`}` : ""}${!trashed ? libraryMenu(r) : ""}</div></article>`;
}
function libraryNameDialog(kind, id) {
  const item = id ? libItem(id) : null;
  dialog(
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
        trashed: false,
      };
      db.library.push(created);
      libraryLocation = created.id;
      libraryQuery = "";
    }
    libraryCommit();
  };
}
function libraryItemMenu(id) {
  const r = libItem(id);
  dialog(
    `<h2>${esc(r.name)}</h2><div class="item-menu"><button data-lib-rename="${esc(id)}">Rename</button>${r.kind !== "category" ? `<button data-lib-move="${esc(id)}">Move to…</button>` : ""}${r.kind === "test" ? `<button data-lib-copy="${esc(id)}">Create a copy or practice…</button><button data-lib-export="${esc(id)}">Export test</button>` : ""}<button class="danger" data-lib-trash="${esc(id)}">Move to Trash</button></div><div class="dialog-actions"><button data-action="close">Close</button></div>`,
  );
}
function libraryMoveDialog(ids) {
  const kinds = new Set(ids.map((id) => libItem(id)?.kind));
  if (kinds.size !== 1 || kinds.has("category")) {
    notify("Select only tests or only folders to move.");
    return;
  }
  const targetKind = kinds.has("test") ? "folder" : "category";
  const destinations = db.library.filter(
    (r) => r.kind === targetKind && libVisible(r),
  );
  if (!destinations.length) {
    notify(`Create a ${targetKind} first.`);
    return;
  }
  dialog(
    `<form id="library-move-form"><h2>Move to</h2><label class="field">Destination<select id="library-destination">${destinations.map((r) => `<option value="${esc(r.id)}" ${r.id === libItem(ids[0]).parent ? "selected" : ""}>${esc(targetKind === "folder" ? `${libItem(r.parent).name} / ${r.name}` : r.name)}</option>`).join("")}</select></label><div class="dialog-actions"><button type="button" data-action="close">Cancel</button><button class="primary">Move</button></div></form>`,
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
function libraryTrash(ids) {
  db.library = L.trash(db.library, ids);
  libraryCommit();
  notify("Moved to Trash.");
}
function libraryRestore(ids) {
  db.library = L.restore(db.library, ids);
  libraryCommit();
  notify("Restored.");
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
    trashed: false,
  });
}
function libraryAddDialog() {
  dialog(
    '<h2>Add test</h2><div class="item-menu"><button id="new-writing">Writing task</button><button id="import-tests">Import test files</button></div><div class="dialog-actions"><button data-action="close">Cancel</button></div>',
  );
  $("#new-writing").onclick = () => libraryWritingDialog();
  $("#import-tests").onclick = () => libraryImportDialog();
}
function libraryWritingDialog() {
  dialog(
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
    (r) => r.kind === "folder" && libVisible(r),
  );
  dialog(
    `<form id="copy-form"><h2>Create practice</h2><label class="field">Name<input id="copy-name" required maxlength="80" value="${esc(r.name)} — copy"></label><label class="field">Folder<select id="copy-folder">${folders.map((f) => `<option value="${esc(f.id)}" ${f.id === r.parent ? "selected" : ""}>${esc(libItem(f.parent).name + " / " + f.name)}</option>`).join("")}</select></label><div class="copy-sections">${t.essay ? '<label><input type="checkbox" id="copy-writing" checked> Writing</label>' : ""}${t.sections.map((s, i) => `<label><input type="checkbox" data-copy-section="${i}" checked> ${esc(s.label)}</label>`).join("")}</div><div class="dialog-actions"><button type="button" data-action="close">Cancel</button><button class="primary">Create</button></div></form>`,
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
    closeModal();
  } catch (e) {
    notify(e.message || "Export failed.");
  }
}
function libraryImportDialog() {
  dialog(
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
  if (b.dataset.libOpen) libraryNavigate(b.dataset.libOpen);
  else if (b.dataset.libNew) libraryNameDialog(b.dataset.libNew);
  else if (b.dataset.libMenu) libraryItemMenu(b.dataset.libMenu);
  else if (b.dataset.libRename)
    libraryNameDialog(libItem(b.dataset.libRename).kind, b.dataset.libRename);
  else if (b.dataset.libMove) libraryMoveDialog([b.dataset.libMove]);
  else if (b.dataset.libTrash) libraryTrash([b.dataset.libTrash]);
  else if (b.dataset.libRestore) libraryRestore([b.dataset.libRestore]);
  else if (b.dataset.libCopy) libraryCopyDialog(b.dataset.libCopy);
  else if (b.dataset.libExport) libraryExport(b.dataset.libExport);
  else if (b.hasAttribute("data-lib-add")) libraryAddDialog();
  else if (b.dataset.libBulk) {
    const ids = [...librarySelection];
    if (b.dataset.libBulk === "move") libraryMoveDialog(ids);
    else if (b.dataset.libBulk === "trash") libraryTrash(ids);
    else if (b.dataset.libBulk === "restore") libraryRestore(ids);
    else {
      librarySelection.clear();
      renderHome();
    }
  }
});
document.addEventListener("change", (e) => {
  if (e.target.dataset.libSelect) {
    const id = e.target.dataset.libSelect;
    if (e.target.checked) librarySelection.add(id);
    else librarySelection.delete(id);
    $("#library-selection-actions").innerHTML = librarySelectionHTML();
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
