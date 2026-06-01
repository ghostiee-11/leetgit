// Formatting helpers. Runs in the content-script world (DOM available for the
// HTML to Markdown conversion). Exposes globalThis.LeetGitFmt.
//
// Produces a "payload" for one accepted submission. The README is assembled in
// the background (github.js) because it needs the folder's full multi-language
// history from the manifest.
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

  function langExt(lang) {
    return LANG_EXT[(lang || "").toLowerCase()] || "txt";
  }

  function nodeToMd(node) {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent.replace(/\s+/g, " ");
    if (node.nodeType !== Node.ELEMENT_NODE) return "";
    const tag = node.tagName.toLowerCase();
    const inner = Array.from(node.childNodes).map(nodeToMd).join("");
    switch (tag) {
      case "p": return "\n\n" + inner.trim() + "\n\n";
      case "br": return "\n";
      case "strong": case "b": return "**" + inner.trim() + "**";
      case "em": case "i": return "*" + inner.trim() + "*";
      case "code": return "`" + node.textContent + "`";
      case "pre": return "\n\n```\n" + node.textContent.replace(/\n+$/, "") + "\n```\n\n";
      case "ul": case "ol": return "\n" + inner + "\n";
      case "li": return "- " + inner.trim() + "\n";
      case "sup": return "^" + inner.trim();
      case "sub": return "_" + inner.trim();
      case "img": return "![](" + (node.getAttribute("src") || "") + ")";
      case "a": return "[" + inner.trim() + "](" + (node.getAttribute("href") || "") + ")";
      default: return inner;
    }
  }

  function htmlToMarkdown(html) {
    if (!html) return "_Problem statement unavailable._";
    const doc = new DOMParser().parseFromString(html, "text/html");
    let md = nodeToMd(doc.body);
    md = md.replace(/\n{3,}/g, "\n\n").replace(/[ \t]+\n/g, "\n");
    return md.trim();
  }

  function problemFolder(q) {
    return q.frontendId + "-" + q.slug;
  }

  // One accepted submission, ready to merge into the folder's history.
  function buildPayload(q, s) {
    const ext = langExt(s.lang);
    let submitted = "N/A";
    let solvedAt = null;
    if (s.timestamp) {
      const d = new Date(s.timestamp * 1000);
      submitted = d.toISOString().replace("T", " ").slice(0, 16) + " UTC";
      solvedAt = d.toISOString().slice(0, 10);
    }
    return {
      folder: problemFolder(q),
      problemMeta: {
        frontend_id: q.frontendId,
        title: q.title,
        slug: q.slug,
        difficulty: q.difficulty,
        tags: q.tags,
        url: q.url,
      },
      statementMd: htmlToMarkdown(q.contentHtml),
      solution: {
        ext: ext,
        file: "solution." + ext,
        lang_display: s.langDisplay,
        code: s.code,
        runtime: s.runtime,
        runtime_pct: s.runtimePercentile,
        memory: s.memory,
        memory_pct: s.memoryPercentile,
        solved_at: solvedAt,
        submitted: submitted,
      },
    };
  }

  globalThis.LeetGitFmt = { langExt, htmlToMarkdown, buildPayload };
})();
