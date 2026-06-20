#!/usr/bin/env node
// Orchestrator for release-changelog.yml. Runs on push to main after a
// "Release: staging to main" PR merges. Composes the pure helpers with gh and
// git into an injectable-deps function.
//
// Step order (the tagged commit carries the bumped package.json; the explicit
// workflow_dispatch in step 5b is the publish trigger — a tag pushed under
// GITHUB_TOKEN cannot trigger release.yml's on:push:tags, so we dispatch it):
//   1. Ancestry guard (skip if HEAD isn't a merge commit)
//   2. Compute next semver from the newest v* tag + merged PRs
//   3. Idempotent early-exit if tag v<version> already exists
//   4. Create release branch from HEAD; bump package.json + CHANGELOG; commit
//   5. Push the branch, then tag that commit and push the tag
//   5b. Dispatch release.yml (workflow_dispatch) to publish the tag
//   6. Open a sync PR back to staging (human merges — never auto-merge)
//
// All subprocess calls use execFile with explicit argv arrays.

import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';
import {
  readFile as fsReadFile,
  writeFile as fsWriteFile,
} from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { newestVersionTag, computeNextVersion } from './computeVersion.mjs';
import {
  neutralizeClosingKeywords,
  sanitizeTitle,
} from './releaseCategorize.mjs';
import {
  renderChangelogEntry,
  injectChangelogEntry,
} from './buildChangelogEntry.mjs';

const execFile = promisify(execFileCb);
const FALLBACK_SINCE = '1970-01-01T00:00:00Z';
const PR_LIST_FIELDS =
  'number,title,labels,mergedAt,body,closingIssuesReferences,author';
const ROOT = path.resolve(import.meta.dirname, '..');

export async function releaseChangelogRun({
  gh,
  exec,
  now,
  readFile = fsReadFile,
  writeFile = fsWriteFile,
  rootDir = ROOT,
} = {}) {
  if (!gh || !exec || !now || !readFile || !writeFile) {
    throw new Error(
      'releaseChangelogRun: gh, exec, now, readFile, writeFile are required',
    );
  }

  // Step 1: ancestry guard — require a merge commit (2+ parents).
  const { stdout: parentsOut } = await exec('git', [
    'log',
    '-1',
    '--format=%P',
    'HEAD',
  ]);
  const parents = parentsOut.trim().split(/\s+/).filter(Boolean);
  if (parents.length < 2) {
    return { skipped: true, reason: 'not-a-merge-commit' };
  }

  // Step 2: current version + SINCE from the newest v* tag (or fallbacks).
  const { stdout: tagOut } = await exec('git', ['tag', '--list', 'v*']);
  const tags = tagOut
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
  const newestTag = newestVersionTag(tags);

  let currentVersion;
  let since = FALLBACK_SINCE;
  if (newestTag) {
    currentVersion = newestTag.replace(/^v/, '');
    const { stdout: dateOut } = await exec('git', [
      'log',
      '-1',
      '--format=%aI',
      newestTag,
    ]);
    since = dateOut.trim() || FALLBACK_SINCE;
  } else {
    currentVersion = JSON.parse(
      await readFile(path.join(rootDir, 'package.json'), 'utf8'),
    ).version;
  }

  // Fetch merged staging PRs since the previous tag for the bump + changelog.
  const allMerged = await ghPrList(gh, [
    '--base',
    'staging',
    '--state',
    'merged',
    '--limit',
    '200',
    '--json',
    PR_LIST_FIELDS,
  ]);
  const sinceMs = Date.parse(since);
  const prs = allMerged.filter(
    (p) => p.mergedAt && Date.parse(p.mergedAt) >= sinceMs,
  );

  const version = computeNextVersion(currentVersion, prs);
  const tag = `v${version}`;

  // Step 3: idempotent early-exit.
  if (tags.includes(tag)) {
    return { skipped: true, reason: 'tag-exists', version };
  }

  // Step 4: release branch from HEAD; bump package.json + CHANGELOG; commit.
  const branch = `release-${version}`;
  await exec('git', ['checkout', '-b', branch]);

  const pkgPath = path.join(rootDir, 'package.json');
  const pkgRaw = await readFile(pkgPath, 'utf8');
  await writeFile(pkgPath, bumpPackageJson(pkgRaw, version));

  const changelogPath = path.join(rootDir, 'CHANGELOG.md');
  const existingChangelog = await readFile(changelogPath, 'utf8');
  const entry = renderChangelogEntry({ version, date: now(), prs });
  await writeFile(
    changelogPath,
    injectChangelogEntry(existingChangelog, entry),
  );

  await exec('git', ['add', pkgPath, changelogPath]);
  await exec('git', ['commit', '-m', `chore: release v${version}`]);

  // Step 5: push branch, then tag the commit and push the tag.
  await exec('git', ['push', '-u', 'origin', branch]);
  await exec('git', ['tag', tag]);
  await exec('git', ['push', 'origin', tag]);

  // Step 5b: dispatch the publish workflow. The tag push above runs under
  // GITHUB_TOKEN, and GitHub does NOT re-trigger workflows for refs pushed by
  // GITHUB_TOKEN — so release.yml's on:push:tags never fires from here. An
  // explicit workflow_dispatch is the one event GITHUB_TOKEN may trigger, so
  // this is what actually publishes (no PAT needed). Dispatched against the tag
  // ref with the tag as input; release.yml resolves checkout + version from it.
  await gh('workflow', 'run', 'release.yml', '--ref', tag, '-f', `tag=${tag}`);

  // Step 6: open sync PR back to staging (no auto-merge).
  const prBody = renderSyncPrBody({ version, prs });
  const out = await gh(
    'pr',
    'create',
    '--base',
    'staging',
    '--head',
    branch,
    '--title',
    `chore: sync release v${version} (changelog + version)`,
    '--body',
    prBody,
  );
  const prNumber = parsePrNumberFromOutput(out);

  return { skipped: false, version, tag, prNumber };
}

/** Replace the top-level "version" field, preserving the rest byte-for-byte. */
function bumpPackageJson(raw, version) {
  const replaced = raw.replace(/("version"\s*:\s*")[^"]*(")/, `$1${version}$2`);
  if (replaced === raw) {
    throw new Error('bumpPackageJson: no version field found');
  }
  return replaced;
}

function renderSyncPrBody({ version, prs }) {
  // Description-only body. Must NOT contain raw closing keywords — the release
  // PR already auto-closed those issues. Anything interpolated is neutralised.
  const lines = [
    `Records release \`v${version}\`: bumps \`package.json\` and prepends the`,
    'CHANGELOG entry, syncing them back to `staging`.',
    '',
    'Opened by `release-changelog.yml`; waits for a human to merge.',
    '',
  ];
  if (prs.length > 0) {
    lines.push(`Included PRs (${prs.length}):`, '');
    for (const pr of prs) {
      const title = sanitizeTitle(pr.title ?? '');
      const author = pr.author?.login ?? 'unknown';
      lines.push(`- #${pr.number} — ${title} (@${author})`);
    }
    lines.push('');
  }
  return neutralizeClosingKeywords(lines.join('\n'));
}

async function ghPrList(gh, extraArgs) {
  const out = await gh('pr', 'list', ...extraArgs);
  const raw = (out?.stdout ?? '').trim();
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
  const lastLine = out.stdout.trim().split('\n').pop();
  const n = parseInt(lastLine, 10);
  return Number.isFinite(n) ? n : null;
}

async function realGh(...args) {
  return execFile('gh', args, {
    env: process.env,
    maxBuffer: 10 * 1024 * 1024,
  });
}

async function realExec(cmd, args) {
  return execFile(cmd, args, { env: process.env, maxBuffer: 10 * 1024 * 1024 });
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  releaseChangelogRun({
    gh: realGh,
    exec: realExec,
    readFile: fsReadFile,
    writeFile: fsWriteFile,
    now: () => new Date(),
  })
    .then((result) => {
      process.stdout.write(JSON.stringify(result) + '\n');
    })
    .catch((e) => {
      process.stderr.write(`releaseChangelogRun error: ${e.message ?? e}\n`);
      process.exit(1);
    });
}
