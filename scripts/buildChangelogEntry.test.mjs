import { describe, it, expect } from 'vitest';
import {
  renderChangelogEntry,
  injectChangelogEntry,
} from './buildChangelogEntry.mjs';

const date = new Date('2026-06-19T00:00:00Z');

describe('renderChangelogEntry', () => {
  it('renders a Keep a Changelog version header + bullets', () => {
    const entry = renderChangelogEntry({
      version: '0.2.0',
      date,
      prs: [{ number: 1, title: 'feat: x', author: { login: 'dan' } }],
    });
    expect(entry).toContain('## [0.2.0] - 2026-06-19');
    expect(entry).toContain('- #1 — feat: x (@dan)');
  });
});

describe('injectChangelogEntry', () => {
  const base = '# Changelog\n\n## [Unreleased]\n\n## [0.1.0] - 2026-01-01\n';

  it('inserts the new entry directly under [Unreleased]', () => {
    const entry = renderChangelogEntry({ version: '0.2.0', date, prs: [] });
    const out = injectChangelogEntry(base, entry);
    expect(out.indexOf('## [0.2.0]')).toBeLessThan(out.indexOf('## [0.1.0]'));
    expect(out.indexOf('## [Unreleased]')).toBeLessThan(
      out.indexOf('## [0.2.0]'),
    );
  });

  it('throws when the [Unreleased] anchor is missing', () => {
    expect(() => injectChangelogEntry('# Changelog\n', 'x')).toThrow();
  });

  it('keeps exactly one blank line before the following section (prettier-clean)', () => {
    const entry = renderChangelogEntry({
      version: '0.2.0',
      date,
      prs: [{ number: 1, title: 'feat: x', author: { login: 'dan' } }],
    });
    const out = injectChangelogEntry(base, entry);
    expect(out).toContain('- #1 — feat: x (@dan)\n\n## [0.1.0]');
    expect(out).not.toMatch(/\n{3,}## \[0\.1\.0\]/);
  });
});
