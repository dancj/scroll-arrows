import { describe, it, expect } from 'vitest';
import { releaseChangelogRun } from './releaseChangelogRun.mjs';

const now = () => new Date('2026-06-19T00:00:00Z');

function makeExec(routes, sink) {
  return async (cmd, args) => {
    const key = [cmd, ...args].join(' ');
    if (sink) sink.push(key);
    for (const [pat, val] of routes)
      if (key.includes(pat)) return { stdout: val };
    return { stdout: '' };
  };
}

function makeFs(files) {
  return {
    readFile: async (p) => {
      const hit = Object.keys(files).find((k) => p.endsWith(k));
      if (!hit) throw new Error(`no stub for ${p}`);
      return files[hit];
    },
    writeFile: async (p, data) => {
      const hit = Object.keys(files).find((k) => p.endsWith(k));
      files[hit ?? p] = data;
    },
  };
}

const PKG = JSON.stringify(
  { name: 'scroll-arrows', version: '0.1.0' },
  null,
  2,
);
const CHANGELOG = '# Changelog\n\n## [Unreleased]\n';
const STAGING_PRS = JSON.stringify([
  {
    number: 1,
    title: 'feat: arrows',
    mergedAt: '2026-06-18T00:00:00Z',
    author: { login: 'dan' },
  },
]);

describe('releaseChangelogRun', () => {
  it('skips when HEAD is not a merge commit', async () => {
    const exec = makeExec([['log -1 --format=%P', 'abc123']]); // single parent
    const fs = makeFs({ 'package.json': PKG, 'CHANGELOG.md': CHANGELOG });
    const res = await releaseChangelogRun({
      gh: async () => ({ stdout: '' }),
      exec,
      now,
      ...fs,
    });
    expect(res).toEqual({ skipped: true, reason: 'not-a-merge-commit' });
  });

  it('tags, bumps files, opens a sync PR, and dispatches publish on the happy path', async () => {
    const log = [];
    const exec = makeExec(
      [
        ['log -1 --format=%P', 'p1 p2'],
        ['tag --list', ''], // no tags -> version from package.json
      ],
      log,
    );
    // Record gh calls into the same log so cross-tool ordering is assertable.
    const gh = async (...a) => {
      log.push(['gh', ...a].join(' '));
      if (a[1] === 'list') return { stdout: STAGING_PRS };
      if (a[1] === 'create')
        return { stdout: 'https://github.com/o/r/pull/77' };
      return { stdout: '' };
    };
    const files = { 'package.json': PKG, 'CHANGELOG.md': CHANGELOG };
    const fs = makeFs(files);
    const res = await releaseChangelogRun({ gh, exec, now, ...fs });

    expect(res).toMatchObject({
      version: '0.2.0',
      tag: 'v0.2.0',
      prNumber: 77,
    });
    expect(JSON.parse(files['package.json']).version).toBe('0.2.0');
    expect(files['CHANGELOG.md']).toContain('## [0.2.0] - 2026-06-19');
    expect(log.some((k) => k.includes('tag v0.2.0'))).toBe(true);
    expect(log.some((k) => k.includes('push origin v0.2.0'))).toBe(true);
    expect(log.some((k) => k.includes('checkout -b release-0.2.0'))).toBe(true);

    // Dispatches release.yml with the computed tag (the publish trigger).
    const dispatch = log.find(
      (k) =>
        k.includes('gh workflow run release.yml') && k.includes('tag=v0.2.0'),
    );
    expect(dispatch).toBeTruthy();
    // Dispatch must happen after the tag is pushed.
    const pushIdx = log.findIndex((k) => k.includes('push origin v0.2.0'));
    const dispatchIdx = log.findIndex((k) =>
      k.includes('gh workflow run release.yml'),
    );
    expect(dispatchIdx).toBeGreaterThan(pushIdx);
  });

  it('does not dispatch publish when HEAD is not a merge commit', async () => {
    const ghCalls = [];
    const exec = makeExec([['log -1 --format=%P', 'abc123']]); // single parent
    const gh = async (...a) => {
      ghCalls.push(['gh', ...a].join(' '));
      return { stdout: '' };
    };
    const fs = makeFs({ 'package.json': PKG, 'CHANGELOG.md': CHANGELOG });
    const res = await releaseChangelogRun({ gh, exec, now, ...fs });

    expect(res).toEqual({ skipped: true, reason: 'not-a-merge-commit' });
    expect(ghCalls.some((k) => k.includes('workflow run'))).toBe(false);
  });
});
