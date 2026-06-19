import { describe, it, expect } from 'vitest';
import {
  categorizePr,
  extractClosesFromBody,
  aggregateClosesIssues,
  neutralizeClosingKeywords,
  sanitizeTitle,
} from './releaseCategorize.mjs';

describe('categorizePr', () => {
  it('keys off conventional-commit prefixes', () => {
    expect(categorizePr({ title: 'feat: x' })).toBe('Features');
    expect(categorizePr({ title: 'feat(core)!: x' })).toBe('Features');
    expect(categorizePr({ title: 'fix: y' })).toBe('Fixes');
    expect(categorizePr({ title: 'docs: z' })).toBe('Docs');
    expect(categorizePr({ title: 'chore: w' })).toBe('Maintenance');
  });
  it('labels win over the title prefix', () => {
    expect(categorizePr({ title: 'chore: x', labels: ['feature'] })).toBe(
      'Features',
    );
    expect(categorizePr({ title: 'chore: x', labels: ['bug'] })).toBe('Fixes');
  });
});

describe('closes aggregation', () => {
  it('extracts line-anchored closing keywords from a body', () => {
    expect(extractClosesFromBody('Closes #12\nFixes #7')).toEqual([12, 7]);
  });
  it('dedups and sorts across refs + bodies', () => {
    const prs = [
      { closingIssuesReferences: [{ number: 7 }], body: 'Closes #3' },
      { body: 'Resolves #7' },
    ];
    expect(aggregateClosesIssues(prs)).toEqual([3, 7]);
  });
});

describe('neutralizeClosingKeywords', () => {
  it("backtick-wraps so GitHub won't auto-close", () => {
    expect(neutralizeClosingKeywords('Closes #5')).toBe('`Closes #5`');
  });
  it('does not double-wrap already-wrapped text', () => {
    expect(neutralizeClosingKeywords('`Closes #5`')).toBe('`Closes #5`');
  });
});

describe('sanitizeTitle', () => {
  it('strips comment markers + delimiters and collapses whitespace', () => {
    // markers are removed; the text between them survives, whitespace collapses
    expect(sanitizeTitle('feat:  <!-- x --> a')).toBe('feat: x a');
  });
  it('neutralizes closing keywords embedded in a title', () => {
    expect(sanitizeTitle('fix: Closes #9')).toBe('fix: `Closes #9`');
  });
});
