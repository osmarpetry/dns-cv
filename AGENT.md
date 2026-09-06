# AGENT.md

## 2026-09-06 — Dependabot major bumps: @types/node 22->26, typescript 5.9->7.0

### Merged successfully
- PR #2 `@types/node` 22.20.1 -> 26.4.1: no code changes needed. `tsc --noEmit`
  and `npm test` (83/83) passed as-is on the dependabot commit alone. Purely a
  dev-only type dep bump; doesn't affect runtime.
- PR #1 `typescript` 5.9.3 -> 7.0.2 (the native/Go-port "tsgo" major): no code
  changes needed either. Verified via `dx doc typescript@7.0.2` that TS 6.0
  deprecated (and TS 7.0 removed) `target: es5`, `--downlevelIteration`,
  `moduleResolution: node/classic`, `module: amd/umd/systemjs`, `baseUrl`,
  `esModuleInterop false`, `outFile`, legacy `module` namespace syntax, `asserts`
  keyword on imports. This repo's `tsconfig.json` already uses none of those
  (target es2023, module/moduleResolution nodenext, verbatimModuleSyntax,
  erasableSyntaxOnly) so `tsc --noEmit` passed clean under the new compiler,
  and `npm test` (83/83) passed unchanged.
- Both PRs were independent branches off `main`. Dependabot auto-rebased PR #1
  onto `main` after PR #2 merged (branch touched the same package.json/
  package-lock.json lines) — no manual conflict resolution was needed, just a
  `git reset --hard` to pick up the rebase before re-verifying.
- Both merged via squash: #2 manually (`gh pr merge --squash`, since the
  `dependabot/automerge` job failed with "GitHub Actions is not permitted to
  approve pull requests" — see below); #1 by dependabot's own automerge job
  after the rebase (that run's actor was still `dependabot[bot]`, so automerge
  fired normally).

### Deferred / non-obvious calls
- Nothing deferred — both PRs fully migrated and merged, no version ceiling
  needed.
- `engines.node` left at `>=22.18` on purpose: @types/node 26 is a type-only
  dev dependency, doesn't force a runtime bump. CI runs Node 22 (reusable
  workflow pins node-version "22") and both `typecheck`/`test` passed logically
  independent of the local Node runtime (26.7 here) — types don't change
  runtime behavior.

### Known pre-existing issue (not fixed, out of scope)
- The `dependabot / automerge` job in this repo's `ci.yml` calls
  `gh pr review --approve` before `gh pr merge --auto`, and that fails with
  "GitHub Actions is not permitted to approve pull requests" whenever the PR
  needs a *human*-triggered rerun (e.g. after a manual push, or the first
  build run before any rebase). This is a repo/org Actions permission setting
  (Settings -> Actions -> General -> Workflow permissions -> "Allow GitHub
  Actions to create and approve pull requests"), not something fixable from
  workflow YAML. Worth flipping that setting so automerge doesn't silently
  need a manual `gh pr merge` fallback every time.

### Next steps if resuming similar work
- `dx doctor` currently flags `node 22.18` as security-patch-only since
  2025-10-21 (running 22.23.2). Not urgent, but worth a deliberate Node LTS
  bump pass (and bumping `engines.node`) separate from these type/compiler
  bumps.
- If a future TypeScript major (8.x) lands, rerun `dx doc typescript@<ver>`
  before touching code — this repo's tsconfig is already on the "future-safe"
  options (nodenext, verbatimModuleSyntax, erasableSyntaxOnly), so it's likely
  another no-code-change bump, but verify against real release notes each time.
