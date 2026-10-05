(function (root) {
  "use strict";
  function numeric(value) {
    const t = String(value ?? "")
      .trim()
      .replace(/−/g, "-");
    if (
      !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:\s*\/\s*[+-]?(?:\d+(?:\.\d*)?|\.\d+))?$/.test(
        t,
      )
    )
      return NaN;
    const parts = t.split("/").map(Number);
    return parts.length === 2
      ? parts[1] !== 0
        ? parts[0] / parts[1]
        : NaN
      : parts[0];
  }
  function answered(q, a) {
    if (q.type === "blanks")
      return Array.isArray(a) && a.length === q.count && a.every(Boolean);
    if (q.type === "fraction")
      return (
        Array.isArray(a) &&
        a.length === 2 &&
        a.every((x) => String(x).trim() !== "") &&
        Number(a[1]) !== 0
      );
    if (q.type === "numeric") return Number.isFinite(numeric(a));
    return Array.isArray(a) ? a.length > 0 : !!a;
  }
  function grade(q, a) {
    if (q.disputed) return null;
    if (!answered(q, a)) return false;
    if (q.type === "numeric" || q.type === "fraction") {
      const n = numeric(Array.isArray(a) ? a.join("/") : a);
      const k = numeric(q.key);
      return (
        Number.isFinite(n) && Math.abs(n - k) < 1e-9 * Math.max(1, Math.abs(k))
      );
    }
    const val = Array.isArray(a)
      ? q.type === "multi"
        ? [...a].sort().join("")
        : a.join("")
      : a;
    return val === q.key;
  }
  function display(q, a) {
    if (a == null || a === "" || (Array.isArray(a) && a.every((x) => !x)))
      return "Unanswered";
    if (q.type === "fraction") return a.map((x) => x || "…").join(" / ");
    if (q.type === "blanks") return a.map((x) => x || "…").join(" · ");
    return Array.isArray(a) ? [...a].sort().join(", ") : String(a);
  }
  function calculate(expr) {
    const src = expr.replace(/×/g, "*").replace(/÷/g, "/").replace(/\s/g, "");
    if (!src || /[^\d.()+\-*/]/.test(src)) throw Error("Invalid expression");
    let i = 0;
    function atom() {
      if (src[i] === "+") {
        i++;
        return atom();
      }
      if (src[i] === "-") {
        i++;
        return -atom();
      }
      if (src[i] === "(") {
        i++;
        const v = sum();
        if (src[i++] !== ")") throw Error("Missing )");
        return v;
      }
      const m = src.slice(i).match(/^(?:\d+(?:\.\d*)?|\.\d+)/);
      if (!m) throw Error("Number expected");
      i += m[0].length;
      return Number(m[0]);
    }
    function product() {
      let v = atom();
      while (src[i] === "*" || src[i] === "/") {
        const op = src[i++],
          r = atom();
        v = op === "*" ? v * r : v / r;
      }
      return v;
    }
    function sum() {
      let v = product();
      while (src[i] === "+" || src[i] === "-") {
        const op = src[i++],
          r = product();
        v = op === "+" ? v + r : v - r;
      }
      return v;
    }
    const v = sum();
    if (i !== src.length || !Number.isFinite(v)) throw Error("Invalid result");
    return Number(v.toPrecision(12));
  }
  function mergeState(...states) {
    const deleted = Object.create(null),
      attempts = new Map(),
      library = new Map();
    let updated = 0;
    for (const state of states.filter(Boolean)) {
      updated = Math.max(updated, state.updated || 0);
      for (const item of state.library || []) {
        const old = library.get(item.id);
        if (!old || item.updated >= old.updated)
          library.set(item.id, { ...item });
      }
      for (const [id, time] of Object.entries(state.deleted || {}))
        deleted[id] = Math.max(deleted[id] || 0, time);
      for (const attempt of state.attempts || []) {
        const old = attempts.get(attempt.id);
        const time = attempt.updated ?? state.updated ?? attempt.created ?? 0;
        if (!old || time >= (old.updated || 0))
          attempts.set(attempt.id, { ...attempt, updated: time });
      }
    }
    return {
      version: 1,
      updated,
      deleted,
      library: [...library.values()],
      attempts: [...attempts.values()]
        .filter((a) => !Object.hasOwn(deleted, a.id))
        .sort((a, b) => (a.created || 0) - (b.created || 0)),
    };
  }
  function preferences(value = {}) {
    if (!value || typeof value !== "object") value = {};
    return {
      focusMode: typeof value.focusMode === "boolean" ? value.focusMode : true,
      mode: value.mode === "practice" ? "practice" : "timed",
      includeWriting:
        typeof value.includeWriting === "boolean" ? value.includeWriting : true,
      showTimer: typeof value.showTimer === "boolean" ? value.showTimer : true,
    };
  }
  root.MockTestCore = {
    preferences,
    numeric,
    answered,
    grade,
    display,
    calculate,
    mergeState,
  };
  if (typeof module !== "undefined") module.exports = root.MockTestCore;
})(typeof window === "undefined" ? globalThis : window);
