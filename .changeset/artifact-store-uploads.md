---
"@_linked/s3": minor
---

## Verified artifact uploads (`IArtifactStore`)

`S3FileStore` now implements `@_linked/core`'s `IArtifactStore` so `@_linked/cli` can publish immutable web release assets safely.

```ts
import { S3FileStore } from '@_linked/s3/shapes/S3FileStore';

const store: IArtifactStore = myStaticFileStore;
store.describeDestination();
await store.putArtifact({ key, body, contentType, cacheControl, sha256 });
await store.statArtifact(key);
```

Also on `S3Bucket`:

- `putObjectOrThrow` — upload that **propagates** errors (legacy `putObject` still swallows)
- `headObject` — metadata for post-upload verification

### Behavioral fix

`new S3Bucket('my-bucket-label')` no longer passes `null` into `Shape`'s constructor (which broke under current Shape init). String args are treated as external bucket labels only.
