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
