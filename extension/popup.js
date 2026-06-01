// Popup: onboarding state machine (connect GitHub -> choose repo -> dashboard)
// plus the stats dashboard. Talks to the background worker via messages.
"use strict";

const DONUT_CIRC = 2 * Math.PI * 48;
const $ = (id) => document.getElementById(id);

const views = ["loading", "connect", "auth", "repo", "dashboard", "settings"];
function showView(name) {
  for (const v of views) $("view-" + v).classList.toggle("hidden", v !== name);
  $("settings-btn").classList.toggle("hidden", !(name === "dashboard"));
}

function send(msg) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(msg, (resp) => {
      if (chrome.runtime.lastError) return resolve({ ok: false, error: chrome.runtime.lastError.message });
      resolve(resp || { ok: false, error: "no response" });
    });
  });
}

function setStatus(state) {
  const dot = $("status-dot");
  const text = $("status-text");
  dot.classList.remove("ok", "bad");
  if (state === "ok") { dot.classList.add("ok"); text.textContent = "connected"; }
  else if (state === "bad") { dot.classList.add("bad"); text.textContent = "offline"; }
  else { text.textContent = "setup"; }
}

let state = null;
let authTimer = null;

function stopAuthPolling() {
  if (authTimer) {
    clearInterval(authTimer);
    authTimer = null;
  }
}

async function route() {
  stopAuthPolling();
  showView("loading");
  state = await send({ type: "getState" });
  await showBanner();
  if (!state.connected) {
    setStatus("setup");
    // Resume an in-progress sign-in instead of restarting it.
    if (state.pending) return showAuthView(state.pending.user_code, state.pending.verification_uri);
    return showView("connect");
  }
  setStatus("ok");
  if (!state.repo) return showRepoPicker();
  $("repo-link").href = "https://github.com/" + state.repo;
  return showDashboard();
}

function showAuthView(userCode, verificationUri) {
  $("user-code").textContent = userCode;
  $("open-github").onclick = () => chrome.tabs.create({ url: verificationUri });
  showView("auth");
  stopAuthPolling();
  authTimer = setInterval(async () => {
    const r = await send({ type: "pollAuth" });
    if (r.status === "done") { stopAuthPolling(); route(); }
    else if (r.status === "error") { stopAuthPolling(); alertBanner(r.error || "authorization failed"); showView("connect"); }
  }, 4000);
}

async function showBanner() {
  const { lastSync } = await chrome.storage.local.get("lastSync");
  const banner = $("banner");
  if (lastSync && lastSync.ok === false && lastSync.error) {
    let m = "Last sync failed: " + lastSync.error;
    if (lastSync.auth) m += " Reconnect GitHub, or re-login to LeetCode.";
    banner.textContent = m;
    banner.classList.remove("hidden");
  } else {
    banner.classList.add("hidden");
  }
}

// ---- Connect (device flow + PAT) ----
$("connect-btn").addEventListener("click", async () => {
  const resp = await send({ type: "startGithubAuth" });
  if (!resp.ok) {
    if (resp.code === "no_client_id") {
      $("banner").textContent = "GitHub sign-in isn't configured yet. Use a personal access token below.";
      $("banner").classList.remove("hidden");
      $("pat-box").classList.remove("hidden");
      return;
    }
    return alertBanner(resp.error);
  }
  showAuthView(resp.user_code, resp.verification_uri);
});

$("show-pat").addEventListener("click", () => $("pat-box").classList.toggle("hidden"));
$("pat-save").addEventListener("click", async () => {
  const token = $("pat-input").value.trim();
  if (!token) return;
  const resp = await send({ type: "setToken", token });
  if (!resp.ok) return alertBanner(resp.error || "invalid token");
  route();
});
$("auth-cancel").addEventListener("click", async () => {
  stopAuthPolling();
  await send({ type: "cancelAuth" });
  showView("connect");
});

chrome.runtime.onMessage.addListener((msg) => {
  if (!msg) return;
  if (msg.type === "authChanged") {
    if (msg.ok) route();
    else alertBanner(msg.error || "authorization failed");
  } else if (msg.type === "synced") {
    route();
  } else if (msg.type === "backfillProgress") {
    renderBackfillProgress(msg);
  }
});

function renderBackfillProgress(msg) {
  const el = $("backfill-status");
  if (!el) return;
  if (msg.phase === "scanning") {
    el.textContent = "Scanning your submissions... found " + (msg.done || 0);
  } else if (msg.phase === "pushing") {
    el.textContent = "Pushing " + msg.done + " / " + msg.total + " (" + (msg.pushed || 0) + " synced)";
  } else if (msg.phase === "done") {
    el.textContent = "Done. " + (msg.pushed || 0) + " synced, " + (msg.failed || 0) + " failed, of " + msg.total + ".";
    const btn = $("backfill-btn");
    if (btn) btn.disabled = false;
  }
}

// ---- Repo picker ----
let allRepos = [];
async function showRepoPicker() {
  showView("repo");
  $("repo-list").innerHTML = '<li class="muted">Loading repos...</li>';
  const resp = await send({ type: "listRepos" });
  if (!resp.ok) return ($("repo-list").innerHTML = '<li class="muted">Could not load repos: ' + (resp.error || "") + "</li>");
  allRepos = resp.repos || [];
  renderRepos("");
}

function renderRepos(filter) {
  const list = $("repo-list");
  list.innerHTML = "";
  const items = allRepos.filter((r) => r.full_name.toLowerCase().includes(filter.toLowerCase())).slice(0, 30);
  if (!items.length) { list.innerHTML = '<li class="muted">No matching repos.</li>'; return; }
  for (const r of items) {
    const li = document.createElement("li");
    li.className = "repo-item";
    li.innerHTML = '<span class="repo-name">' + r.full_name + "</span>" + (r.private ? '<span class="repo-tag">private</span>' : "");
    li.addEventListener("click", async () => {
      li.classList.add("selecting");
      const resp = await send({ type: "setRepo", fullName: r.full_name });
      if (!resp.ok) return alertBanner(resp.error);
      route();
    });
    list.appendChild(li);
  }
}
$("repo-filter").addEventListener("input", (e) => renderRepos(e.target.value));
$("create-repo-btn").addEventListener("click", async () => {
  const name = $("new-repo-name").value.trim();
  if (!name) return;
  const resp = await send({ type: "createRepo", name, private: $("new-repo-private").checked });
  if (!resp.ok) return alertBanner(resp.error);
  route();
});

// ---- Dashboard ----
function setArc(el, fraction, offsetFraction) {
  const len = DONUT_CIRC * fraction;
  el.style.strokeDasharray = len + " " + (DONUT_CIRC - len);
  el.style.strokeDashoffset = String(-DONUT_CIRC * offsetFraction);
}

async function showDashboard() {
  showView("dashboard");
  const stats = await send({ type: "getStats" });
  const total = stats.total || 0;
  $("empty-dash").classList.toggle("hidden", total > 0);

  $("current-streak").textContent = stats.currentStreak || 0;
  $("longest-streak").textContent = stats.longestStreak || 0;
  $("active-days").textContent = stats.activeDays || 0;

  const d = stats.byDifficulty || { Easy: 0, Medium: 0, Hard: 0 };
  const denom = total || 1;
  let off = 0;
  setArc($("arc-easy"), d.Easy / denom, off); off += d.Easy / denom;
  setArc($("arc-medium"), d.Medium / denom, off); off += d.Medium / denom;
  setArc($("arc-hard"), d.Hard / denom, off);
  $("total-solved").textContent = total;
  $("count-easy").textContent = d.Easy;
  $("count-medium").textContent = d.Medium;
  $("count-hard").textContent = d.Hard;

  const max = Math.max(d.Easy, d.Medium, d.Hard, 1);
  requestAnimationFrame(() => {
    $("bar-easy").style.width = Math.round((d.Easy / max) * 100) + "%";
    $("bar-medium").style.width = Math.round((d.Medium / max) * 100) + "%";
    $("bar-hard").style.width = Math.round((d.Hard / max) * 100) + "%";
  });
  $("bar-easy-count").textContent = d.Easy;
  $("bar-medium-count").textContent = d.Medium;
  $("bar-hard-count").textContent = d.Hard;

  renderActivity(stats.activity || []);
  renderRecent(stats.recent || []);
}

function renderActivity(activity) {
  const chart = $("activity-chart");
  chart.innerHTML = "";
  const max = Math.max(1, ...activity.map((a) => a.count));
  for (const day of activity) {
    const bar = document.createElement("div");
    bar.className = "activity-bar";
    if (day.count > 0) {
      const ratio = day.count / max;
      const level = ratio > 0.75 ? 4 : ratio > 0.5 ? 3 : ratio > 0.25 ? 2 : 1;
      bar.classList.add("l" + level);
      bar.style.height = 20 + ratio * 80 + "%";
    } else {
      bar.style.height = "12%";
    }
    bar.title = day.date + ": " + day.count + " solved";
    chart.appendChild(bar);
  }
}

function relDate(iso) {
  if (!iso) return "";
  const days = Math.round((Date.now() - new Date(iso + "T00:00:00").getTime()) / 86400000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return days + "d ago";
  if (days < 30) return Math.floor(days / 7) + "w ago";
  return iso;
}

function renderRecent(recent) {
  const list = $("recent-list");
  list.innerHTML = "";
  if (!recent.length) { list.innerHTML = '<li class="muted tiny">No solves yet.</li>'; return; }
  for (const item of recent) {
    const a = document.createElement("a");
    a.className = "recent-item";
    a.href = "https://github.com/" + state.repo + "/tree/" + (state.branch || "main") + "/" + item.folder;
    a.target = "_blank";
    a.rel = "noopener";
    const pill = document.createElement("span");
    pill.className = "recent-pill " + item.difficulty;
    pill.textContent = (item.difficulty || "?")[0];
    const title = document.createElement("span");
    title.className = "recent-title";
    title.textContent = item.frontend_id + ". " + item.title;
    const date = document.createElement("span");
    date.className = "recent-date";
    date.textContent = relDate(item.solved_at);
    a.append(pill, title, date);
    list.appendChild(a);
  }
}

// ---- Settings ----
$("settings-btn").addEventListener("click", async () => {
  $("set-user").textContent = state.user || "-";
  $("set-repo").textContent = state.repo || "-";
  $("enabled-input").checked = state.enabled !== false;
  showView("settings");
});
$("enabled-input").addEventListener("change", (e) => send({ type: "setEnabled", enabled: e.target.checked }));
$("change-repo").addEventListener("click", showRepoPicker);
$("disconnect").addEventListener("click", async () => { await send({ type: "disconnect" }); route(); });
$("close-settings").addEventListener("click", route);

$("backfill-btn").addEventListener("click", async () => {
  const tabs = await chrome.tabs.query({ url: "https://leetcode.com/*" });
  if (!tabs.length) {
    $("backfill-status").textContent = "Open a leetcode.com tab first, then try again.";
    return;
  }
  $("backfill-btn").disabled = true;
  $("backfill-status").textContent = "Starting... keep that LeetCode tab open.";
  chrome.tabs.sendMessage(tabs[0].id, { type: "startBackfill" }, (resp) => {
    if (chrome.runtime.lastError) {
      $("backfill-status").textContent = "Reload the LeetCode tab and try again.";
      $("backfill-btn").disabled = false;
    } else if (resp && !resp.ok) {
      $("backfill-status").textContent = "Error: " + (resp.error || "backfill failed");
      $("backfill-btn").disabled = false;
    }
  });
});

function alertBanner(text) {
  $("banner").textContent = text || "Something went wrong";
  $("banner").classList.remove("hidden");
}

route();
