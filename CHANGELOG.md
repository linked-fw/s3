# @\_linked/s3

## 1.1.0

### Minor Changes

- [`cb74e4c`](https://github.com/linked-cm/s3/commit/cb74e4c8e7bd4055b58e568b57aa74886a02b6cd) - ESM-only. Dropped the CommonJS build; ships ES modules only (`type: module`, no `require` export condition, no `lib/cjs`). Fixed the root `types` field. CJS consumers on Node 22+ can `require()` it (sync ESM) or use dynamic `import()`.

## 1.0.3

### Patch Changes

- [#3](https://github.com/linked-cm/s3/pull/3) [`dfb0f0f`](https://github.com/linked-cm/s3/commit/dfb0f0f21e8fb460ed64f12f4486accdf0b78c5f) Thanks [@flyon](https://github.com/flyon)! - loadData: ESM-only JSON import — drop the dead CJS branch, add the `{ with: { type: 'json' } }` import attribute.

## 1.0.2

### Patch Changes

- [`2a8c5d8`](https://github.com/linked-cm/s3/commit/2a8c5d8288f43270eb666a2a4c6ec745791ecb66) - Initial release under the new publishing setup.
