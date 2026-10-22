---
'@_linked/s3': minor
---

Ontology data: labels, descriptions and types for every term.

- `src/data/s3.ttl`, copied into `lib/esm/data/` by the build, is the ontology's data: the
  ontology node (`dcterms:title`, `dcterms:description`, `owl:versionInfo`) and all 8 terms of
  `ontologies/s3`, each typed (`owl:Class`, `owl:ObjectProperty` or `owl:DatatypeProperty`) with an
  English `rdfs:label` and `rdfs:comment`, in the deterministic Turtle form.
- `ontologies/s3` exports `dataFiles` and `loadData` (read through
  `@_linked/core/ontology/loadOntologyFiles`, server only), and the register module passes both, so
  the ontology sync and the shape check read the data.
- **Breaking:** `src/data/s3.json` (a placeholder) is deleted, so `data/s3.json` is no longer in
  `lib/esm/`, and `loadData()` resolves to the Turtle text (`string[]`) instead of a JSON-LD document.
