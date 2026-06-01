// Formatting helpers. Runs in the content-script world (DOM available for the
// HTML to Markdown conversion). Exposes globalThis.LeetGitFmt.
(function () {
  "use strict";

  const LANG_EXT = {
    python: "py", python3: "py", pythondata: "py", cpp: "cpp", c: "c",
    java: "java", csharp: "cs", javascript: "js", typescript: "ts", php: "php",
    swift: "swift", kotlin: "kt", dart: "dart", golang: "go", go: "go",
    ruby: "rb", scala: "scala", rust: "rs", racket: "rkt", erlang: "erl",
    elixir: "ex", mysql: "sql", mssql: "sql", oraclesql: "sql",
    postgresql: "sql", bash: "sh",
  };

  const NOTES_HEADING = "## Notes";
  const DEFAULT_NOTES = "_Add your notes here._";

  function langExt(lang) {
    return LANG_EXT[(lang || "").toLowerCase()] || "txt";
  }

  // Minimal, dependency-free HTML to Markdown for LeetCode statements.
  function nodeToMd(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent.replace(/\s+/g, " ");
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return "";
    const tag = node.tagName.toLowerCase();
    const inner = Array.from(node.childNodes).map(nodeToMd).join("");
    switch (tag) {
      case "p":
        return "\n\n" + inner.trim() + "\n\n";
      case "br":
        return "\n";
      case "strong":
      case "b":
        return "**" + inner.trim() + "**";
      case "em":
      case "i":
        return "*" + inner.trim() + "*";
      case "code":
        return "`" + node.textContent + "`";
      case "pre":
        return "\n\n```\n" + node.textContent.replace(/\n+$/, "") + "\n```\n\n";
      case "ul":
      case "ol":
        return "\n" + inner + "\n";
      case "li":
        return "- " + inner.trim() + "\n";
      case "sup":
        return "^" + inner.trim();
      case "sub":
        return "_" + inner.trim();
      case "img":
        return "![](" + (node.getAttribute("src") || "") + ")";
      case "a":
        return "[" + inner.trim() + "](" + (node.getAttribute("href") || "") + ")";
      default:
        return inner;
    }
  }

  function htmlToMarkdown(html) {
    if (!html) return "_Problem statement unavailable._";
    const doc = new DOMParser().parseFromString(html, "text/html");
    let md = nodeToMd(doc.body);
    md = md.replace(/\n{3,}/g, "\n\n").replace(/[ \t]+\n/g, "\n");
    return md.trim();
  }

  function pct(value) {
    return value === null || value === undefined ? "N/A" : value.toFixed(2) + "%";
  }

  function problemFolder(q) {
    return q.frontendId + "-" + q.slug;
  }

  function buildReadme(q, s) {
    let when = "N/A";
    if (s.timestamp) {
      when = new Date(s.timestamp * 1000).toISOString().replace("T", " ").slice(0, 16) + " UTC";
    }
    const tags = q.tags.length ? q.tags.join(", ") : "None";
    const ext = langExt(s.lang);
    const solFile = "solution." + ext;
    return (
      "# " + q.frontendId + ". " + q.title + "\n\n" +
      "- **Difficulty:** " + q.difficulty + "\n" +
      "- **Tags:** " + tags + "\n" +
      "- **Link:** " + q.url + "\n\n" +
      "## Problem\n\n" + htmlToMarkdown(q.contentHtml) + "\n\n" +
      "## Solution\n\n" +
      "- **Language:** " + s.langDisplay + "\n" +
      "- **Runtime:** " + s.runtime + " (beats " + pct(s.runtimePercentile) + ")\n" +
      "- **Memory:** " + s.memory + " (beats " + pct(s.memoryPercentile) + ")\n" +
      "- **Submitted:** " + when + "\n\n" +
      "See [" + solFile + "](" + solFile + ").\n\n" +
      NOTES_HEADING + "\n\n" + DEFAULT_NOTES + "\n"
    );
  }

  // Build everything the background worker needs to push one solved problem.
  function buildSolution(q, s) {
    const ext = langExt(s.lang);
    const folder = problemFolder(q);
    const solvedAt = s.timestamp
      ? new Date(s.timestamp * 1000).toISOString().slice(0, 10)
      : null;
    return {
      folder: folder,
      readme: buildReadme(q, s),
      solutionName: "solution." + ext,
      solutionCode: s.code,
      meta: {
        frontend_id: q.frontendId,
        title: q.title,
        slug: q.slug,
        difficulty: q.difficulty,
        folder: folder,
        lang_display: s.langDisplay,
        solved_at: solvedAt,
      },
    };
  }

  globalThis.LeetGitFmt = {
    langExt,
    htmlToMarkdown,
    buildReadme,
    buildSolution,
    NOTES_HEADING,
    DEFAULT_NOTES,
  };
})();
