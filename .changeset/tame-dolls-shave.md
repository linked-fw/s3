---
'@_linked/s3': minor
---

Cache-Control and metadata on save, and `statFile` via HeadObject.

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

`S3Bucket.headObject(key)` is new and public: the HeadObject output, or `null`
when the object does not exist, rethrowing every other error. It also fixes
`new S3Bucket(name)` passing `null` into the `Shape` constructor, which throws
with recent `@_linked/core`.

Requires the `SaveFileOptions`/`FileStat`/`normalizeSaveFileOptions` API added in
`@_linked/core` (linked-fw/core#230).
