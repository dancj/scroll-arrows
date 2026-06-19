import { describe, it, expect } from 'vitest';
import {
  renderReleaseBody,
  injectIntoBody,
  DELIMITER_START,
  DELIMITER_END,
} from './buildReleasePrBody.mjs';

const prs = [
  { number: 1, title: 'feat: arrows', author: { login: 'dan' } },
  { number: 2, title: 'fix: jitter', author: { login: 'dan' } },
  { number: 3, title: 'chore: ci', author: { login: 'bot' } },
];

describe('renderReleaseBody', () => {
  it('wraps content in the managed delimiters with a version header', () => {
    const body = renderReleaseBody({ prs, version: '0.2.0' });
    expect(body.startsWith(DELIMITER_START)).toBe(true);
    expect(body.endsWith(DELIMITER_END)).toBe(true);
    expect(body).toContain('Proposed release: `v0.2.0`');
  });
  it('groups PRs into ordered sections', () => {
    const body = renderReleaseBody({ prs });
    expect(body).toContain('## Features');
    expect(body).toContain('- #1 — feat: arrows (@dan)');
    expect(body).toContain('## Fixes');
    expect(body).toContain('## Maintenance');
    expect(body.indexOf('## Features')).toBeLessThan(body.indexOf('## Fixes'));
  });
  it('renders a Closes section when issues are present', () => {
    const body = renderReleaseBody({ prs: [], closesIssues: [4, 9] });
    expect(body).toContain('Closes #4, Closes #9');
  });
});

describe('injectIntoBody', () => {
  it('returns the block verbatim for an empty body', () => {
    const block = renderReleaseBody({ prs, version: '0.2.0' });
    expect(injectIntoBody('', block)).toBe(block);
  });
  it('replaces an existing managed block in place, preserving surrounding text', () => {
    const old = renderReleaseBody({ prs: [prs[0]], version: '0.1.1' });
    const wrapped = `Intro\n\n${old}\n\nOutro`;
    const next = renderReleaseBody({ prs, version: '0.2.0' });
    const out = injectIntoBody(wrapped, next);
    expect(out.startsWith('Intro')).toBe(true);
    expect(out.endsWith('Outro')).toBe(true);
    expect(out).toContain('v0.2.0');
    expect(out).not.toContain('v0.1.1');
  });
  it('is idempotent when the block is unchanged', () => {
    const block = renderReleaseBody({ prs, version: '0.2.0' });
    const wrapped = `Head\n\n${block}\n\nTail`;
    expect(injectIntoBody(wrapped, block)).toBe(wrapped);
  });
  it('recovers from a malformed body by stripping markers and appending', () => {
    const block = renderReleaseBody({ prs, version: '0.2.0' });
    const malformed = `${DELIMITER_START} stray ${DELIMITER_START} text`;
    const out = injectIntoBody(malformed, block);
    expect(out.split(DELIMITER_START).length - 1).toBe(1); // exactly one block
    expect(out.endsWith(DELIMITER_END)).toBe(true);
  });
});
