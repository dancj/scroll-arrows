---
title: 'chore: Resolve open issues (#5 engines, #6 community health, #7 provenance)'
type: chore
date: 2026-06-19
status: ready
depth: standard
origin: GitHub issues #5, #6, #7
---

# chore: Resolve open issues (#5 engines, #6 community health, #7 provenance)

## Summary

Close the three open GitHub issues on `scroll-arrows`:

- **#6** — Add the standard OSS community-health files (`CONTRIBUTING.md`, `SECURITY.md`, issue templates, PR template). Pure docs.
- **#5** — Reconcile the Node version contract: `package.json` declares `engines.node >=18` while CI/`.nvmrc` pin Node 24. Keep the broad consumer contract (`>=18`) and make it honest by testing Node 18 in CI.
- **#7** — Provenance is **already implemented** in `.github/workflows/release.yml` (`npm publish --provenance --access public` with `id-token: write`). This is a verification-only unit: confirm the provenance badge appears after the next release, then close the issue.

This is a low-risk, mostly-docs cleanup. No library source (`src/`) changes.

---

## Problem Frame

The package is published and functional, but three repo-hygiene gaps remain open as issues:

1. **Contract mismatch (#5):** the published `engines` field claims Node `>=18` support that nothing actually exercises — dev env, `.nvmrc`, and all CI jobs run Node 24. Either the claim is untested or it is wrong.
2. **Missing community files (#6):** `.github/` contains only workflows. GitHub's community profile is incomplete and contributors have no documented setup, security-reporting, or contribution path.
3. **Provenance follow-through (#7):** the release workflow already passes `--provenance`; the issue tracks confirming the resulting sigstore attestation actually lands on the npm page.

Scope is repo metadata, docs, and CI config. No behavior change to the shipped library.

---

## Requirements

| ID  | From | Requirement                                                                                                    |
| --- | ---- | -------------------------------------------------------------------------------------------------------------- |
| R1  | #6   | Add `CONTRIBUTING.md` covering dev setup (`npm ci`, lint/format/test/build) and the staging→main branch flow.  |
| R2  | #6   | Add `SECURITY.md` with a private vuln-report path and supported-versions note.                                 |
| R3  | #6   | Add `.github/ISSUE_TEMPLATE/` with bug-report and feature-request templates.                                   |
| R4  | #6   | Add `.github/PULL_REQUEST_TEMPLATE.md`.                                                                        |
| R5  | #5   | Make the published Node contract and the tested Node versions agree.                                           |
| R6  | #7   | Confirm provenance/sigstore attestation shows on the npm package page after the next release; close the issue. |

---

## Key Technical Decisions

**KTD1 — Keep `engines.node >=18`, add a Node 18 CI matrix entry (resolves #5).**
`scroll-arrows` is a browser-targeted library; `engines` constrains consumers' build/install tooling, not a runtime. Dropping to `>=24` would needlessly exclude consumers on Node 18/20 LTS who can build the package fine. The honest fix is to keep the broad contract and _test_ it: add Node 18 to the CI `build` job via a matrix so lint/typecheck/coverage/build run under 18. Dev tooling (`.nvmrc` 24) and the publish job stay on 24 — those are build-host choices, not the consumer contract.

- _Alternative considered:_ bump `engines` to `>=24` to match `.nvmrc`/CI. Rejected — it tightens the consumer contract with no real benefit for a browser lib and is more restrictive than necessary.

**KTD2 — #7 is verification-only, not implementation.**
`release.yml` already runs `npm publish --provenance --access public` with `permissions.id-token: write`, and the README "Releasing" section already documents provenance. No workflow edit is needed. The unit confirms the attestation renders on npmjs.com after the next `v*` tag and then closes the issue. Closing now (before the next publish) is also acceptable since the config is correct; the plan defaults to verify-then-close.

**KTD3 — Community files mirror the existing README as the source of truth.**
`CONTRIBUTING.md` reuses the README "Develop" and "Releasing" sections (staging→main flow, `npm run demo/test/coverage/build`) rather than inventing a new process, so docs stay consistent.

---

## Scope Boundaries

In scope: community-health markdown files, CI matrix change, `engines` confirmation, provenance verification.

### Deferred to Follow-Up Work

- CI caching/perf tuning beyond adding the matrix entry.
- A `CODE_OF_CONDUCT.md` (not requested by #6).
- Funding/`FUNDING.yml` metadata.

Non-goals: any change to `src/` library behavior, release-script logic, or the OIDC trusted-publishing setup.

---

## Implementation Units

### U1. Add community-health files (#6)

- **Goal:** Complete GitHub's community profile and give contributors documented setup, security, issue, and PR paths.
- **Requirements:** R1, R2, R3, R4.
- **Dependencies:** none.
- **Files:**
  - `CONTRIBUTING.md` (create)
  - `SECURITY.md` (create)
  - `.github/ISSUE_TEMPLATE/bug_report.md` (create)
  - `.github/ISSUE_TEMPLATE/feature_request.md` (create)
  - `.github/ISSUE_TEMPLATE/config.yml` (create — optional, sets `blank_issues_enabled` and links)
  - `.github/PULL_REQUEST_TEMPLATE.md` (create)
- **Approach:**
  - `CONTRIBUTING.md`: dev setup (`npm ci`), the script table (`lint`, `format:check`, `typecheck`, `test`, `coverage`, `build`), and the staging→main flow + conventional-commit PR titles, sourced from the README "Develop" and "Releasing" sections. Note coverage gate (90% on pure logic).
  - `SECURITY.md`: GitHub private vulnerability reporting (no public issues for vulns); supported versions = latest published minor.
  - Issue templates: standard GitHub markdown front-matter templates (name/about/labels). Bug report = repro steps, expected/actual, env (browser, framework, version). Feature request = problem, proposed solution, alternatives.
  - PR template: short checklist (tests pass, lint/format clean, conventional-commit title, docs updated if needed) aligned to the release automation that parses PR titles.
- **Patterns to follow:** README tone and the existing release flow described in `README.md`.
- **Test scenarios:** Test expectation: none — pure documentation/metadata, no behavioral code. Verification is structural (files exist, valid template front-matter).
- **Verification:** Files exist at the listed paths; issue/PR templates render in the GitHub "New issue"/"New PR" UI; GitHub community-profile checklist shows the items satisfied.

### U2. Reconcile Node engines contract via CI matrix (#5)

- **Goal:** Make the published `engines.node >=18` claim honest by testing Node 18 in CI, with no change to the consumer contract.
- **Requirements:** R5.
- **Dependencies:** none.
- **Files:**
  - `.github/workflows/ci.yml` (modify — add a Node-version matrix to the `build` job: `[18, 24]`)
  - `package.json` (confirm only — leave `engines.node` as `>=18`)
- **Approach:** Convert the `build` job to a `strategy.matrix.node-version: [18, 24]` and reference `matrix.node-version` in `actions/setup-node`. Both versions run lint/format:check/typecheck/coverage/build. Leave `.nvmrc` (24) and the publish job (24) untouched — those are build-host pins, not the consumer contract. Confirm devDependencies install cleanly under Node 18 (`npm ci`); if a dev tool's own `engines` rejects Node 18 during `npm ci`, fall back to KTD1's rejected alternative (bump `engines` to `>=24`) and record why.
- **Patterns to follow:** existing `.github/workflows/ci.yml` step ordering; keep `cache: npm`.
- **Execution note:** This change is validated by CI itself — open the PR and confirm both matrix legs go green before merging. The Node 18 leg passing IS the test for R5.
- **Test scenarios:**
  - CI `build (18)` leg: `npm ci` + lint + format:check + typecheck + coverage + build all succeed on Node 18.
  - CI `build (24)` leg: same steps succeed on Node 24 (regression guard — current behavior preserved).
  - Edge case: if `npm ci` fails on Node 18 due to a devDependency engine constraint, the leg fails loudly → triggers the KTD1 fallback rather than a silent contract mismatch.
- **Verification:** PR CI shows two passing `build` legs (18 and 24); `package.json` `engines.node` unchanged at `>=18`; dev/CI/published contract now agree (the claimed floor is exercised).

### U3. Verify npm provenance and close #7

- **Goal:** Confirm the already-configured provenance produces a sigstore attestation on the npm page, then close the issue.
- **Requirements:** R6.
- **Dependencies:** none (independent of U1/U2). Final confirmation depends on the next `v*` release publishing.
- **Files:** none — `.github/workflows/release.yml` already correct (`npm publish --provenance --access public`, `id-token: write`). No edits expected.
- **Approach:**
  - Confirm `release.yml` retains `--provenance` and `permissions.id-token: write` (already present).
  - After the next release publishes, check `https://www.npmjs.com/package/scroll-arrows` for the provenance/"Built and signed on GitHub Actions" badge.
  - Close issue #7 referencing the confirmation. If closing before the next release, note in the issue that config is verified-correct and the badge will appear on next publish.
- **Patterns to follow:** README "Releasing" section already documents provenance — no doc change needed.
- **Test scenarios:** Test expectation: none — no code change; this is config verification + manual npm-page confirmation.
- **Verification:** `release.yml` unchanged and correct; provenance badge visible on the npm package page after next release (or issue annotated that config is confirmed pending next publish).

---

## System-Wide Impact

- **Contributors:** new onboarding, security-reporting, and issue/PR paths (U1).
- **CI:** doubles the `build` job (two matrix legs) — modest added runtime for a small lib (U2).
- **Consumers:** no change — the published `engines` contract is unchanged; library behavior untouched.
- **Release:** no change — provenance already live (U3).

---

## Risks & Dependencies

- **Low risk overall** — docs + CI config + verification only; no `src/` changes.
- **R-risk (U2):** a devDependency may declare an `engines` floor above Node 18, breaking `npm ci` on the 18 leg. Mitigation: the failing leg surfaces it immediately; fall back to KTD1's alternative (bump `engines` to `>=24`) and document the reason. This is the one place the plan could flip its #5 resolution based on execution-time reality.
- **External dependency (U3):** final provenance confirmation requires a real publish (next `v*` tag); config correctness can be confirmed now regardless.

---

## Sequencing

U1, U2, U3 are independent and can land in any order or together. Suggested: U1 (docs) + U2 (CI) in one PR to `staging`; U3 verification tracked separately since it gates on a release.
