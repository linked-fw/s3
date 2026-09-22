# lincd-s3

A plug-n-play solution for using an S3 Bucket in LINCD.

In place of your usual backend store, you can use the following to get started with S3:

```ts
// ...
const {
  LinkedFileStorage,
} = require('@_linked/core/lib/utils/LinkedFileStorage');
const { LinkedStorage } = require('@_linked/core/lib/utils/LinkedStorage');
const { S3QuadStore } = require('lincd-s3/lib/shapes/S3QuadStore');
const { S3FileStore } = require('lincd-s3/lib/shapes/S3FileStore');

// This translates to be the Object name in the bucket. If no object
// is found with this name, then one will be created - just like how a
// regular NodeFileStore works!
const QUADSTORE_NAME = 'foo-bar-data';
const s3Quads = new S3QuadStore(QUADSTORE_NAME);

LinkedStorage.setDefaultStore(s3Quads);

// Set up an S3 Filestore
const FILESTORE_NAME = 'baz-qux-files';
const s3Files = new S3FileStore(FILESTORE_NAME);

LinkedFileStorage.setDefaultStore(s3Files);
// ...
```

## Saving files

`saveFile` takes core's `SaveFileOptions` as its third argument:

```ts
await s3Files.saveFile('img/hero.webp', bytes, {
  mimeType: 'image/webp',
  cacheControl: 'public, max-age=31536000, immutable',
  metadata: { release: '1.0.0' },
  preventDuplicates: false,
});
```

`cacheControl` and `metadata` are only sent to S3 when you give them, so the
bucket's own defaults keep applying otherwise. The old positional form still
works — a plain string is read as the mime type, with `preventDuplicates`
following it:

```ts
await s3Files.saveFile('img/hero.webp', bytes, 'image/webp', true);
```

### S3FileStore overwrites by default

`preventDuplicates` left unspecified means `false` **here**. Saving to a path
that is already taken replaces the object; only an explicit `true` renames the
file (to `<dir>/<timestamp>-<name>`).

Core deliberately supplies no default: an unspecified `preventDuplicates`
travels through `LinkedFileStorage` as `undefined` and each store decides for
itself. Do not assume this store's choice holds elsewhere — `LocalFileStore` in
`@_linked/server`, for instance, suffixes by default.

## Reading file metadata

`statFile(path)` reads `HeadObject` on the same key `saveFile` would write, and
returns `{size, sha256?, etag?}` — or `null` when the object does not exist:

```ts
const stat = await s3Files.statFile('img/hero.webp');
if (stat === null) throw new Error('upload went missing');

if (stat.size !== bytes.length) throw new Error('size mismatch');

if (stat.sha256) {
  // only verifiable when the object carries an S3 checksum
  if (stat.sha256 !== expectedSha256) throw new Error('content mismatch');
}
```

- `sha256` comes from the object's `ChecksumSHA256` and is therefore present
  **only when the object was uploaded with an S3 checksum**. Without one, treat
  the file as "cannot verify".
- `etag` is **not** a content hash. It is MD5 at best, and something else
  entirely for multipart uploads. Never compare it against a sha256 or any other
  digest you computed yourself.
- `size` is reported as `0` when the endpoint omits `ContentLength`, so a
  verify-after-upload size check fails closed.

### S3Bucket.headObject

`S3Bucket.headObject(key)` is public and is the single existence check in this
package. It returns the `HeadObjectCommandOutput`, or `null` when the object is
absent — handling both the SDK's `NotFound` and the bare 404 some S3-compatible
endpoints return — and rethrows every other error.

```ts
const head = await bucket.headObject('img/hero.webp');
if (head === null) {
  // not there
}
```

`fileExists` is built on it, so checking whether a path is taken no longer
downloads the object that is about to be overwritten.

## CORS for a CDN-hosted release

`linked build-app` bakes Vite's `base` to the release URL, so a release served
from a bucket loads its dynamic-import chunks from that bucket rather than from
the app origin. Module scripts are **always** fetched in CORS mode, so without
an `Access-Control-Allow-Origin` header on the bucket's responses those chunks
simply fail to load — the first route that lazy-loads breaks, while the initial
HTML looks fine.

The rule to set is narrow: `GET` and `HEAD`, your app origins, `ETag` and the
content headers exposed (range requests and cache validation need them), and a
`MaxAgeSeconds` so browsers stop re-preflighting.

```ts
const result = await store.ensureCors(['https://app.example'], {
  maxAgeSeconds: 3600,
});
console.log(result.status); // 'updated' | 'unchanged' | 'forbidden'
```

`ensureCors` reads the current configuration first and writes nothing when an
equivalent rule is already in place. It keeps any unrelated rules the bucket
already carries; pass `{replace: true}` to overwrite them instead. The lower
level `S3Bucket.putBucketCors(rules)` and `S3Bucket.getBucketCors()` are there
when you want the raw calls — `getBucketCors()` returns `null` rather than
throwing when the bucket has no configuration at all.

### Many providers will not let you set this from code

**Expect `status: 'forbidden'`.** Object-scoped credentials — Cloudflare R2
tokens in particular — can read and write objects but get a `403` on
`GetBucketCors` and `PutBucketCors`. `ensureCors` reports that instead of
throwing, and tells you to set the rule in the provider's dashboard (or with an
account-level token). Treat it as best effort: on most deployments the CORS
rule is a one-time dashboard setting, and what you actually want in CI is the
check below.

### Verifying

Verification needs only public read access, so it works everywhere:

```bash
curl -sI -H 'Origin: https://app.example' https://cdn.example/releases/1.2.3/assets/app.js
```

Look for `access-control-allow-origin` in the response. Programmatically:

```ts
const check = await store.checkAssetCors('assets/app.js', 'https://app.example');
if (!check.ok) {
  throw new Error(check.message); // also carries the equivalent curl one-liner
}
```

`checkCorsAccess(url, origin)` from `@_linked/s3/utils/cors.js` does the same
against any URL, and never rejects — a network failure comes back as
`{ok: false, error}`.

## Registering the store

Registering stores by purpose (`LinkedFileStorage.setStore`, `getStore`,
`registerPurpose`) is core's concern, not this package's — see
[`@_linked/core`](https://github.com/linked-cm/core) and its
`utils/LinkedFileStorage` / `interfaces/IFileStore`.

## Environment Variables

Unless stated otherwise, the following environment variables are required:

```properties
# Generated using whatever service is hosting your bucket
AWS_ACCESS_KEY_ID=ABC123XYZ789
AWS_SECRET_ACCESS_KEY=aBc123Def456xYz789

# The endpoint on which your bucket resides. It's important to note that
# this is the HOST address of your bucket - i.e. it SHOULDN'T contain
# your bucket name!!
S3_BUCKET_ENDPOINT=https://my.bucket-provider.com

# The name of your buckets
S3_FILES_BUCKET_NAME=my-file-bucket
S3_QUADS_BUCKET_NAME=my-data-bucket

# OPTIONAL: If using a CDN, you can specify the URL here and it will be used
S3_CDN_URL=https://my.cdn-provider.com
```

The S3 client will automagically form the correct URL for your bucket - in this case it would
be https://my-data-bucket.my.bucket-provider.com or https://my-file-bucket.my.bucket-provider.com

## See also:

- [lincd-filebase](https://www.npmjs.com/package/lincd-filebase) - An implementation
  for [filebase](https://filebase.com) IPFS bucket storage
