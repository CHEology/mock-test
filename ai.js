/* Explanations stay independent of answer autosave and never block the timer. */
const AI = (() => {
  const cache = new Map(),
    drafts = new Map(),
    errors = new Map();
  let target = null,
    polling = false,
    submitting = false,
    batch = null;
  const busy = (r) => r && ["queued", "running"].includes(r.status);
  const allowed = () =>
    settings.aiEnabled &&
    !!active &&
    (active.status === "done" || settings.aiDuring !== "off");
  const mode = () => (active.status === "done" ? "full" : settings.aiDuring);
  const key = (t) =>
    JSON.stringify([
      t.attempt,
      t.question,
      t.mode,
      t.language,
      t.si < 0 ? "writing" : "question",
    ]);
  const records = (attempt) => cache.get(attempt) || [];
  const record = () =>
    target &&
    records(target.attempt).find(
      (r) =>
        r.question === target.question &&
        (r.kind || "question") === (target.si < 0 ? "writing" : "question") &&
        r.mode === target.mode &&
        (r.language || "zh") === target.language,
    );
  const writing = (a = active) => ({
    id: "@writing",
    text: DATA.find((t) => t.id === a.test).essay,
    task: "writing",
  });
  const currentId = () => (active?.section < 0 ? "@writing" : question()?.id);
  const item = (a, si, qi) =>
    si < 0
      ? { s: { label: "Writing" }, q: writing(a) }
      : {
          s: DATA.find((t) => t.id === a.test).sections[si],
          q: DATA.find((t) => t.id === a.test).sections[si].questions[qi],
        };
  const visible = () =>
    target &&
    active?.id === target.attempt &&
    allowed() &&
    target.language === settings.aiLanguage &&
    (screen === "results" ||
      (screen === "test" &&
        !testHelpOpen &&
        currentId() === target.question &&
        mode() === target.mode));
  const button = () =>
    allowed()
      ? `<button data-ai="open">${mode() === "hint" ? "Hint" : active.section < 0 ? "Review writing" : "Explain"}</button>`
      : "";
  const slot = () =>
    settings.aiEnabled ? '<div id="ai-panel-slot"></div>' : "";
  async function api(path, value) {
    const response = await fetch(
      "/api/ai/" + path,
      value
        ? {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(value),
          }
        : {},
    );
    const data = await response.json();
    if (!response.ok)
      throw Error(data.error || "Explanation service is unavailable.");
    return data;
  }
  function context(q, s, a, mode) {
    if (q.task === "writing")
      return { task: "writing", prompt: q.text, response: a.essay || "" };
    const result = {
      section: s.title || s.label,
      answer: a.answers[q.id] ?? null,
    };
    for (const name of [
      "text",
      "labels",
      "options",
      "sentences",
      "prompt",
      "type",
      "count",
      "limit",
      "image",
    ])
      if (q[name] !== undefined) result[name] = q[name];
    if (mode === "full")
      for (const name of ["key", "disputed", "explanation"])
        if (q[name] !== undefined) result[name] = q[name];
    return result;
  }
  function payload(a, si, qi, mode, followup = "") {
    const { s, q } = item(a, si, qi);
    return {
      attempt: a.id,
      question: q.id,
      mode,
      provider: settings.aiProvider,
      language: settings.aiLanguage,
      tier: settings.aiTier,
      prompt: settings.aiPrompt,
      followup,
      context: context(q, s, a, mode),
    };
  }
  function text(value) {
    return esc(value).replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
  }
  function paint() {
    const slot = $("#ai-panel-slot");
    if (!slot) return;
    if (!visible()) {
      slot.innerHTML = "";
      return;
    }
    const r = record(),
      { s, q } = item(active, target.si, target.qi);
    if (!$("#ai-panel") || $("#ai-panel").dataset.key !== key(target)) {
      slot.innerHTML = `<section id="ai-panel" class="ai-panel" aria-label="Question explanation" data-key="${esc(key(target))}"><header class="row spread"><h2>${q.task === "writing" ? "Writing" : `${esc(s.label)} · Q${q.number}`} · ${target.mode === "hint" ? "Hint" : q.task === "writing" ? "Feedback" : "Explanation"}</h2><button data-ai="close" class="quiet" aria-label="Close explanation">Close</button></header>${screen === "results" ? `<details class="ai-question"><summary>Question</summary>${q.image ? `<img src="${esc(q.image)}" alt="Question ${q.number}">` : `<p>${esc(q.text || (q.sentences || []).join(" ") + "\n" + (q.prompt || ""))}</p>`}${q.options ? `<p>${q.options.map((column, i) => `Blank ${i + 1}: ${column.map((v, j) => `${letters(column.length)[j]}. ${esc(v)}`).join(" · ")}`).join("<br>")}</p>` : ""}${q.task === "writing" ? `<h3>Your writing</h3><p>${esc(active.essay || "")}</p>` : ""}${q.labels ? `<p>${q.labels.map((v, i) => `${letters(q.labels.length)[i]}. ${esc(v)}`).join("<br>")}</p>` : ""}</details>` : ""}<div id="ai-messages"></div><div id="ai-status" role="status"></div>${q.task === "writing" && active.status !== "done" ? '<button data-ai="refresh-writing" class="quiet">Review current draft</button>' : ""}<form id="ai-followup" class="ai-followup"><textarea aria-label="Ask a follow-up" placeholder="Ask a follow-up…" rows="2" maxlength="8000">${esc(drafts.get(key(target)) || "")}</textarea><button class="primary" type="submit">Send</button></form></section>`;
      $("#ai-followup textarea").oninput = (e) =>
        drafts.set(key(target), e.target.value);
      $("#ai-followup").onsubmit = (e) => {
        e.preventDefault();
        send();
      };
    }
    const conversation = [...(r?.messages || [])];
    if (r?.followup && (busy(r) || r.status === "error"))
      conversation.push({ role: "user", text: r.followup });
    const messages = $("#ai-messages"),
      signature = JSON.stringify(conversation);
    if (messages.dataset.signature !== signature) {
      messages.dataset.signature = signature;
      messages.innerHTML = conversation
        .map((m, i) =>
          m.role === "user" && i === 0
            ? ""
            : `<div class="ai-message ${m.role}">${text(m.text)}</div>`,
        )
        .join("");
    }
    const pending = busy(r) || submitting;
    const error = errors.get(key(target)) || r?.error;
    const status = $("#ai-status");
    status.innerHTML = pending
      ? `<span>${r?.status === "queued" ? "Queued" : "Thinking…"}</span><button class="quiet" data-ai="stop">Stop</button>`
      : error
        ? `<span>${esc(error)}</span><button data-ai="retry">Retry</button>`
        : !r?.messages.length
          ? '<button data-ai="retry">Explain</button>'
          : "";
    if ($('[data-ai="refresh-writing"]'))
      $('[data-ai="refresh-writing"]').disabled = pending;
    $("#ai-followup button").disabled = pending || !r?.messages.length;
    $("#ai-followup").hidden = !r?.messages.length;
  }
  function batchStatus() {
    const el = $("#ai-batch");
    if (!el || !active || !settings.aiEnabled) return;
    const all = records(active.id).filter((r) => r.mode === "full"),
      pending = all.filter(busy).length;
    const failed = all.filter((r) => r.status === "error").length;
    el.innerHTML = `${pending || batch?.attempt === active.id ? `<span>${pending ? `${pending} pending` : "Queuing…"}</span><button data-ai="stop-all" class="quiet">Stop all</button>` : ""}${failed ? `<span>${failed} stopped or failed</span>` : ""}`;
    document.querySelectorAll("[data-ai-question]").forEach((button) => {
      const r = all.find(
        (r) =>
          r.question === button.dataset.aiQuestion &&
          (r.language || "zh") === settings.aiLanguage,
      );
      button.textContent = busy(r)
        ? r.status === "queued"
          ? "Queued"
          : "Thinking…"
        : r?.messages.length
          ? "Explanation"
          : r?.status === "error"
            ? "Retry"
            : "Explain";
    });
    const button = $('[data-ai="batch"]');
    if (button) button.disabled = !!batch || pending > 0;
  }
  async function refresh(attempt) {
    cache.set(
      attempt,
      await api("conversations?attempt=" + encodeURIComponent(attempt)),
    );
    if (active?.id === attempt) {
      paint();
      batchStatus();
    }
  }
  function mount() {
    paint();
    batchStatus();
    if (settings.aiEnabled && active && ["test", "results"].includes(screen))
      refresh(active.id).catch(() => {});
  }
  async function open(si, qi) {
    if (!allowed()) return;
    const a = active,
      { q } = item(a, si, qi);
    target = {
      attempt: a.id,
      question: q.id,
      si,
      qi,
      mode: mode(),
      language: settings.aiLanguage,
    };
    const opened = key(target);
    errors.delete(opened);
    paint();
    $("#ai-panel")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    try {
      await refresh(a.id);
      if (!visible() || key(target) !== opened) return;
      if (!record()) await submit(a, si, qi, target.mode);
    } catch (e) {
      errors.set(opened, e.message);
      paint();
    }
  }
  async function submit(a, si, qi, selectedMode, followup = "") {
    if (!settings.aiEnabled || submitting) return;
    // Snapshot the question, answer, and preferences before any asynchronous work.
    const request = payload(a, si, qi, selectedMode, followup);
    errors.delete(
      key({
        attempt: a.id,
        question: request.question,
        si,
        mode: selectedMode,
        language: request.language,
      }),
    );
    submitting = true;
    paint();
    try {
      if (!diskReady || !(await flushDisk()))
        throw Error(
          "Save the attempt to disk before requesting an explanation.",
        );
      if (!settings.aiEnabled) return;
      await api("explain", request);
      await refresh(a.id);
    } finally {
      submitting = false;
      paint();
    }
  }
  async function send(retry = false) {
    if (!visible()) return;
    const selected = { ...target },
      draftKey = key(selected);
    const followup = retry
      ? record()?.followup || ""
      : (drafts.get(draftKey) || "").trim();
    if (!retry && !followup) return;
    try {
      await submit(active, selected.si, selected.qi, selected.mode, followup);
      drafts.delete(draftKey);
      if (visible() && key(target) === draftKey)
        $("#ai-followup textarea").value = "";
    } catch (e) {
      errors.set(draftKey, e.message);
      paint();
    }
  }
  function incorrectQuestions(t, a) {
    return t.sections.flatMap((s, si) =>
      s.questions.flatMap((q, qi) =>
        C.grade(q, a.answers[q.id]) === false ? [[si, qi]] : [],
      ),
    );
  }
  async function explainWrong() {
    if (!settings.aiEnabled || !active || active.status !== "done" || batch)
      return;
    const a = active,
      todo = incorrectQuestions(test(), a);
    if (!todo.length) {
      notify("No incorrect or unanswered questions to explain.");
      return;
    }
    const token = { stop: false, attempt: a.id };
    batch = token;
    batchStatus();
    try {
      if (!diskReady || !(await flushDisk()))
        throw Error("Save the attempt to disk first.");
      const requests = todo.map(([si, qi]) => payload(a, si, qi, "full"));
      for (const request of requests) {
        if (token.stop || !settings.aiEnabled) break;
        if (
          records(a.id).some(
            (r) =>
              r.question === request.question &&
              r.mode === "full" &&
              (r.language || "zh") === request.language &&
              r.messages.length,
          )
        )
          continue;
        await api("explain", request);
      }
      await refresh(a.id);
      if (active?.id === a.id && screen === "results" && !token.stop)
        await open(...todo[0]);
    } catch (e) {
      notify(e.message);
    } finally {
      if (token.stop) await api("stop", { attempt: a.id }).catch(() => {});
      batch = null;
      batchStatus();
    }
  }
  async function providers() {
    if (!settings.aiEnabled) return;
    try {
      const found = await api("providers");
      for (const [name, label] of [
        ["codex", "Codex"],
        ["claude", "Claude Code"],
      ]) {
        const option = $(`#setting-ai-provider option[value="${name}"]`);
        if (option)
          option.textContent = `${label}${found[name] ? "" : " · not installed"}`;
      }
    } catch (_) {
      /* Missing service is reported if the user requests an explanation. */
    }
  }
  document.addEventListener("click", async (e) => {
    const button = e.target.closest("[data-ai]");
    if (!settings.aiEnabled || !button || button.disabled) return;
    e.preventDefault();
    try {
      switch (button.dataset.ai) {
        case "open":
          await open(active.section, active.question);
          break;
        case "writing":
          await open(-1, 0);
          break;
        case "refresh-writing":
          await submit(
            active,
            -1,
            0,
            target.mode,
            "Review the current draft supplied with this request. Identify what still needs improvement.",
          );
          break;
        case "question":
          await open(...button.dataset.aiPosition.split(",").map(Number));
          break;
        case "close":
          target = null;
          paint();
          break;
        case "retry":
          await send(true);
          break;
        case "batch":
          await explainWrong();
          break;
        case "stop":
          if (record()) {
            await api("stop", { attempt: target.attempt, id: record().id });
            await refresh(target.attempt);
          }
          break;
        case "stop-all":
          if (batch) batch.stop = true;
          await api("stop", { attempt: active.id });
          await refresh(active.id);
          break;
      }
    } catch (error) {
      notify(error.message);
    }
  });
  setInterval(async () => {
    if (
      !settings.aiEnabled ||
      polling ||
      !active ||
      !["test", "results"].includes(screen)
    )
      return;
    if (!records(active.id).some(busy)) return;
    polling = true;
    try {
      await refresh(active.id);
    } catch (_) {
    } finally {
      polling = false;
    }
  }, 1800);
  function reset() {
    target = null;
    if (!settings.aiEnabled && batch) batch.stop = true;
  }
  return { button, slot, mount, providers, context, reset, incorrectQuestions };
})();
