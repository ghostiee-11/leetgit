// Dashboard logic: read settings, talk to the local service, render charts.
"use strict";

const DEFAULTS = { port: 8765, enabled: true };
const DONUT_RADIUS = 48;
const DONUT_CIRC = 2 * Math.PI * DONUT_RADIUS;

const $ = (id) => document.getElementById(id);

const views = {
  loading: $("view-loading"),
  disconnected: $("view-disconnected"),
  empty: $("view-empty"),
  dashboard: $("view-dashboard"),
  settings: $("view-settings"),
};

function showView(name) {
  for (const [key, el] of Object.entries(views)) {
    el.classList.toggle("hidden", key !== name);
  }
}

async function getSettings() {
  const stored = await chrome.storage.local.get(["port", "enabled"]);
  return { ...DEFAULTS, ...stored };
}

function setStatus(state) {
  const dot = $("status-dot");
  const text = $("status-text");
  dot.classList.remove("ok", "bad");
  if (state === "ok") {
    dot.classList.add("ok");
    text.textContent = "connected";
  } else if (state === "bad") {
    dot.classList.add("bad");
    text.textContent = "offline";
  } else {
    text.textContent = "connecting";
  }
}

function setArc(el, fraction, offsetFraction) {
  const len = DONUT_CIRC * fraction;
  el.style.strokeDasharray = `${len} ${DONUT_CIRC - len}`;
  el.style.strokeDashoffset = `${-DONUT_CIRC * offsetFraction}`;
}

function renderDonut(byDiff, total) {
  const easy = byDiff.Easy || 0;
  const medium = byDiff.Medium || 0;
  const hard = byDiff.Hard || 0;
  const denom = total || 1;
  let offset = 0;
  setArc($("arc-easy"), easy / denom, offset);
  offset += easy / denom;
  setArc($("arc-medium"), medium / denom, offset);
  offset += medium / denom;
  setArc($("arc-hard"), hard / denom, offset);

  $("total-solved").textContent = total;
  $("count-easy").textContent = easy;
  $("count-medium").textContent = medium;
  $("count-hard").textContent = hard;
}

function renderBars(byDiff) {
  const easy = byDiff.Easy || 0;
  const medium = byDiff.Medium || 0;
  const hard = byDiff.Hard || 0;
  const max = Math.max(easy, medium, hard, 1);
  const pct = (n) => `${Math.round((n / max) * 100)}%`;
  // Delay so the CSS transition animates from 0.
  requestAnimationFrame(() => {
    $("bar-easy").style.width = pct(easy);
    $("bar-medium").style.width = pct(medium);
    $("bar-hard").style.width = pct(hard);
  });
  $("bar-easy-count").textContent = easy;
  $("bar-medium-count").textContent = medium;
  $("bar-hard-count").textContent = hard;
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
      bar.classList.add(`l${level}`);
      bar.style.height = `${20 + ratio * 80}%`;
    } else {
      bar.style.height = "12%";
    }
    bar.title = `${day.date}: ${day.count} solved`;
    chart.appendChild(bar);
  }
}

function relativeDate(iso) {
  if (!iso) return "";
  const then = new Date(iso + "T00:00:00");
  const today = new Date();
  const days = Math.round((today - then) / 86400000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return iso;
}

function renderRecent(recent, repo, branch) {
  const list = $("recent-list");
  list.innerHTML = "";
  if (!recent || recent.length === 0) {
    const li = document.createElement("li");
    li.className = "muted";
    li.textContent = "No solves yet.";
    list.appendChild(li);
    return;
  }
  for (const item of recent) {
    const a = document.createElement("a");
    a.className = "recent-item";
    a.href = `https://github.com/${repo}/tree/${branch}/${item.folder}`;
    a.target = "_blank";
    a.rel = "noopener";

    const pill = document.createElement("span");
    pill.className = `recent-pill ${item.difficulty}`;
    pill.textContent = (item.difficulty || "?")[0];

    const title = document.createElement("span");
    title.className = "recent-title";
    title.textContent = `${item.frontend_id}. ${item.title}`;

    const date = document.createElement("span");
    date.className = "recent-date";
    date.textContent = relativeDate(item.solved_at);

    a.append(pill, title, date);
    list.appendChild(a);
  }
}

async function showStorageBanner() {
  const { lastSync } = await chrome.storage.local.get("lastSync");
  const banner = $("banner");
  if (lastSync && lastSync.ok === false && lastSync.error) {
    let msg = `Last sync failed: ${lastSync.error}`;
    if (lastSync.reauth) msg += " Re-login to LeetCode, then re-submit.";
    banner.textContent = msg;
    banner.classList.remove("hidden");
  } else {
    banner.classList.add("hidden");
  }
}

async function load() {
  showView("loading");
  await showStorageBanner();
  const settings = await getSettings();
  const base = `http://127.0.0.1:${settings.port}`;

  let health;
  try {
    const r = await fetch(`${base}/health`, { cache: "no-store" });
    health = await r.json();
  } catch (e) {
    setStatus("bad");
    showView("disconnected");
    return;
  }
  setStatus("ok");

  const repo = health.repo || "";
  const branch = health.branch || "main";
  $("repo-link").href = `https://github.com/${repo}`;

  let stats;
  try {
    const r = await fetch(`${base}/stats`, { cache: "no-store" });
    stats = await r.json();
  } catch (e) {
    showView("disconnected");
    return;
  }

  if (!stats.ok) {
    $("banner").textContent = `Stats error: ${stats.error || "unknown"}`;
    $("banner").classList.remove("hidden");
  }

  if (!stats.total) {
    showView("empty");
    return;
  }

  showView("dashboard");
  $("current-streak").textContent = stats.currentStreak || 0;
  $("longest-streak").textContent = stats.longestStreak || 0;
  $("active-days").textContent = stats.activeDays || 0;
  renderDonut(stats.byDifficulty || {}, stats.total || 0);
  renderBars(stats.byDifficulty || {});
  renderActivity(stats.activity || []);
  renderRecent(stats.recent || [], repo, branch);
}

// ---- Settings wiring ----
async function openSettings() {
  const settings = await getSettings();
  $("port-input").value = settings.port;
  $("enabled-input").checked = settings.enabled;
  showView("settings");
}

async function saveSettings() {
  const port = parseInt($("port-input").value, 10) || DEFAULTS.port;
  const enabled = $("enabled-input").checked;
  await chrome.storage.local.set({ port, enabled });
  load();
}

$("settings-btn").addEventListener("click", openSettings);
$("save-settings").addEventListener("click", saveSettings);
$("close-settings").addEventListener("click", load);
$("retry-btn").addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "retryQueue" });
  load();
});

load();
