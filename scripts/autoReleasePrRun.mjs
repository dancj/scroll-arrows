#!/usr/bin/env node
// Orchestrator for auto-release-pr.yml. Upserts the staging→main release PR
// whose managed body lists the merged staging PRs (categorised) plus the
// proposed next semver version. Composes the pure helpers with `gh` and `git`
// calls; every external dependency is injectable so unit tests stub
// gh/exec/now/readFile without live GitHub calls.
//
// Subprocess discipline: all `gh` and `git` calls go through execFile with
// explicit argv arrays. Never shell-string. PR titles and bodies are
// attacker-controlled and travel into gh argv positions; argv-array invocation
// guarantees no shell tokenisation.

import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";
import { readFile as fsReadFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { aggregateClosesIssues } from "./releaseCategorize.mjs";
import { renderReleaseBody, injectIntoBody } from "./buildReleasePrBody.mjs";
import { newestVersionTag, computeNextVersion } from "./computeVersion.mjs";

const execFile = promisify(execFileCb);
const ROOT = path.resolve(import.meta.dirname, "..");

// Fallback SINCE for the no-tags case: epoch, so the first run scans all
// merged staging PRs. Tighten if the history is long and you want a floor.
const FALLBACK_SINCE = "1970-01-01T00:00:00Z";
const PR_LIST_FIELDS =
  "number,title,labels,mergedAt,body,closingIssuesReferences,author";

export async function autoReleasePrRun({
  gh,
  exec,
  now,
  readFile = fsReadFile,
  rootDir = ROOT,
} = {}) {
  if (!gh || !exec || !now) {
    throw new Error("autoReleasePrRun: gh, exec, now are required");
  }

  // 1. Short-circuit when staging is not ahead of main.
  const ahead = await execAhead(exec);
  if (ahead === 0) {
    return { skipped: true, reason: "no-op" };
  }

  // 2. Resolve current version + SINCE from the newest v* tag (or fallbacks).
  const { stdout: tagOut } = await exec("git", ["tag", "--list", "v*"]);
  const tags = tagOut.split("\n").map((s) => s.trim()).filter(Boolean);
  const newestTag = newestVersionTag(tags);

  let currentVersion;
  let since = FALLBACK_SINCE;
  if (newestTag) {
    currentVersion = newestTag.replace(/^v/, "");
    const { stdout: dateOut } = await exec("git", ["log", "-1", "--format=%aI", newestTag]);
    since = dateOut.trim() || FALLBACK_SINCE;
  } else {
    currentVersion = await readPackageVersion(readFile, rootDir);
  }

  // 3. Fetch merged staging PRs and filter to mergedAt >= since.
  const allMerged = await ghPrList(gh, [
    "--base", "staging", "--state", "merged", "--limit", "200", "--json", PR_LIST_FIELDS,
  ]);
  const sinceMs = Date.parse(since);
  const prs = allMerged.filter((p) => p.mergedAt && Date.parse(p.mergedAt) >= sinceMs);

  // 4. Compute proposed version, aggregate Closes refs, render managed block.
  const version = computeNextVersion(currentVersion, prs);
  const closesIssues = aggregateClosesIssues(prs);
  const managedBlock = renderReleaseBody({ prs, closesIssues, version });

  // 5. Look up the existing release PR (head: staging, base: main).
  const existing = await ghPrList(gh, [
    "--base", "main", "--head", "staging", "--state", "open", "--json", "number,body,title",
  ]);
  const existingPr = existing[0] ?? null;

  // 6. Upsert.
  if (existingPr) {
    const newBody = injectIntoBody(existingPr.body ?? "", managedBlock);
    await gh("pr", "edit", String(existingPr.number), "--body", newBody);
    return { skipped: false, action: "updated", prNumber: existingPr.number, version };
  }

  const title = `Release: staging to main (v${version})`;
  const out = await gh(
    "pr", "create", "--base", "main", "--head", "staging", "--title", title, "--body", managedBlock,
  );
  const prNumber = parsePrNumberFromOutput(out);
  return { skipped: false, action: "created", prNumber, version };
}

async function execAhead(exec) {
  // origin/main..HEAD: in CI `main` is only a remote-tracking ref; HEAD is the
  // checked-out staging tip. Semantically identical to main..staging locally.
  const { stdout } = await exec("git", ["rev-list", "--count", "origin/main..HEAD"]);
  return parseInt(stdout.trim(), 10) || 0;
}

async function readPackageVersion(readFile, rootDir) {
  const raw = await readFile(path.join(rootDir, "package.json"), "utf8");
  return JSON.parse(raw).version;
}

async function ghPrList(gh, extraArgs) {
  const out = await gh("pr", "list", ...extraArgs);
  const raw = (out?.stdout ?? "").trim();
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function parsePrNumberFromOutput(out) {
  if (!out?.stdout) return null;
  const m = out.stdout.match(/\/pull\/(\d+)/);
  if (m) return parseInt(m[1], 10);
  const lastLine = out.stdout.trim().split("\n").pop();
  const n = parseInt(lastLine, 10);
  return Number.isFinite(n) ? n : null;
}

async function realGh(...args) {
  return execFile("gh", args, { env: process.env, maxBuffer: 10 * 1024 * 1024 });
}

async function realExec(cmd, args) {
  return execFile(cmd, args, { env: process.env, maxBuffer: 10 * 1024 * 1024 });
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  autoReleasePrRun({ gh: realGh, exec: realExec, now: () => new Date() })
    .then((result) => {
      process.stdout.write(JSON.stringify(result) + "\n");
    })
    .catch((e) => {
      process.stderr.write(`autoReleasePrRun error: ${e.message ?? e}\n`);
      process.exit(1);
    });
}
