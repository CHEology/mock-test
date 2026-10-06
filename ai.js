/* Explanations stay independent of answer autosave and never block the timer. */
const AI = (() => {
  const cache = new Map(),
    drafts = new Map(),
    errors = new Map(),
    resultTargets = new Map(),
    submitting = new Set();
  let target = null,
    polling = false,
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
  const record = (target = currentTarget()) =>
    target &&
    records(target.attempt).find(
      (r) =>
        r.question === target.question &&
        (r.kind || "question") === (target.si < 0 ? "writing" : "question") &&
        r.mode === target.mode &&
        (r.language || "zh") === target.language,
    );
  const currentTarget = () => target;
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
  const visible = (target = currentTarget()) =>
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
  const slot = (si, qi) =>
    settings.aiEnabled
      ? `<div id="${si === undefined ? "ai-panel-slot" : `ai-slot-${si}-${qi}`}"></div>`
      : "";
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
    if (screen === "results") {
      paintPanel(target?.si < 0 ? target : null);
      for (const selected of resultTargets.values()) paintPanel(selected);
    } else paintPanel(target);
  }
  function paintPanel(target) {
    const slot =
      screen === "results" && target?.si >= 0
        ? $(`#ai-slot-${target.si}-${target.qi}`)
        : $("#ai-panel-slot");
    const $panel = (selector) => slot?.querySelector(selector);
    if (!slot) return;
    if (!visible(target)) {
      slot.innerHTML = "";
      return;
    }
    const r = record(target),
      { s, q } = item(active, target.si, target.qi);
    if (
      !$panel(".ai-panel") ||
      $panel(".ai-panel").dataset.key !== key(target)
    ) {
      slot.innerHTML = `<section class="ai-panel" aria-label="Question explanation" data-key="${esc(key(target))}" data-ai-owner="${target.si},${target.qi}"><header class="row spread"><h2>${q.task === "writing" ? "Writing" : `${esc(s.label)} · Q${q.number}`} · ${target.mode === "hint" ? "Hint" : q.task === "writing" ? "Feedback" : "Explanation"}</h2><button data-ai="close" class="quiet" aria-label="Close explanation">Close</button></header>${screen === "results" && target.si < 0 ? `<details class="ai-question"><summary>Question</summary>${q.image ? `<img src="${esc(q.image)}" alt="Question ${q.number}">` : `<p>${esc(q.text || (q.sentences || []).join(" ") + "\n" + (q.prompt || ""))}</p>`}${q.options ? `<p>${q.options.map((column, i) => `Blank ${i + 1}: ${column.map((v, j) => `${letters(column.length)[j]}. ${esc(v)}`).join(" · ")}`).join("<br>")}</p>` : ""}${q.task === "writing" ? `<h3>Your writing</h3><p>${esc(active.essay || "")}</p>` : ""}${q.labels ? `<p>${q.labels.map((v, i) => `${letters(q.labels.length)[i]}. ${esc(v)}`).join("<br>")}</p>` : ""}</details>` : ""}<div class="ai-messages"></div><div class="ai-status" role="status"></div>${q.task === "writing" && active.status !== "done" ? '<button data-ai="refresh-writing" class="quiet">Review current draft</button>' : ""}<form class="ai-followup"><textarea aria-label="Ask a follow-up" placeholder="Ask a follow-up…" rows="2" maxlength="8000">${esc(drafts.get(key(target)) || "")}</textarea><button class="primary" type="submit">Send</button></form></section>`;
      $panel(".ai-followup textarea").oninput = (e) =>
        drafts.set(key(target), e.target.value);
      $panel(".ai-followup").onsubmit = (e) => {
        e.preventDefault();
        send(false, target);
      };
    }
    const conversation = [...(r?.messages || [])];
    if (r?.followup && (busy(r) || r.status === "error"))
      conversation.push({ role: "user", text: r.followup });
    const messages = $panel(".ai-messages"),
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
    const pending = busy(r) || submitting.has(key(target));
    const error = errors.get(key(target)) || r?.error;
    const status = $panel(".ai-status");
    status.innerHTML = pending
      ? `<span>${r?.status === "queued" ? "Queued" : "Thinking…"}</span><button class="quiet" data-ai="stop">Stop</button>`
      : error
        ? `<span>${esc(error)}</span><button data-ai="retry">Retry</button>`
        : !r?.messages.length
          ? '<button data-ai="retry">Explain</button>'
          : "";
    if ($panel('[data-ai="refresh-writing"]'))
      $panel('[data-ai="refresh-writing"]').disabled = pending;
    $panel(".ai-followup button").disabled = pending || !r?.messages.length;
    $panel(".ai-followup").hidden = !r?.messages.length;
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
      button.textContent =
        button.getAttribute("aria-expanded") === "true"
          ? "Hide explanation"
          : busy(r)
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
    const selected = {
      attempt: a.id,
      question: q.id,
      si,
      qi,
      mode: mode(),
      language: settings.aiLanguage,
    };
    target = selected;
    if (screen === "results" && si >= 0)
      resultTargets.set(`${si},${qi}`, selected);
    const opened = key(selected);
    errors.delete(opened);
    paint();
    if (screen !== "results")
      $(".ai-panel")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    try {
      await refresh(a.id);
      if (
        !visible(selected) ||
        (screen === "results" && si >= 0
          ? resultTargets.get(`${si},${qi}`) !== selected
          : target !== selected)
      )
        return;
      if (!record(selected)) await submit(a, si, qi, selected.mode);
    } catch (e) {
      errors.set(opened, e.message);
      paint();
    }
  }
  async function submit(a, si, qi, selectedMode, followup = "") {
    if (!settings.aiEnabled) return;
    // Snapshot the question, answer, and preferences before any asynchronous work.
    const request = payload(a, si, qi, selectedMode, followup);
    const requestKey = key({
      attempt: a.id,
      question: request.question,
      si,
      mode: selectedMode,
      language: request.language,
    });
    if (submitting.has(requestKey)) return;
    errors.delete(requestKey);
    submitting.add(requestKey);
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
      submitting.delete(requestKey);
      paint();
    }
  }
  async function send(retry = false, owner = target) {
    if (!visible(owner)) return;
    const selected = { ...owner },
      draftKey = key(selected);
    const followup = retry
      ? record(selected)?.followup || ""
      : (drafts.get(draftKey) || "").trim();
    if (!retry && !followup) return;
    try {
      await submit(active, selected.si, selected.qi, selected.mode, followup);
      drafts.delete(draftKey);
      const slot =
        screen === "results" && selected.si >= 0
          ? $(`#ai-slot-${selected.si}-${selected.qi}`)
          : $("#ai-panel-slot");
      if (
        visible(selected) &&
        slot?.querySelector(".ai-panel")?.dataset.key === draftKey
      )
        slot.querySelector(".ai-followup textarea").value = "";
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
      // Batch work updates row buttons without moving or expanding the page.
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
    const owner = button.closest("[data-ai-owner]")?.dataset.aiOwner;
    if (screen === "results" && owner && resultTargets.has(owner))
      target = resultTargets.get(owner);
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
        case "question": {
          const [si, qi] = button.dataset.aiPosition.split(",").map(Number);
          if (toggleResultQuestion(si, qi, true)) await open(si, qi);
          break;
        }
        case "close":
          if (screen === "results" && target?.si >= 0)
            toggleResultQuestion(target.si, target.qi, true);
          else {
            target = null;
            paint();
          }
          break;
        case "retry":
          await send(true);
          break;
        case "batch":
          await explainWrong();
          break;
        case "stop": {
          const selected = target,
            saved = record(selected);
          if (saved) {
            await api("stop", { attempt: selected.attempt, id: saved.id });
            await refresh(selected.attempt);
          }
          break;
        }
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
  function closeResult(si, qi) {
    const id = `${si},${qi}`;
    if (target === resultTargets.get(id)) target = null;
    resultTargets.delete(id);
    const slot = $(`#ai-slot-${si}-${qi}`);
    if (slot) slot.innerHTML = "";
  }
  function reset() {
    target = null;
    resultTargets.clear();
    if (!settings.aiEnabled && batch) batch.stop = true;
  }
  return {
    button,
    slot,
    mount,
    providers,
    context,
    reset,
    closeResult,
    incorrectQuestions,
  };
})();
