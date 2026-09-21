---
'@_linked/s3': patch
---

`S3FileStore` no longer extends `Shape`, and drops its inert `static targetClass`.

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
