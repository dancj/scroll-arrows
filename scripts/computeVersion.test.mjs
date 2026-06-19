import { describe, it, expect } from 'vitest';
import {
  parseSemver,
  formatSemver,
  isNewer,
  newestVersionTag,
  bumpLevelFromPrs,
  applyBump,
  computeNextVersion,
} from './computeVersion.mjs';

describe('parseSemver', () => {
  it('parses with and without a v prefix', () => {
    expect(parseSemver('1.2.3')).toEqual({ major: 1, minor: 2, patch: 3 });
    expect(parseSemver('v0.1.0')).toEqual({ major: 0, minor: 1, patch: 0 });
  });
  it('ignores prerelease/build metadata', () => {
    expect(parseSemver('2.0.0-rc.1')).toEqual({ major: 2, minor: 0, patch: 0 });
  });
  it('throws on garbage', () => {
    expect(() => parseSemver('nope')).toThrow();
    expect(() => parseSemver('')).toThrow();
  });
});

describe('isNewer / newestVersionTag', () => {
  it('compares numerically, not lexically', () => {
    expect(isNewer(parseSemver('v2.10.0'), parseSemver('v2.9.0'))).toBe(true);
    expect(newestVersionTag(['v2.9.0', 'v2.10.0', 'v2.2.0'])).toBe('v2.10.0');
  });
  it('returns null when nothing parses', () => {
    expect(newestVersionTag(['latest', 'release-2026'])).toBe(null);
  });
});

describe('bumpLevelFromPrs', () => {
  it('defaults to patch', () => {
    expect(bumpLevelFromPrs([{ title: 'chore: tidy' }])).toBe('patch');
  });
  it('bumps minor for a feat', () => {
    expect(bumpLevelFromPrs([{ title: 'fix: x' }, { title: 'feat: y' }])).toBe(
      'minor',
    );
  });
  it('bumps major for a breaking title or body', () => {
    expect(bumpLevelFromPrs([{ title: 'feat!: drop API' }])).toBe('major');
    expect(
      bumpLevelFromPrs([{ title: 'feat: x', body: 'BREAKING CHANGE: nope' }]),
    ).toBe('major');
  });
});

describe('applyBump', () => {
  const base = { major: 1, minor: 2, patch: 3 };
  it('zeroes lower fields on major/minor', () => {
    expect(applyBump(base, 'major')).toEqual({ major: 2, minor: 0, patch: 0 });
    expect(applyBump(base, 'minor')).toEqual({ major: 1, minor: 3, patch: 0 });
    expect(applyBump(base, 'patch')).toEqual({ major: 1, minor: 2, patch: 4 });
  });
});

describe('computeNextVersion', () => {
  it('combines current version with the PR-derived bump', () => {
    expect(computeNextVersion('0.1.0', [{ title: 'feat: a' }])).toBe('0.2.0');
    expect(computeNextVersion('0.1.0', [{ title: 'fix: a' }])).toBe('0.1.1');
    expect(computeNextVersion('0.1.0', [{ title: 'feat!: a' }])).toBe('1.0.0');
  });
  it('round-trips through formatSemver', () => {
    expect(formatSemver(parseSemver('3.4.5'))).toBe('3.4.5');
  });
});
