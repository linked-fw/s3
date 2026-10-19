---
summary: >
  `@_linked/s3` no longer declares `@_linked/server` as a dependency. Nothing in the package
  imported it, and the declared `^2.5.1` range would have left a nested 2.x copy of the server
  under `@_linked/s3` once consumers moved to `@_linked/server` 3.0. Released in 1.6.3.
---

# 001 — Drop the unused `@_linked/server` dependency

## What changed

- `package.json`: `@_linked/server` (`^2.5.1`) removed from `dependencies`.
- `package-lock.json`: refreshed with `npm uninstall @_linked/server` (npm 12.2.0); the server
  package and its transitive dependencies are gone, nothing else was bumped.

Released as `@_linked/s3` 1.6.3 (patch: "Drop the unused `@_linked/server` dependency.").
No public API change.

## Why

The `@_linked/server` 3.0 major was coming. A stale `^2.5.1` range on a package that never imports
the server would install a second, nested 2.x copy of it (with its own dependency tree) under
`@_linked/s3` in every consumer.

## Verification

- A search for `@_linked/server` (excluding `@_linked/server-utils`) across src, tests, configs
  and scripts found only the removed `package.json` line and a prose mention in `README.md`.
- `npm ci`, `npx linked build` and `npm test` (jest and typecheck; 2 suites, 66 tests) passed.

## Follow-ups

None in this repo. The consumer-side `npm ls @_linked/server` check is recorded in Create Now's
plan 068 (step R2).

## PRs

- https://github.com/linked-fw/s3/pull/61
