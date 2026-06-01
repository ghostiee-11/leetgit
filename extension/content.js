// Content script (isolated world) on leetcode.com. inject.js runs in the MAIN
// world and posts a window message when a submission is Accepted. Here we fetch
// the question + submission (same-origin, with your cookies), format the files,
// and hand the result to the background worker to push to GitHub.
(function () {
  "use strict";

  let busy = false;

  window.addEventListener("message", async (event) => {
    if (event.source !== window) return;
    const msg = event.data;
    if (!msg || msg.source !== "leetgit" || msg.type !== "accepted") return;
    if (busy) return;
    busy = true;
    toast("LeetGit: syncing...", true);
    try {
      await onAccepted(msg.submissionId, msg.slug);
    } catch (e) {
      console.error("[LeetGit] sync error", e);
      toast("LeetGit: " + (e && e.message ? e.message : "sync failed"), false);
    } finally {
      setTimeout(() => (busy = false), 1500);
    }
  });

  async function onAccepted(submissionId, slug) {
    const LC = globalThis.LeetGitLC;
    const FMT = globalThis.LeetGitFmt;
    if (!LC || !FMT) throw new Error("libs not loaded");
    const question = await LC.getQuestion(slug);
    const submission = await LC.getSubmission(submissionId);
    const payload = FMT.buildPayload(question, submission);
    chrome.runtime.sendMessage({ type: "solved", payload, submissionId }, (resp) => {
      if (chrome.runtime.lastError) return;
      if (resp && resp.ok && !resp.skipped) toast("Pushed to GitHub ✓", true);
      else if (resp && resp.skipped) toast("Already synced", true);
      else if (resp && resp.error) toast("LeetGit: " + resp.error, false);
    });
  }

  // ---- Backfill (triggered from the popup) ----
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg && msg.type === "startBackfill") {
      runBackfill().then(sendResponse).catch((e) => sendResponse({ ok: false, error: String((e && e.message) || e) }));
      return true; // async response
    }
  });

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  function progress(update) {
    chrome.runtime.sendMessage(Object.assign({ type: "backfillProgress" }, update));
  }

  async function runBackfill() {
    const LC = globalThis.LeetGitLC;
    const FMT = globalThis.LeetGitFmt;
    if (!LC || !FMT) return { ok: false, error: "libs not loaded" };

    progress({ phase: "scanning", done: 0, total: 0 });
    const rows = await LC.getAcceptedHistory((n) => progress({ phase: "scanning", done: n, total: 0 }));
    const total = rows.length;
    let done = 0, pushed = 0, failed = 0;
    const qcache = {};

    for (const row of rows) {
      try {
        const slug = row.title_slug;
        const question = qcache[slug] || (qcache[slug] = await LC.getQuestion(slug));
        const submission = row.code && row.code.length
          ? LC.submissionFromDump(row)
          : await LC.getSubmission(row.id);
        const payload = FMT.buildPayload(question, submission);
        const resp = await sendSolved(payload, row.id);
        if (resp && resp.ok && !resp.skipped) pushed++;
      } catch (e) {
        failed++;
      }
      done++;
      progress({ phase: "pushing", done: done, total: total, pushed: pushed });
      await sleep(400); // gentle on GitHub + LeetCode
    }
    progress({ phase: "done", done: done, total: total, pushed: pushed, failed: failed });
    return { ok: true, total: total, pushed: pushed, failed: failed };
  }

  function sendSolved(payload, submissionId) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: "solved", payload, submissionId, backfill: true }, (resp) => {
        if (chrome.runtime.lastError) return resolve({ ok: false, error: chrome.runtime.lastError.message });
        resolve(resp);
      });
    });
  }

  function toast(text, ok) {
    const el = document.createElement("div");
    el.textContent = text;
    el.style.cssText = [
      "position:fixed", "bottom:24px", "right:24px", "z-index:99999",
      "padding:11px 16px", "border-radius:10px", "font:600 13px -apple-system,sans-serif",
      "color:#fff", "box-shadow:0 8px 24px rgba(0,0,0,.3)",
      "background:" + (ok ? "linear-gradient(135deg,#7c5cff,#38bdf8)" : "#ef4444"),
    ].join(";");
    document.body && document.body.appendChild(el);
    setTimeout(() => el.remove(), 4000);
  }
})();
