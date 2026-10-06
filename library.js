(function (root) {
  "use strict";
  function seed(records, tests, category = "Practice") {
    const result = [...(records || [])],
      ids = new Set(result.map((r) => r.id));
    const add = (r) => {
      if (!ids.has(r.id)) {
        result.push({ ...r, updated: 0, deleted: false });
        ids.add(r.id);
      }
    };
    add({
      id: "category-default",
      kind: "category",
      name: category,
      parent: null,
    });
    add({
      id: "folder-default",
      kind: "folder",
      name: "Full tests",
      parent: "category-default",
    });
    add({
      id: "folder-writing",
      kind: "folder",
      name: "Writing",
      parent: "category-default",
    });
    for (const t of tests)
      add({
        id: `test-${t.id}`,
        kind: "test",
        name: t.title || `Test ${String(t.id).padStart(2, "0")}`,
        parent: "folder-default",
        testId: t.id,
      });
    return result;
  }
  function visible(records, item) {
    const seen = new Set();
    while (item) {
      if (item.deleted || item.trashed || seen.has(item.id)) return false;
      seen.add(item.id);
      if (!item.parent) return item.kind === "category";
      item = records.find((r) => r.id === item.parent);
    }
    return false;
  }
  function move(records, ids, parent, now = Date.now()) {
    const target = records.find((r) => r.id === parent);
    if (!target || !visible(records, target))
      throw Error("Choose an available destination.");
    const items = ids.map((id) => records.find((r) => r.id === id));
    if (
      items.some(
        (r) =>
          !r ||
          !visible(records, r) ||
          (r.kind === "test"
            ? !["folder", "category"].includes(target.kind)
            : r.kind === "folder"
              ? target.kind !== "category"
              : true),
      )
    )
      throw Error(
        "Folders belong to categories; tests belong to categories or folders.",
      );
    return records.map((r) =>
      ids.includes(r.id) ? { ...r, parent, updated: now } : r,
    );
  }
  function remove(records, ids, now = Date.now()) {
    const removed = new Set(ids);
    let size;
    do {
      size = removed.size;
      for (const r of records) if (removed.has(r.parent)) removed.add(r.id);
    } while (removed.size !== size);
    // Keep tombstones and question content for synchronization and saved attempts.
    return records.map((r) =>
      removed.has(r.id) ? { ...r, deleted: true, updated: now } : r,
    );
  }
  function validateTest(input) {
    const fail = (message) => {
      throw Error(message);
    };
    if (!input || typeof input !== "object" || !Array.isArray(input.sections))
      fail("Each test needs a sections array.");
    const t = JSON.parse(JSON.stringify(input));
    const text = (x) => typeof x === "string" && x.trim().length > 0;
    const duration = (x) =>
      typeof x === "number" && Number.isFinite(x) && x > 0 && x <= 1440;
    if (
      t.essay !== undefined &&
      (!text(t.essay) || !duration(t.essayMinutes ?? 30))
    )
      fail("Writing needs a prompt and a positive duration.");
    if (!t.sections.length && !t.essay)
      fail("Add at least one section or a writing prompt.");
    const ids = new Set();
    for (const s of t.sections) {
      if (
        !text(s.label) ||
        !duration(s.minutes) ||
        !Array.isArray(s.questions) ||
        !s.questions.length
      )
        fail("Each section needs a name, duration, and questions.");
      for (const [i, q] of s.questions.entries()) {
        if (!text(q.id) || ids.has(q.id))
          fail("Question IDs must be unique strings.");
        ids.add(q.id);
        q.number = i + 1;
        if (
          ![
            "single",
            "multi",
            "blanks",
            "numeric",
            "fraction",
            "sentence",
          ].includes(q.type) ||
          !text(q.key)
        )
          fail("Unsupported answer type or missing answer key.");
        if (
          !["numeric", "fraction"].includes(q.type) &&
          (!Number.isInteger(q.count) || q.count < 1 || q.count > 26)
        )
          fail("Choice counts must be between 1 and 26.");
        if (q.type === "blanks" && q.count > 3)
          fail("Up to three blanks are supported.");
        if (q.type === "sentence") {
          if (
            !Array.isArray(q.sentences) ||
            q.sentences.length !== q.count ||
            !q.sentences.every(text) ||
            !text(q.prompt)
          )
            fail("Sentence questions need a passage and prompt.");
        } else if (!text(q.text) && !text(q.image))
          fail("Each question needs text or an image.");
        if (
          q.image &&
          !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(q.image)
        )
          fail(
            "Imported images must be embedded PNG, JPEG, or WebP data URLs.",
          );
        if (
          q.labels &&
          (!Array.isArray(q.labels) ||
            q.labels.length !== q.count ||
            !q.labels.every(text))
        )
          fail("Choice labels must match the choice count.");
        if (
          q.options &&
          (!Array.isArray(q.options) ||
            q.options.length !== q.count ||
            !q.options.every(
              (c) => Array.isArray(c) && c.length === 3 && c.every(text),
            ))
        )
          fail("Each blank needs three choices.");
        const answer = ["multi", "blanks"].includes(q.type)
          ? q.key.split("")
          : q.type === "fraction"
            ? q.key.split("/")
            : q.key;
        const core =
          root.MockTestCore ||
          (typeof require !== "undefined" && require("./core.js"));
        if (!core.grade({ ...q, disputed: false }, answer))
          fail("Invalid answer key.");
        if (["single", "multi", "sentence", "blanks"].includes(q.type)) {
          const max = q.type === "blanks" ? 3 : q.count;
          if (
            ![...q.key].every(
              (c) => c >= "A" && c < String.fromCharCode(65 + max),
            ) ||
            (["single", "sentence"].includes(q.type) && q.key.length !== 1) ||
            (q.type === "blanks" && q.key.length !== q.count)
          )
            fail("Answer key does not match the choices.");
        }
      }
    }
    return t;
  }
  function testIds(records, scope = "all") {
    const group = records.find((r) => r.id === scope);
    return new Set(
      records
        .filter(
          (r) =>
            r.kind === "test" &&
            (scope === "all" ||
              (group?.kind === "folder" && r.parent === scope) ||
              (group?.kind === "category" &&
                (r.parent === scope ||
                  records.find((p) => p.id === r.parent)?.parent === scope))),
        )
        .map((r) => r.testId),
    );
  }
  root.MockTestLibrary = {
    testIds,
    seed,
    visible,
    move,
    remove,
    validateTest,
  };
  if (typeof module !== "undefined") module.exports = root.MockTestLibrary;
})(typeof window === "undefined" ? globalThis : window);
