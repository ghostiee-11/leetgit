// Content script on leetcode.com problem pages. Injects the page-context
// network watcher, and when a submission is accepted it fetches the question +
// submission (same-origin, with your cookies), formats the files, and hands the
// result to the background worker to push to GitHub.
(function () {
  "use strict";

  // Inject the page-context watcher that detects accepted submissions.
  try {
    const script = document.createElement("script");
    script.src = chrome.runtime.getURL("inject.js");
    script.onload = function () {
      this.remove();
    };
    (document.head || document.documentElement).appendChild(script);
  } catch (e) {
    console.error("[LeetGit] inject failed", e);
  }

  let busy = false;

  window.addEventListener("message", async (event) => {
    if (event.source !== window) return;
    const msg = event.data;
    if (!msg || msg.source !== "leetgit" || msg.type !== "accepted") return;
    if (busy) return;
    busy = true;
    try {
      await onAccepted(msg.submissionId, msg.slug);
    } catch (e) {
      console.error("[LeetGit] sync error", e);
    } finally {
      setTimeout(() => (busy = false), 1500);
    }
  });

  async function onAccepted(submissionId, slug) {
    const LC = globalThis.LeetGitLC;
    const FMT = globalThis.LeetGitFmt;
    const question = await LC.getQuestion(slug);
    const submission = await LC.getSubmission(submissionId);
    const solution = FMT.buildSolution(question, submission);
    chrome.runtime.sendMessage({ type: "solved", solution, submissionId }, (resp) => {
      if (chrome.runtime.lastError) return;
      if (resp && resp.ok && !resp.skipped) toast("Pushed to GitHub ✓", true);
      else if (resp && resp.error) toast("LeetGit: " + resp.error, false);
    });
  }

  // Small on-page toast so the user gets feedback without opening the popup.
  function toast(text, ok) {
    const el = document.createElement("div");
    el.textContent = text;
    el.style.cssText = [
      "position:fixed", "bottom:24px", "right:24px", "z-index:99999",
      "padding:11px 16px", "border-radius:10px", "font:600 13px -apple-system,sans-serif",
      "color:#fff", "box-shadow:0 8px 24px rgba(0,0,0,.3)",
      "background:" + (ok ? "linear-gradient(135deg,#7c5cff,#38bdf8)" : "#ef4444"),
    ].join(";");
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 4000);
  }
})();
