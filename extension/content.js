// Injects inject.js into the page context and relays its "accepted" messages
// to the background service worker.
(function () {
  "use strict";

  // Inject the page-context network watcher.
  try {
    const script = document.createElement("script");
    script.src = chrome.runtime.getURL("inject.js");
    script.onload = function () {
      this.remove();
    };
    (document.head || document.documentElement).appendChild(script);
  } catch (e) {
    console.error("[LeetGit] failed to inject watcher", e);
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    const msg = event.data;
    if (!msg || msg.source !== "leetgit" || msg.type !== "accepted") return;
    chrome.runtime.sendMessage({
      type: "accepted",
      submissionId: msg.submissionId,
      slug: msg.slug,
    });
  });
})();
