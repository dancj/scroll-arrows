// Pure helpers for categorising merged PRs into release sections, extracting
// and aggregating Closes-issue references, neutralising closing-keyword
// injection attempts (via backtick-wrap), and sanitising titles for safe
// rendering into managed-block bullets.
//
// Adapted from home-bartender for a library: sections are Features / Fixes /
// Docs / Maintenance, keyed off conventional-commit prefixes.

import { DELIMITER_START, DELIMITER_END } from "./buildReleasePrBody.mjs";

const FEAT_PREFIX = /^feat(\([^)]*\))?!?:/i;
const FIX_PREFIX = /^fix(\([^)]*\))?!?:/i;
const DOCS_PREFIX = /^docs(\([^)]*\))?:/i;
const CLOSING_KEYWORD_LINE = /^\s*(?:Closes|Fixes|Resolves)\s+#(\d+)/gim;
const CLOSING_KEYWORD_INLINE = /\b(Closes|Fixes|Resolves)\s+#\d+/gi;

export function categorizePr({ title, labels = [] }) {
  if (labels.includes("feature")) return "Features";
  if (labels.includes("bug")) return "Fixes";

  const t = title ?? "";
  if (FEAT_PREFIX.test(t)) return "Features";
  if (FIX_PREFIX.test(t)) return "Fixes";
  if (DOCS_PREFIX.test(t)) return "Docs";
  return "Maintenance";
}

export function extractClosesFromBody(body) {
  if (!body) return [];
  const matches = [];
  for (const m of body.matchAll(CLOSING_KEYWORD_LINE)) {
    matches.push(parseInt(m[1], 10));
  }
  return matches;
}

export function aggregateClosesIssues(prs) {
  const seen = new Set();
  for (const pr of prs) {
    for (const ref of pr.closingIssuesReferences ?? []) {
      if (typeof ref?.number === "number") seen.add(ref.number);
    }
    for (const n of extractClosesFromBody(pr.body ?? "")) {
      seen.add(n);
    }
  }
  return [...seen].sort((a, b) => a - b);
}

export function neutralizeClosingKeywords(text) {
  if (text == null) return text;
  return text.replace(CLOSING_KEYWORD_INLINE, (match, _kw, offset, full) => {
    if (full[offset - 1] === "`") return match;
    return "`" + match + "`";
  });
}

export function sanitizeTitle(title) {
  if (!title) return "";
  let out = title;
  out = out.split(DELIMITER_END).join("");
  out = out.split(DELIMITER_START).join("");
  out = out.replace(/<!--/g, "").replace(/-->/g, "");
  out = out.replace(/\s+/g, " ").trim();
  out = neutralizeClosingKeywords(out);
  return out;
}
