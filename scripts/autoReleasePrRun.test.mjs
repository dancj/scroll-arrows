import { describe, it, expect } from 'vitest';
import { autoReleasePrRun } from './autoReleasePrRun.mjs';

const now = () => new Date('2026-06-19T00:00:00Z');
const readPkg = async () => JSON.stringify({ version: '0.1.0' });

// Route git calls by a substring of their argv.
function makeExec(routes) {
  return async (cmd, args) => {
    const key = [cmd, ...args].join(' ');
    for (const [pat, val] of routes)
      if (key.includes(pat)) return { stdout: val };
    return { stdout: '' };
  };
}

const STAGING_PRS = JSON.stringify([
  {
    number: 1,
    title: 'feat: arrows',
    mergedAt: '2026-06-18T00:00:00Z',
    author: { login: 'dan' },
  },
]);

describe('autoReleasePrRun', () => {
  it('skips when staging is not ahead of main', async () => {
    const exec = makeExec([['rev-list --count', '0']]);
    const gh = async () => ({ stdout: '' });
    const res = await autoReleasePrRun({ gh, exec, now, readFile: readPkg });
    expect(res).toEqual({ skipped: true, reason: 'no-op' });
  });

  it('creates a release PR (no tags -> version from package.json + feat bump)', async () => {
    const exec = makeExec([
      ['rev-list --count', '2'],
      ['tag --list', ''], // no tags
    ]);
    const calls = [];
    const gh = async (...args) => {
      calls.push(args);
      if (
        args[0] === 'pr' &&
        args[1] === 'list' &&
        args.includes('staging') &&
        args.includes('merged')
      ) {
        return { stdout: STAGING_PRS };
      }
      if (args[0] === 'pr' && args[1] === 'list') return { stdout: '' }; // no existing PR
      if (args[0] === 'pr' && args[1] === 'create')
        return { stdout: 'https://github.com/o/r/pull/42' };
      return { stdout: '' };
    };
    const res = await autoReleasePrRun({ gh, exec, now, readFile: readPkg });
    expect(res).toMatchObject({
      action: 'created',
      prNumber: 42,
      version: '0.2.0',
    });
    const create = calls.find((c) => c[1] === 'create');
    expect(create).toContain('staging');
    expect(create.join(' ')).toContain('Release: staging to main (v0.2.0)');
  });

  it('skips when the only merged PR since the tag is a sync-back PR', async () => {
    // Reproduces the release ⇄ sync cycle: a `chore: sync release` merge to
    // staging must not manufacture another release PR.
    const exec = makeExec([
      ['rev-list --count', '1'], // staging ahead (the sync merge commit)
      ['tag --list', 'v0.2.0'],
      ['log -1 --format=%aI', '2026-06-18T00:00:00Z'],
    ]);
    const calls = [];
    const gh = async (...args) => {
      calls.push(args);
      if (args[1] === 'list' && args.includes('merged')) {
        return {
          stdout: JSON.stringify([
            {
              number: 7,
              title: 'chore: sync release v0.2.0 (changelog + version)',
              mergedAt: '2026-06-18T01:00:00Z',
              author: { login: 'github-actions[bot]' },
            },
          ]),
        };
      }
      return { stdout: '' };
    };
    const res = await autoReleasePrRun({ gh, exec, now, readFile: readPkg });
    expect(res).toEqual({ skipped: true, reason: 'no-releasable-prs' });
    expect(calls.find((c) => c[1] === 'create')).toBeUndefined();
  });

  it('updates the existing release PR in place', async () => {
    const exec = makeExec([
      ['rev-list --count', '3'],
      ['tag --list', ''],
    ]);
    const edits = [];
    const gh = async (...args) => {
      if (args[1] === 'list' && args.includes('merged'))
        return { stdout: STAGING_PRS };
      if (args[1] === 'list')
        return {
          stdout: JSON.stringify([
            { number: 9, body: 'old', title: 'Release' },
          ]),
        };
      if (args[1] === 'edit') {
        edits.push(args);
        return { stdout: '' };
      }
      return { stdout: '' };
    };
    const res = await autoReleasePrRun({ gh, exec, now, readFile: readPkg });
    expect(res).toMatchObject({
      action: 'updated',
      prNumber: 9,
      version: '0.2.0',
    });
    expect(edits[0]).toContain('9');
    // Title is refreshed on upsert so it tracks the current computed version.
    expect(edits[0].join(' ')).toContain('Release: staging to main (v0.2.0)');
  });
});
