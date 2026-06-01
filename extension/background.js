// Service worker: orchestrates GitHub auth (device flow), repo selection, and
// pushing solved problems. All logic lives here; no external server.
"use strict";

importScripts("lib/github.js", "lib/stats.js");

const GH = globalThis.LeetGitGH;
const STATS = globalThis.LeetGitStats;

async function store(obj) {
  await chrome.storage.local.set(obj);
}
async function read(keys) {
  return chrome.storage.local.get(keys);
}

function setBadge(text, color) {
  chrome.action.setBadgeText({ text });
  if (color) chrome.action.setBadgeBackgroundColor({ color });
  if (text) setTimeout(() => chrome.action.setBadgeText({ text: "" }), 6000);
}

function broadcast(msg) {
  chrome.runtime.sendMessage(msg).catch(() => {});
}

// ---- Auth (device flow, resilient across popup closes + worker sleep) ----
let pollInFlight = false;

async function startAuth() {
  const device = await GH.startDeviceFlow();
  const pendingAuth = {
    deviceCode: device.device_code,
    userCode: device.user_code,
    verificationUri: device.verification_uri,
    interval: device.interval || 5,
    expiresAt: Date.now() + (device.expires_in || 900) * 1000,
  };
  await store({ pendingAuth });
  chrome.alarms.create("leetgit-auth", { periodInMinutes: 0.5 });
  setTimeout(() => pollAuth(), (pendingAuth.interval + 1) * 1000);
  return {
    user_code: pendingAuth.userCode,
    verification_uri: pendingAuth.verificationUri,
    expires_in: device.expires_in,
  };
}

async function clearAuth() {
  await chrome.storage.local.remove("pendingAuth");
  chrome.alarms.clear("leetgit-auth");
}

// One poll of the token endpoint. Safe to call from the popup and the alarm.
async function pollAuth() {
  if (pollInFlight) return { status: "pending" };
  pollInFlight = true;
  try {
    const { pendingAuth } = await read("pendingAuth");
    if (!pendingAuth) return { status: "idle" };
    if (Date.now() > pendingAuth.expiresAt) {
      await clearAuth();
      broadcast({ type: "authChanged", ok: false, error: "code expired" });
      return { status: "error", error: "code expired" };
    }
    let data;
    try {
      data = await GH.requestToken(pendingAuth.deviceCode);
    } catch (e) {
      return { status: "pending" }; // network blip, try again next tick
    }
    if (data.access_token) {
      const user = await GH.getUser(data.access_token);
      await store({ githubToken: data.access_token, githubUser: user.login });
      await clearAuth();
      broadcast({ type: "authChanged", ok: true, user: user.login });
      return { status: "done", user: user.login };
    }
    if (data.error === "authorization_pending") return { status: "pending" };
    if (data.error === "slow_down") {
      pendingAuth.interval = (pendingAuth.interval || 5) + 5;
      await store({ pendingAuth });
      return { status: "pending" };
    }
    await clearAuth();
    broadcast({ type: "authChanged", ok: false, error: data.error_description || data.error });
    return { status: "error", error: data.error_description || data.error };
  } finally {
    pollInFlight = false;
  }
}

// ---- Repo ----
async function connectRepo(fullName) {
  const { githubToken } = await read("githubToken");
  const branch = await GH.getDefaultBranch(githubToken, fullName);
  const manifest = await GH.readManifest(githubToken, fullName, branch);
  await store({ repo: fullName, branch, manifest });
  broadcast({ type: "repoChanged", repo: fullName });
  return { repo: fullName, branch };
}

// ---- Sync ----
async function handleSolved(solution, submissionId) {
  const { enabled, githubToken, repo, branch, manifest, seen } = await read([
    "enabled", "githubToken", "repo", "branch", "manifest", "seen",
  ]);
  console.log("[LeetGit] solved received", { folder: solution && solution.folder, hasToken: !!githubToken, repo });
  if (enabled === false) return { ok: false, error: "LeetGit is paused" };
  if (!githubToken || !repo) {
    return { ok: false, error: "Connect GitHub and a repo first" };
  }
  const seenIds = seen || [];
  if (submissionId && seenIds.includes(submissionId)) return { ok: true, skipped: true };

  try {
    const result = await GH.pushSolution(githubToken, repo, branch || "main", solution, manifest || {});
    await store({
      manifest: result.manifest,
      seen: [submissionId, ...seenIds].slice(0, 200),
      lastSync: {
        ok: true,
        title: solution.meta.frontend_id + ". " + solution.meta.title,
        commitUrl: result.commitUrl,
        at: new Date().toISOString(),
      },
    });
    setBadge("✓", "#22c55e");
    broadcast({ type: "synced", ok: true });
    return { ok: true, commitUrl: result.commitUrl };
  } catch (e) {
    const entry = {
      ok: false,
      title: solution.meta.frontend_id + ". " + solution.meta.title,
      error: String(e.message || e),
      auth: !!e.auth,
      at: new Date().toISOString(),
    };
    await store({ lastSync: entry });
    setBadge("!", "#ef4444");
    broadcast({ type: "synced", ok: false, error: entry.error });
    return entry;
  }
}

// ---- Stats ----
async function getStats() {
  const { manifest } = await read("manifest");
  const problems = Object.values(manifest || {});
  return STATS.compute(problems, new Date());
}

async function getState() {
  const s = await read(["githubToken", "githubUser", "repo", "branch", "enabled", "pendingAuth"]);
  let pending = null;
  if (s.pendingAuth && Date.now() < s.pendingAuth.expiresAt) {
    pending = { user_code: s.pendingAuth.userCode, verification_uri: s.pendingAuth.verificationUri };
  }
  return {
    connected: !!s.githubToken,
    user: s.githubUser || null,
    repo: s.repo || null,
    branch: s.branch || null,
    enabled: s.enabled !== false,
    configured: GH.isConfigured(),
    pending: pending,
  };
}

// ---- Message router ----
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    try {
      switch (msg && msg.type) {
        case "getState":
          return sendResponse(await getState());
        case "startGithubAuth":
          return sendResponse({ ok: true, ...(await startAuth()) });
        case "pollAuth":
          return sendResponse(await pollAuth());
        case "cancelAuth":
          await clearAuth();
          return sendResponse({ ok: true });
        case "setToken": {
          const user = await GH.getUser(msg.token); // validates the token
          await store({ githubToken: msg.token, githubUser: user.login });
          return sendResponse({ ok: true, user: user.login });
        }
        case "listRepos": {
          const { githubToken } = await read("githubToken");
          return sendResponse({ ok: true, repos: await GH.listRepos(githubToken) });
        }
        case "createRepo": {
          const { githubToken } = await read("githubToken");
          const created = await GH.createRepo(githubToken, msg.name, msg.private);
          return sendResponse({ ok: true, ...(await connectRepo(created.full_name)) });
        }
        case "setRepo":
          return sendResponse({ ok: true, ...(await connectRepo(msg.fullName)) });
        case "disconnect":
          await chrome.storage.local.remove(["githubToken", "githubUser", "repo", "branch", "manifest", "seen", "lastSync"]);
          return sendResponse({ ok: true });
        case "setEnabled":
          await store({ enabled: !!msg.enabled });
          return sendResponse({ ok: true });
        case "solved":
          return sendResponse(await handleSolved(msg.solution, msg.submissionId));
        case "getStats":
          return sendResponse({ ok: true, ...(await getStats()) });
        default:
          return sendResponse({ ok: false, error: "unknown message" });
      }
    } catch (e) {
      sendResponse({ ok: false, error: String((e && e.message) || e), auth: !!(e && e.auth), code: e && e.code });
    }
  })();
  return true; // async
});

chrome.runtime.onInstalled.addListener(async () => {
  const cur = await read("enabled");
  if (cur.enabled === undefined) await store({ enabled: true });
});

// Alarm backstop: completes sign-in even if the popup is closed and the worker
// was recycled while the user authorized on github.com.
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "leetgit-auth") pollAuth();
});
