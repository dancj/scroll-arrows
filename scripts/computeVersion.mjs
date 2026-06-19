#!/usr/bin/env node
// Semver version computation for the staging→main release flow.
//
// The newest `v*` git tag is the source of truth for the current version
// (NOT package.json, which can lag behind on main until a sync PR merges).
// The bump level is derived from the conventional-commit prefixes of the
// merged PR titles in the release window: a breaking change (`feat!:` or a
// `BREAKING CHANGE` body) bumps major, any `feat:` bumps minor, otherwise
// patch.
//
// Pre-1.0 note: while major is 0, `feat:` still bumps minor (0.1 -> 0.2) and
// breaking bumps major to 1.0.0. Adjust if you want stricter 0.x semantics.

import { fileURLToPath } from "node:url";

const SEMVER_RE = /^v?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/;
const BREAKING_TITLE = /^[a-z]+(\([^)]*\))?!:/i;
const FEAT_TITLE = /^feat(\([^)]*\))?:/i;

export function parseSemver(s) {
  if (typeof s !== "string" || s.length === 0) {
    throw new Error(`parseSemver: not a string: ${s}`);
  }
  const m = SEMVER_RE.exec(s.trim());
  if (!m) throw new Error(`parseSemver: malformed: "${s}"`);
  return { major: +m[1], minor: +m[2], patch: +m[3] };
}

export function formatSemver({ major, minor, patch }) {
  return `${major}.${minor}.${patch}`;
}

/** Numeric (not lexical) comparison: returns true when `a` is newer than `b`. */
export function isNewer(a, b) {
  if (a.major !== b.major) return a.major > b.major;
  if (a.minor !== b.minor) return a.minor > b.minor;
  return a.patch > b.patch;
}

/** Newest parseable `v*`-style tag, or null when none parse. */
export function newestVersionTag(tags) {
  let newest = null;
  let newestParsed = null;
  for (const t of tags) {
    let parsed;
    try {
      parsed = parseSemver(t);
    } catch {
      continue;
    }
    if (!newestParsed || isNewer(parsed, newestParsed)) {
      newestParsed = parsed;
      newest = t;
    }
  }
  return newest;
}

export function bumpLevelFromPrs(prs = []) {
  let level = "patch";
  for (const pr of prs) {
    const title = pr.title ?? "";
    const body = pr.body ?? "";
    if (BREAKING_TITLE.test(title) || /BREAKING CHANGE/.test(body)) {
      return "major";
    }
    if (FEAT_TITLE.test(title)) level = "minor";
  }
  return level;
}

export function applyBump({ major, minor, patch }, level) {
  if (level === "major") return { major: major + 1, minor: 0, patch: 0 };
  if (level === "minor") return { major, minor: minor + 1, patch: 0 };
  return { major, minor, patch: patch + 1 };
}

/**
 * Next version string given the current version (from the newest tag) and the
 * PRs in the release window.
 */
export function computeNextVersion(currentVersion, prs = []) {
  const current = parseSemver(currentVersion);
  return formatSemver(applyBump(current, bumpLevelFromPrs(prs)));
}

// CLI: `computeVersion.mjs <currentVersion>` prints the level from PRs read on
// stdin (JSON array). Mostly for manual checks; the orchestrators import the
// functions directly.
if (fileURLToPath(import.meta.url) === process.argv[1]) {
  const current = process.argv[2] ?? "0.0.0";
  let prs = [];
  try {
    const raw = await new Promise((res) => {
      let buf = "";
      process.stdin.on("data", (d) => (buf += d));
      process.stdin.on("end", () => res(buf));
      if (process.stdin.isTTY) res("");
    });
    if (raw.trim()) prs = JSON.parse(raw);
  } catch {
    prs = [];
  }
  process.stdout.write(computeNextVersion(current, prs) + "\n");
}
