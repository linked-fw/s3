---
'@_linked/s3': minor
---

`S3Bucket` no longer extends `Shape`, and drops `@linkedShape` with its
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
