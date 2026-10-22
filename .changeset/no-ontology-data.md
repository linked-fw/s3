---
'@_linked/s3': minor
---

The ontology registers without data. `src/data/s3.json` held a placeholder (`s3:ExampleClass`, which nothing uses), so it is deleted and
the ontology no longer passes a `loadData`; apps stop logging that its data "is not Turtle text;
skipped".

- **Breaking:** the `loadData` export of `ontologies/s3` is removed, and `data/s3.json` is no
  longer in `lib/esm/`.
