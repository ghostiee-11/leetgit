// LeetCode GraphQL access. Runs in the content-script world on leetcode.com,
// so requests are same-origin and the session cookie is sent automatically.
// Exposes globalThis.LeetGitLC.
(function () {
  "use strict";

  const QUESTION_QUERY = `
    query questionData($titleSlug: String!) {
      question(titleSlug: $titleSlug) {
        questionFrontendId
        title
        titleSlug
        difficulty
        content
        topicTags { name slug }
      }
    }`;

  const SUBMISSION_QUERY = `
    query submissionDetails($submissionId: Int!) {
      submissionDetails(submissionId: $submissionId) {
        code
        runtimeDisplay
        runtimePercentile
        memoryDisplay
        memoryPercentile
        timestamp
        lang { name verboseName }
      }
    }`;

  function getCookie(name) {
    const m = document.cookie.match("(^|;)\\s*" + name + "\\s*=\\s*([^;]+)");
    return m ? m.pop() : "";
  }

  async function graphql(query, variables) {
    const resp = await fetch("https://leetcode.com/graphql", {
      method: "POST",
      credentials: "include",
      headers: {
        "content-type": "application/json",
        "x-csrftoken": getCookie("csrftoken"),
      },
      body: JSON.stringify({ query, variables }),
    });
    if (resp.status === 401 || resp.status === 403) {
      const err = new Error("LeetCode session invalid or expired");
      err.auth = true;
      throw err;
    }
    if (!resp.ok) throw new Error("LeetCode HTTP " + resp.status);
    const json = await resp.json();
    if (json.errors) throw new Error("LeetCode GraphQL error");
    return json.data || {};
  }

  async function getQuestion(slug) {
    const data = await graphql(QUESTION_QUERY, { titleSlug: slug });
    const q = data.question;
    if (!q) throw new Error("Unknown problem: " + slug);
    return {
      frontendId: q.questionFrontendId,
      title: q.title,
      slug: q.titleSlug,
      difficulty: q.difficulty,
      contentHtml: q.content || "",
      tags: (q.topicTags || []).map((t) => t.name),
      url: "https://leetcode.com/problems/" + q.titleSlug + "/",
    };
  }

  async function getSubmission(submissionId) {
    const data = await graphql(SUBMISSION_QUERY, { submissionId: Number(submissionId) });
    const d = data.submissionDetails;
    if (!d) {
      const err = new Error("No details for submission (not yours or session expired)");
      err.auth = true;
      throw err;
    }
    const lang = d.lang || {};
    return {
      code: d.code || "",
      lang: lang.name || "text",
      langDisplay: lang.verboseName || lang.name || "text",
      runtime: d.runtimeDisplay || "N/A",
      runtimePercentile: d.runtimePercentile,
      memory: d.memoryDisplay || "N/A",
      memoryPercentile: d.memoryPercentile,
      timestamp: Number(d.timestamp || 0),
    };
  }

  // ---- Backfill: the user's past accepted submissions ----

  const LANG_DISPLAY = {
    python: "Python", python3: "Python3", cpp: "C++", c: "C", java: "Java",
    csharp: "C#", javascript: "JavaScript", typescript: "TypeScript", php: "PHP",
    swift: "Swift", kotlin: "Kotlin", dart: "Dart", golang: "Go", ruby: "Ruby",
    scala: "Scala", rust: "Rust", racket: "Racket", erlang: "Erlang",
    elixir: "Elixir", mysql: "MySQL", mssql: "MS SQL", oraclesql: "Oracle",
    postgresql: "PostgreSQL", bash: "Bash",
  };

  function langDisplay(lang) {
    return LANG_DISPLAY[(lang || "").toLowerCase()] || lang || "text";
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  // Page through the REST submission history and return the latest accepted
  // submission per (problem, language). onProgress(count) is called as we scan.
  async function getAcceptedHistory(onProgress) {
    const seen = new Map(); // slug|lang -> row
    let offset = 0;
    const limit = 20;
    let hasNext = true;
    let guard = 0;
    while (hasNext && guard < 1000) {
      guard++;
      const resp = await fetch(
        "https://leetcode.com/api/submissions/?offset=" + offset + "&limit=" + limit,
        { credentials: "include", headers: { "x-csrftoken": getCookie("csrftoken") } }
      );
      if (resp.status === 401 || resp.status === 403) {
        const e = new Error("LeetCode session invalid or expired");
        e.auth = true;
        throw e;
      }
      if (!resp.ok) throw new Error("submissions HTTP " + resp.status);
      const data = await resp.json();
      const dump = data.submissions_dump || [];
      for (const row of dump) {
        if (row.status_display !== "Accepted" && row.status !== 10) continue;
        const key = row.title_slug + "|" + row.lang;
        const prev = seen.get(key);
        if (!prev || Number(row.timestamp) > Number(prev.timestamp)) seen.set(key, row);
      }
      if (onProgress) onProgress(seen.size);
      hasNext = !!data.has_next;
      offset += limit;
      await sleep(250); // be gentle on LeetCode
    }
    return Array.from(seen.values());
  }

  // Build a submission object (matching getSubmission's shape) from a history
  // row. Percentiles are not in the dump, so they are null.
  function submissionFromDump(row) {
    return {
      code: row.code || "",
      lang: row.lang,
      langDisplay: langDisplay(row.lang),
      runtime: row.runtime || "N/A",
      runtimePercentile: null,
      memory: row.memory || "N/A",
      memoryPercentile: null,
      timestamp: Number(row.timestamp || 0),
    };
  }

  globalThis.LeetGitLC = {
    getQuestion,
    getSubmission,
    getAcceptedHistory,
    submissionFromDump,
  };
})();
