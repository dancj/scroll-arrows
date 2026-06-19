// Pure rendering and injection for the staging→main release PR body's managed
// block. Delimiter constants live here because the marker-counting logic in
// injectIntoBody is their primary consumer; releaseCategorize's sanitizeTitle
// imports them to strip literal occurrences out of attacker-controllable PR
// titles.

import {
  categorizePr,
  sanitizeTitle,
  neutralizeClosingKeywords,
} from './releaseCategorize.mjs';

export const DELIMITER_START = '<!-- release-pr:start -->';
export const DELIMITER_END = '<!-- release-pr:end -->';

const MANAGEMENT_NOTICE =
  '<!-- managed by .github/workflows/auto-release-pr.yml — do not edit between markers -->';
const SECTION_ORDER = ['Features', 'Fixes', 'Docs', 'Maintenance'];

export function renderReleaseBody({
  prs = [],
  closesIssues = [],
  version,
} = {}) {
  const grouped = { Features: [], Fixes: [], Docs: [], Maintenance: [] };
  for (const pr of prs) {
    const section = categorizePr({
      title: pr.title ?? '',
      labels: (pr.labels ?? []).map(asLabelName),
    });
    grouped[section].push(pr);
  }

  const lines = [DELIMITER_START, ''];

  if (version) {
    lines.push(`### Proposed release: \`v${version}\``, '');
  }

  if (closesIssues.length > 0) {
    lines.push('## Closes', '');
    lines.push(closesIssues.map((n) => `Closes #${n}`).join(', '));
    lines.push('');
  }

  for (const section of SECTION_ORDER) {
    const items = grouped[section];
    if (items.length === 0) continue;
    lines.push(`## ${section}`, '');
    for (const pr of items) {
      const title = sanitizeTitle(pr.title ?? '');
      const author = pr.author?.login ?? 'unknown';
      lines.push(`- #${pr.number} — ${title} (@${author})`);
    }
    lines.push('');
  }

  lines.push(MANAGEMENT_NOTICE, DELIMITER_END);
  return lines.join('\n');
}

export function injectIntoBody(existingBody, managedBlock) {
  if (!existingBody) return managedBlock;

  const starts = countOccurrences(existingBody, DELIMITER_START);
  const ends = countOccurrences(existingBody, DELIMITER_END);

  if (starts === 1 && ends === 1) {
    const startIdx = existingBody.indexOf(DELIMITER_START);
    const endIdx = existingBody.indexOf(DELIMITER_END);
    if (startIdx < endIdx) {
      const before = existingBody.slice(0, startIdx);
      const after = existingBody.slice(endIdx + DELIMITER_END.length);
      const oldBlock = existingBody.slice(
        startIdx,
        endIdx + DELIMITER_END.length,
      );
      if (oldBlock === managedBlock) return existingBody;
      return before + managedBlock + after;
    }
  }

  // Malformed: strip all markers, neutralise surviving closing keywords,
  // append a fresh block at the end.
  let surviving = existingBody.split(DELIMITER_START).join('');
  surviving = surviving.split(DELIMITER_END).join('');
  surviving = neutralizeClosingKeywords(surviving);
  surviving = surviving.replace(/\s+$/u, '');
  return surviving + '\n\n' + managedBlock;
}

function asLabelName(label) {
  if (typeof label === 'string') return label;
  if (label && typeof label.name === 'string') return label.name;
  return '';
}

function countOccurrences(haystack, needle) {
  if (!needle) return 0;
  let count = 0;
  let idx = 0;
  while ((idx = haystack.indexOf(needle, idx)) !== -1) {
    count++;
    idx += needle.length;
  }
  return count;
}
