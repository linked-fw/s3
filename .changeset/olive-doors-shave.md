---
'@_linked/s3': minor
---

Configure bucket CORS for cross-origin asset hosting.

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
