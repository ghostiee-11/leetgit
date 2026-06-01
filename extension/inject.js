// Runs in the page's MAIN world (declared in manifest as a content script with
// "world": "MAIN"), so it can wrap the page's own fetch/XHR and is not blocked
// by the page CSP. When a submission is Accepted it posts a window message that
// content.js (isolated world) relays to the background worker.
(function () {
  "use strict";

  const CHECK_RE = /\/submissions\/detail\/(\d+)\/check\/?/;

  function slugFromLocation() {
    const m = location.pathname.match(/\/problems\/([^/]+)/);
    return m ? m[1] : null;
  }

  function isAccepted(data) {
    if (!data || data.state !== "SUCCESS") return false;
    return data.status_msg === "Accepted" || data.status_code === 10;
  }

  function handleCheck(url, data) {
    try {
      console.debug("[LeetGit] check seen", { state: data && data.state, status: data && data.status_msg });
    } catch (e) {}
    if (!isAccepted(data)) return;
    const idMatch = String(url).match(CHECK_RE);
    const slug = slugFromLocation();
    if (!idMatch || !slug) {
      console.warn("[LeetGit] accepted but could not read id/slug", { url, slug });
      return;
    }
    console.log("[LeetGit] Accepted detected:", slug, idMatch[1]);
    window.postMessage(
      { source: "leetgit", type: "accepted", submissionId: Number(idMatch[1]), slug: slug },
      "*"
    );
  }

  const PROBE_RE = /submi|check|interpret/i;

  // Wrap fetch.
  const origFetch = window.fetch;
  if (origFetch) {
    window.fetch = function (...args) {
      const url = typeof args[0] === "string" ? args[0] : args[0] && args[0].url;
      if (url && PROBE_RE.test(url)) console.log("[LeetGit] net fetch:", url);
      const p = origFetch.apply(this, args);
      if (url && CHECK_RE.test(url)) {
        p.then((resp) => {
          resp.clone().json().then((data) => handleCheck(url, data)).catch(() => {});
        }).catch(() => {});
      }
      return p;
    };
  }

  // Wrap XMLHttpRequest.
  const origOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this.__leetgitUrl = url;
    return origOpen.call(this, method, url, ...rest);
  };
  const origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function (...args) {
    const url = this.__leetgitUrl;
    if (url && PROBE_RE.test(url)) console.log("[LeetGit] net xhr:", url);
    if (url && CHECK_RE.test(url)) {
      this.addEventListener("load", function () {
        try {
          handleCheck(url, JSON.parse(this.responseText));
        } catch (e) {}
      });
    }
    return origSend.apply(this, args);
  };

  console.log("[LeetGit] submission watcher installed (MAIN world)");
})();
