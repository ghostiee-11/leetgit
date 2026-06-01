// Runs in the LeetCode PAGE context (not the content-script sandbox) so it can
// observe the site's own network calls. It watches the submission "check"
// endpoint and, when a submission is Accepted, posts a message that content.js
// relays to the background worker. No data leaves the page from here.
(function () {
  "use strict";

  const CHECK_RE = /\/submissions\/detail\/(\d+)\/check\/?/;

  function slugFromLocation() {
    const m = location.pathname.match(/\/problems\/([^/]+)/);
    return m ? m[1] : null;
  }

  function handleCheck(url, data) {
    if (!data || data.state !== "SUCCESS") return;
    if (data.status_msg !== "Accepted") return;
    const idMatch = String(url).match(CHECK_RE);
    const slug = slugFromLocation();
    if (!idMatch || !slug) return;
    window.postMessage(
      {
        source: "leetgit",
        type: "accepted",
        submissionId: Number(idMatch[1]),
        slug: slug,
      },
      "*"
    );
  }

  // Wrap fetch.
  const origFetch = window.fetch;
  if (origFetch) {
    window.fetch = function (...args) {
      const url = typeof args[0] === "string" ? args[0] : args[0] && args[0].url;
      const p = origFetch.apply(this, args);
      if (url && CHECK_RE.test(url)) {
        p.then((resp) => {
          resp
            .clone()
            .json()
            .then((data) => handleCheck(url, data))
            .catch(() => {});
        }).catch(() => {});
      }
      return p;
    };
  }

  // Wrap XMLHttpRequest (LeetCode has used both over time).
  const origOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this.__leetgitUrl = url;
    return origOpen.call(this, method, url, ...rest);
  };
  const origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function (...args) {
    const url = this.__leetgitUrl;
    if (url && CHECK_RE.test(url)) {
      this.addEventListener("load", function () {
        try {
          handleCheck(url, JSON.parse(this.responseText));
        } catch (e) {
          /* ignore non-JSON */
        }
      });
    }
    return origSend.apply(this, args);
  };
})();
