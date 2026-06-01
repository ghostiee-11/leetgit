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

  globalThis.LeetGitLC = { getQuestion, getSubmission };
})();
