# @\_linked/s3

## 1.3.1

### Patch Changes

- [#23](https://github.com/linked-fw/s3/pull/23) [`cdc35a1`](https://github.com/linked-fw/s3/commit/cdc35a15181651c8ffca858e9c2187365366a16c) Thanks [@flyon](https://github.com/flyon)! - Compile the whole `src` folder, and let a bare import resolve under Node10.

  The build only emitted what an entry transitively reached, so any module
  nothing imported was never built — and never type-checked, so it rotted
  quietly. `include` now covers `src/**/*` with tests excluded explicitly.

  `typesVersions` maps every specifier through `lib/esm/*`, so a `types` value
  that already carried that prefix had it applied twice and no consumer on
  classic Node10 resolution could `import` the package by its bare name.

## 1.3.0

### Minor Changes

- [#21](https://github.com/linked-fw/s3/pull/21) [`b5c6464`](https://github.com/linked-fw/s3/commit/b5c6464b0c93b09161f8c476aaf9e480eb4a45a3) Thanks [@flyon](https://github.com/flyon)! - `S3Bucket` no longer extends `Shape`, and drops `@linkedShape` with its
  `static targetClass`.

  Completes what `S3FileStore` started. The class used nothing from `Shape`: no
  `this.id`, no `this.uri`, no `nodeShape`, no Shape statics, no property
  decorators. `label` is its own field. The only inherited behaviour was a
  `super()` call that deliberately passed `undefined` for the string form — doing
  nothing — and both construction sites pass a string.

  **One observable change, unlike the earlier store migrations.** Those three never
  carried `@linkedShape`, so removing `extends Shape` was inert. This one does, and
  `linkedShape` is typed `<T extends typeof Shape>`, so the decorator has to go too.
  That means S3Bucket's auto-minted NodeShape disappears from `getAllShapeClasses()`,
  and therefore from `indexShapesIntoMemory` and from `syncShapes` materialization.
  Since `syncShapes` prunes orphans, a dataset that already holds that NodeShape
  will have it removed on the next sync.

  That shape was propertyless, and `s3:Bucket` has no RDF definition in this
  package's ontology data (`src/data/s3.json` defines only the scaffold's
  `s3:ExampleClass`), so nothing described it and no reader of it was found. Bumped
  `minor` rather than `patch` because it is a registration change, not purely
  internal.

## 1.2.2

### Patch Changes

- [#19](https://github.com/linked-fw/s3/pull/19) [`36e930c`](https://github.com/linked-fw/s3/commit/36e930cf28a3b9c3288744a9291a1d7ba509f859) Thanks [@flyon](https://github.com/flyon)! - `S3FileStore` no longer extends `Shape`, and drops its inert `static targetClass`.

  It used nothing from `Shape`: no `this.id`, no `this.uri`, no `nodeShape`, no Shape
  statics, and no caller treats it as one. `label` is its own field, not an inherited
  one. `targetClass` was already dead — it is only ever read by `@linkedShape`, which
  this class never carried, and `s3:FileStore` is not defined in this package's
  ontology data.

  The old `super()` minted `${DATA_ROOT}/s3-filestore/${name}` with a comment saying
  the URI had to match between frontend and backend. Nothing read it: the only
  occurrence of that path anywhere in the codebase was the `super()` call itself.

  Stores and datasets stopped being Shapes deliberately in core `0e8c86e`
  ("datasets are not shapes"). No API change — the constructor signature is unchanged
  and the class still implements `IFileStore` in full.

## 1.2.1

### Patch Changes

- [#9](https://github.com/linked-fw/s3/pull/9) [`ef9ab8f`](https://github.com/linked-fw/s3/commit/ef9ab8fd5d92fd785459addab58f5fe8078d69c6) Thanks [@flyon](https://github.com/flyon)! - Declare npm as the package manager for this repo and mark `package-lock.json` as a generated file.

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
