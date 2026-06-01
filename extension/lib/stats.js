// Pure stats + repo-content helpers. Attaches to globalThis so it works in both
// the popup (window) and the service worker (importScripts). Exposes
// globalThis.LeetGitStats.
(function () {
  "use strict";

  const DIFFICULTIES = ["Easy", "Medium", "Hard"];
  const DAY_MS = 86400000;

  function dayKey(d) {
    return d.toISOString().slice(0, 10);
  }

  function parseDay(value) {
    if (!value) return null;
    const d = new Date(String(value).slice(0, 10) + "T00:00:00Z");
    return isNaN(d.getTime()) ? null : dayKey(d);
  }

  function currentStreak(daySet, todayKey) {
    if (daySet.size === 0) return 0;
    let cursor = new Date(todayKey + "T00:00:00Z");
    if (!daySet.has(dayKey(cursor))) {
      cursor = new Date(cursor.getTime() - DAY_MS);
      if (!daySet.has(dayKey(cursor))) return 0;
    }
    let streak = 0;
    while (daySet.has(dayKey(cursor))) {
      streak += 1;
      cursor = new Date(cursor.getTime() - DAY_MS);
    }
    return streak;
  }

  function longestStreak(daySet) {
    if (daySet.size === 0) return 0;
    const days = Array.from(daySet).sort();
    let longest = 1;
    let run = 1;
    for (let i = 1; i < days.length; i++) {
      const prev = new Date(days[i - 1] + "T00:00:00Z").getTime();
      const cur = new Date(days[i] + "T00:00:00Z").getTime();
      if (cur - prev === DAY_MS) {
        run += 1;
        longest = Math.max(longest, run);
      } else {
        run = 1;
      }
    }
    return longest;
  }

  function tagsOf(p) {
    if (p.meta && Array.isArray(p.meta.tags)) return p.meta.tags;
    if (Array.isArray(p.tags)) return p.tags;
    return [];
  }

  function series(dayCounts, todayKey, days) {
    const out = [];
    const todayMs = new Date(todayKey + "T00:00:00Z").getTime();
    for (let offset = days - 1; offset >= 0; offset--) {
      const key = dayKey(new Date(todayMs - offset * DAY_MS));
      out.push({ date: key, count: dayCounts[key] || 0 });
    }
    return out;
  }

  // problems: array of meta objects; today: a Date.
  function compute(problems, today, activityDays, heatmapDays) {
    activityDays = activityDays || 30;
    heatmapDays = heatmapDays || 182; // ~26 weeks
    const todayKey = dayKey(today);
    const byDifficulty = { Easy: 0, Medium: 0, Hard: 0 };
    const dayCounts = {};
    const daySet = new Set();
    const tagCounts = {};

    for (const p of problems) {
      if (DIFFICULTIES.includes(p.difficulty)) byDifficulty[p.difficulty] += 1;
      const day = parseDay(p.solved_at);
      if (day) {
        dayCounts[day] = (dayCounts[day] || 0) + 1;
        daySet.add(day);
      }
      for (const tag of tagsOf(p)) {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      }
    }

    const topics = Object.keys(tagCounts)
      .map((tag) => ({ tag: tag, count: tagCounts[tag] }))
      .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));

    const recent = problems
      .filter((p) => p.solved_at)
      .sort((a, b) => String(b.solved_at).localeCompare(String(a.solved_at)))
      .slice(0, 5);

    return {
      total: problems.length,
      byDifficulty: byDifficulty,
      currentStreak: currentStreak(daySet, todayKey),
      longestStreak: longestStreak(daySet),
      activeDays: daySet.size,
      activity: series(dayCounts, todayKey, activityDays),
      heatmap: series(dayCounts, todayKey, heatmapDays),
      topics: topics,
      recent: recent,
    };
  }

  globalThis.LeetGitStats = { compute };
})();
