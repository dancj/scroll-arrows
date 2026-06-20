// Deterministic Keep a Changelog 1.1.0 entry rendering and injection. Each
// release renders as a flat bullet list — no category sections — preserving
// the merge order of the PRs it was given.

import { sanitizeTitle } from './releaseCategorize.mjs';

const UNRELEASED_HEADING = '## [Unreleased]';

export function renderChangelogEntry({ version, date, prs = [] }) {
  const isoDate = formatIsoDate(date);
  const lines = [`## [${version}] - ${isoDate}`, ''];

  if (prs.length > 0) {
    for (const pr of prs) {
      const title = sanitizeTitle(pr.title ?? '');
      const author = pr.author?.login ?? 'unknown';
      lines.push(`- #${pr.number} — ${title} (@${author})`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

export function injectChangelogEntry(existingChangelog, entry) {
  const idx = existingChangelog.indexOf(UNRELEASED_HEADING);
  if (idx === -1) {
    throw new Error('injectChangelogEntry: ## [Unreleased] heading not found');
  }
  // Insert between the [Unreleased] heading and the next heading, without
  // touching the [Unreleased] heading itself.
  let cursor = idx + UNRELEASED_HEADING.length;
  const nextNewline = existingChangelog.indexOf('\n', cursor);
  cursor = nextNewline === -1 ? existingChangelog.length : nextNewline + 1;
  if (existingChangelog[cursor] === '\n') cursor += 1;

  const before = existingChangelog.slice(0, cursor);
  const after = existingChangelog.slice(cursor);
  // Separate the entry from the following section with exactly one blank line so
  // the result stays Prettier-clean (prettier --check gates CI).
  const normalized = entry.replace(/\n+$/, '');
  return before + normalized + '\n\n' + after;
}

function formatIsoDate(date) {
  const y = date.getUTCFullYear();
  const mo = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${mo}-${d}`;
}
