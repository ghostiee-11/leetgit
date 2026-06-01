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

// ---- Auth ----
let authPolling = false;

async function startAuth() {
  const device = await GH.startDeviceFlow();
  if (!authPolling) {
    authPolling = true;
    pollLoop(device.device_code, device.interval, device.expires_in).finally(() => {
      authPolling = false;
    });
  }
  return {
    user_code: device.user_code,
    verification_uri: device.verification_uri,
    expires_in: device.expires_in,
  };
}

async function pollLoop(deviceCode, interval, expiresIn) {
  try {
    const token = await GH.pollAccessToken(deviceCode, interval, expiresIn);
    const user = await GH.getUser(token);
    await store({ githubToken: token, githubUser: user.login });
    broadcast({ type: "authChanged", ok: true, user: user.login });
  } catch (e) {
    broadcast({ type: "authChanged", ok: false, error: String(e.message || e) });
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
  const s = await read(["githubToken", "githubUser", "repo", "branch", "enabled"]);
  return {
    connected: !!s.githubToken,
    user: s.githubUser || null,
    repo: s.repo || null,
    branch: s.branch || null,
    enabled: s.enabled !== false,
    configured: GH.isConfigured(),
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
  // Open onboarding on first install.
  chrome.action.openPopup && chrome.action.openPopup().catch(() => {});
});
