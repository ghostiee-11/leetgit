// Service worker: on an Accepted submission it reads the LeetCode session
// cookies and POSTs the event to the local LeetGit Python service. Handles
// dedupe, a retry queue when the service is down, and the toolbar badge.
"use strict";

const DEFAULTS = { port: 8765, enabled: true };
const RECENT_MAX = 50;

async function getSettings() {
  const stored = await chrome.storage.local.get(["port", "enabled"]);
  return { ...DEFAULTS, ...stored };
}

function serviceUrl(port, path) {
  return `http://127.0.0.1:${port}${path}`;
}

async function getLeetCodeCookies() {
  const names = ["LEETCODE_SESSION", "csrftoken"];
  const out = {};
  for (const name of names) {
    try {
      const c = await chrome.cookies.get({ url: "https://leetcode.com", name });
      if (c && c.value) out[name] = c.value;
    } catch (e) {
      /* ignore */
    }
  }
  return out;
}

function setBadge(text, color) {
  chrome.action.setBadgeText({ text });
  if (color) chrome.action.setBadgeBackgroundColor({ color });
  if (text) {
    setTimeout(() => chrome.action.setBadgeText({ text: "" }), 6000);
  }
}

async function recordRecent(entry) {
  const { recent = [] } = await chrome.storage.local.get("recent");
  const next = [entry, ...recent.filter((r) => r.submissionId !== entry.submissionId)].slice(0, RECENT_MAX);
  await chrome.storage.local.set({ recent: next, lastSync: entry });
}

async function enqueue(evt) {
  const { queue = [] } = await chrome.storage.local.get("queue");
  if (queue.some((q) => q.submissionId === evt.submissionId)) return;
  queue.push(evt);
  await chrome.storage.local.set({ queue });
}

async function dequeue(submissionId) {
  const { queue = [] } = await chrome.storage.local.get("queue");
  await chrome.storage.local.set({ queue: queue.filter((q) => q.submissionId !== submissionId) });
}

async function alreadySynced(submissionId) {
  const { recent = [] } = await chrome.storage.local.get("recent");
  return recent.some((r) => r.submissionId === submissionId && r.ok);
}

async function syncEvent(evt) {
  const settings = await getSettings();
  if (!settings.enabled) return { ok: false, error: "LeetGit is paused" };
  if (await alreadySynced(evt.submissionId)) return { ok: true, skipped: true };

  const cookies = await getLeetCodeCookies();
  let resp;
  try {
    resp = await fetch(serviceUrl(settings.port, "/sync"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug: evt.slug, submissionId: evt.submissionId, cookies }),
    });
  } catch (e) {
    // Service not running: queue and surface a soft error.
    await enqueue(evt);
    setBadge("…", "#f59e0b");
    return { ok: false, offline: true, error: "Local service unreachable" };
  }

  let body = {};
  try {
    body = await resp.json();
  } catch (e) {
    /* non-JSON */
  }

  if (resp.ok && body.ok) {
    await dequeue(evt.submissionId);
    await recordRecent({
      ok: true,
      submissionId: evt.submissionId,
      slug: evt.slug,
      title: body.title || evt.slug,
      commitUrl: body.commitUrl || null,
      at: new Date().toISOString(),
    });
    setBadge("✓", "#22c55e"); // check mark
    return body;
  }

  const errEntry = {
    ok: false,
    submissionId: evt.submissionId,
    slug: evt.slug,
    title: evt.slug,
    error: body.error || `HTTP ${resp.status}`,
    reauth: body.reauth || body.githubAuth || false,
    at: new Date().toISOString(),
  };
  await recordRecent(errEntry);
  setBadge("!", "#ef4444");
  return errEntry;
}

async function flushQueue() {
  const settings = await getSettings();
  if (!settings.enabled) return;
  const { queue = [] } = await chrome.storage.local.get("queue");
  for (const evt of queue) {
    await syncEvent(evt);
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.type === "accepted") {
    syncEvent(msg).then(sendResponse).catch((e) => sendResponse({ ok: false, error: String(e) }));
    return true; // async response
  }
  if (msg && msg.type === "retryQueue") {
    flushQueue().then(() => sendResponse({ ok: true }));
    return true;
  }
});

chrome.runtime.onInstalled.addListener(async () => {
  const cur = await chrome.storage.local.get(["port", "enabled"]);
  await chrome.storage.local.set({ ...DEFAULTS, ...cur });
  chrome.alarms.create("leetgit-retry", { periodInMinutes: 1 });
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "leetgit-retry") flushQueue();
});
