# @\_linked/s3

## 1.2.0

### Minor Changes

- [#10](https://github.com/linked-fw/s3/pull/10) [`d3b374e`](https://github.com/linked-fw/s3/commit/d3b374e1f764daac87c52e706a8e9e12ba6087c2) Thanks [@flyon](https://github.com/flyon)! - Cache-Control and metadata on save, and `statFile` via HeadObject.

  `S3FileStore.saveFile` now takes core's `SaveFileOptions` as its third argument
  (`{mimeType, cacheControl, metadata, preventDuplicates}`) and sends
  `CacheControl` and `Metadata` to S3 when they are given. A plain string is still
  read as the positional mime type, with the positional `preventDuplicates`, so
  existing callers are unaffected.

  `S3FileStore.statFile(filePath)` is new: it heads the same key `saveFile` would
  write and returns `{size, sha256, etag}`, or `null` when the object is missing.
  `sha256` comes from `ChecksumSHA256` and is left undefined when the object was
  stored without a checksum — the `ETag` is not a content hash and is never
  reported as one.

  `preventDuplicates` keeps its old meaning. Core reports an unspecified value as
  `undefined` and never invents a default, so `S3FileStore` now applies its own:
  unspecified overwrites, exactly as before; only an explicit `true` renames.

  `S3Bucket.headObject(key)` is new and public: the HeadObject output, or `null`
  when the object does not exist, rethrowing every other error. It handles both
  the SDK's `NotFound` and the bare 404 that some S3-compatible endpoints return,
  and it is now the single existence check in the package — `ensureKeyExists` uses
  it instead of hand-rolling its own detection, so seeding a key works against
  those endpoints too. It also fixes `new S3Bucket(name)` passing `null` into the
  `Shape` constructor, which throws with recent `@_linked/core`.

  `S3FileStore.fileExists` uses HeadObject instead of GetObject: checking whether
  a path is taken no longer downloads the object that is about to be overwritten,
  and a 0-byte object is now correctly reported as existing (GetObject returned an
  empty string, which read as "absent").

  `statFile` reports `size: 0` when the endpoint omits `ContentLength`, so a
  verify-after-upload size check fails closed rather than seeing `undefined`.

  Requires the `SaveFileOptions`/`FileStat`/`normalizeSaveFileOptions` API added in
  `@_linked/core` (linked-fw/core#230), hence the `@_linked/core` bump to
  `^2.20.0` — `normalizeSaveFileOptions` is a runtime export that no published
  2.x has.

## 1.1.1

### Patch Changes

- [#12](https://github.com/linked-fw/s3/pull/12) [`9b5150c`](https://github.com/linked-fw/s3/commit/9b5150c57b87609ed6f456fd9fa80b60dbb76d66) Thanks [@flyon](https://github.com/flyon)! - Point `repository.url` at the linked-fw organisation, so npm provenance verification matches the repository that builds the package.

## 1.1.0

### Minor Changes

- [`cb74e4c`](https://github.com/linked-cm/s3/commit/cb74e4c8e7bd4055b58e568b57aa74886a02b6cd) - ESM-only. Dropped the CommonJS build; ships ES modules only (`type: module`, no `require` export condition, no `lib/cjs`). Fixed the root `types` field. CJS consumers on Node 22+ can `require()` it (sync ESM) or use dynamic `import()`.

## 1.0.3

### Patch Changes

- [#3](https://github.com/linked-cm/s3/pull/3) [`dfb0f0f`](https://github.com/linked-cm/s3/commit/dfb0f0f21e8fb460ed64f12f4486accdf0b78c5f) Thanks [@flyon](https://github.com/flyon)! - loadData: ESM-only JSON import — drop the dead CJS branch, add the `{ with: { type: 'json' } }` import attribute.

## 1.0.2

### Patch Changes

- [`2a8c5d8`](https://github.com/linked-cm/s3/commit/2a8c5d8288f43270eb666a2a4c6ec745791ecb66) - Initial release under the new publishing setup.
