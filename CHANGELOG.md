# @\_linked/s3

## 1.7.0

### Minor Changes

- [#66](https://github.com/linked-fw/s3/pull/66) [`1d7d83c`](https://github.com/linked-fw/s3/commit/1d7d83c4d664d2727fb1751bf0da53044fd7caa8) Thanks [@flyon](https://github.com/flyon)! - Ontology data: labels, descriptions and types for every term.
  
  - `src/data/s3.ttl`, copied into `lib/esm/data/` by the build, is the ontology's data: the
    ontology node (`dcterms:title`, `dcterms:description`, `owl:versionInfo`) and all 8 terms of
    `ontologies/s3`, each typed (`owl:Class`, `owl:ObjectProperty` or `owl:DatatypeProperty`) with an
    English `rdfs:label` and `rdfs:comment`, in the deterministic Turtle form.
  - `ontologies/s3` exports `dataFiles` and `loadData` (read through
    `@_linked/core/ontology/loadOntologyFiles`, server only), and the register module passes both, so
    the ontology sync and the shape check read the data.
  - **Breaking:** `src/data/s3.json` (a placeholder) is deleted, so `data/s3.json` is no longer in
    `lib/esm/`, and `loadData()` resolves to the Turtle text (`string[]`) instead of a JSON-LD document.

## 1.6.3

### Patch Changes

- [#61](https://github.com/linked-fw/s3/pull/61) [`f717617`](https://github.com/linked-fw/s3/commit/f717617e61c563010841c8f54ab57a8f8f74311a) Thanks [@flyon](https://github.com/flyon)! - Drop the unused `@_linked/server` dependency. Nothing in the package imports it.

## 1.6.2

### Patch Changes

- [#57](https://github.com/linked-fw/s3/pull/57) [`a4bed35`](https://github.com/linked-fw/s3/commit/a4bed35131d127d135b30e3ebebb4c626c0a92ac) Thanks [@flyon](https://github.com/flyon)! - Build with `linked build` instead of a hand-rolled `tsc` + `copyfiles` script, and drop the `rimraf`/`copyfiles` devDependencies. The published `lib/` output is unchanged.

## 1.6.1

### Patch Changes

- [#54](https://github.com/linked-fw/s3/pull/54) [`c5349d7`](https://github.com/linked-fw/s3/commit/c5349d7bbe3f6f473f8d5f98b205f2502e8edd55) Thanks [@flyon](https://github.com/flyon)! - Publish only the files consumers need; the tarball no longer includes `.changeset/`, `.gitattributes`, `.github/`, `jest.config.cjs`, `renovate.json` or tsconfig files.

## 1.6.0

### Minor Changes

- [#47](https://github.com/linked-fw/s3/pull/47) [`b58d820`](https://github.com/linked-fw/s3/commit/b58d820839545625c568d514fd9e557bbe6c1e80) Thanks [@flyon](https://github.com/flyon)! - The s3 ontology moves from `http://lincd.org/ont/s3/` to `https://linked.cm/ont/s3/`, the first-party scheme every public package uses (`https://linked.cm/ont/{publicSlug}/`).
  
  No data migration is needed: none of its terms (`s3.Bucket`, `s3.FileStore`, `s3.bucket`, …) types stored data or appears in a shape, since `S3Bucket` and `S3FileStore` are plain classes. The prefix key (`s3`) and the `ontologies/s3` module are unchanged; code that hard-codes `http://lincd.org/ont/s3/` must be updated.

## 1.5.3

### Patch Changes

- [#42](https://github.com/linked-fw/s3/pull/42) [`2c8c2e1`](https://github.com/linked-fw/s3/commit/2c8c2e1882a369713b1f9b10bf4eb99a7ddadaa1) Thanks [@renovate](https://github.com/apps/renovate)! - Upgrade `mime` to v4. Content types derived from file names are unchanged for common uploads; `.js` and `.mjs` stay `application/javascript` (mime 4 alone would send `text/javascript`). A few rare extensions follow the updated mime database (e.g. `.aac` → `audio/aac`, `.sql` → `application/sql`, `.mts` → `video/mp2t`, `.es` → none).

## 1.5.2

### Patch Changes

- [#40](https://github.com/linked-fw/s3/pull/40) [`a5dd132`](https://github.com/linked-fw/s3/commit/a5dd132ec716ec8b4925380422a52b7aad1dc497) Thanks [@renovate](https://github.com/apps/renovate)! - Drop the unused `cron` dependency. Nothing in this package imports it, so installs get lighter and behaviour is unchanged.

## 1.5.1

### Patch Changes

- [#31](https://github.com/linked-fw/s3/pull/31) [`e4c009c`](https://github.com/linked-fw/s3/commit/e4c009cf27eb807e1b2a542b77cb0f62dd6d73fe) Thanks [@flyon](https://github.com/flyon)! - Sourcemaps now embed their TypeScript source, so consumers no longer see 'points to missing source files' warnings.

## 1.5.0

### Minor Changes

- [#28](https://github.com/linked-fw/s3/pull/28) [`a3e2308`](https://github.com/linked-fw/s3/commit/a3e2308b78e2c8237eabd395f11d325f775360a3) Thanks [@flyon](https://github.com/flyon)! - Require `@_linked/core@^2.22.8` (was `^2.21.0`), and pin it in the lockfile.

  The declared range was wide enough that the resolved core depended on whatever the
  consumer — or this repo's own CI, via `package-lock.json` — happened to install. Core
  decides how a shape's IRI is minted, so a stale core made this package emit legacy
  `data.lincd.org` IRIs instead of the arch-02 `linked.cm` scheme. Which IRIs a published
  package produces should not be a function of the installer's dependency tree.

  Minor rather than patch: this raises the minimum core a consumer must resolve, so it
  changes what gets installed rather than only what this package does internally.

## 1.4.1

### Patch Changes

- [#26](https://github.com/linked-fw/s3/pull/26) [`e4c7ebe`](https://github.com/linked-fw/s3/commit/e4c7ebe7e78533fee0eada1eddab0575ed8fa53d) Thanks [@flyon](https://github.com/flyon)! - The ontology no longer registers by importing itself.

  It carried `import * as _this from './<prefix>.js'` and passed that namespace to
  `linkedOntology()`. Under `tsc` the self-reference survives; under a bundler it does
  not — Rollup treats it as a circular import and elides it, so the binding is
  `undefined` and a consuming app dies at boot with `_this is not defined`.

  Registration now lives in a `<prefix>.register.ts` sibling, imported from the package
  entry. Nothing changes for consumers: importing this package still registers the
  ontology.

## 1.4.0

### Minor Changes

- [#17](https://github.com/linked-fw/s3/pull/17) [`f8d5740`](https://github.com/linked-fw/s3/commit/f8d5740b37cb5f77b62b482465ff2777ce8de2f5) Thanks [@flyon](https://github.com/flyon)! - Configure bucket CORS for cross-origin asset hosting.

  `S3Bucket` gains `getBucketCors()`, `putBucketCors(rules)` and an idempotent
  `ensureCors(origins, options)` that writes the rule a CDN-hosted release needs
  (GET/HEAD, the given origins, exposed ETag and content headers, a max age).
  `getBucketCors()` returns `null` instead of throwing when the bucket has no
  configuration, and `ensureCors` reports `status: 'forbidden'` with an
  actionable message rather than throwing when the credentials may not read or
  set bucket configuration — the normal case on Cloudflare R2 and other providers
  that keep bucket CORS out of reach of object-scoped tokens.

  For deployments that cannot configure the bucket from code, `checkCorsAccess`
  (and `S3FileStore.checkAssetCors`) verifies from the outside, using only public
  read access, that an asset really is loadable from a given page origin.
  `S3FileStore` also exposes `ensureCors`.

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
