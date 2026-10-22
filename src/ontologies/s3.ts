import { createNameSpace } from '@_linked/core/utils/NameSpace';
import { loadOntologyFiles } from '@_linked/core/ontology/loadOntologyFiles';

/** The package's ontology data, relative to this module (Turtle, copied into `lib/` by the build). */
export const dataFiles = ['../data/s3.ttl'];

/** Reads the package's ontology data (server only). */
export const loadData = () => loadOntologyFiles(import.meta.url, dataFiles);

/**
 * The namespace of this ontology.
 *
 * First-party ontologies live on linked.cm: `https://linked.cm/ont/{ontologySlug}/`, and a
 * package's own ontology takes the package's publicSlug (`@_linked/s3` → `s3`), the same slug its
 * shapes would use under `https://linked.cm/shape/s3/`.
 *
 * Until this release it was `http://lincd.org/ont/s3/`. None of these terms types stored data or
 * appears in a shape (`S3Bucket` and `S3FileStore` are plain classes), so nothing needs migrating.
 */
export var ns = createNameSpace('https://linked.cm/ont/s3/');

export var _self = ns('');

// Classes
export var Bucket = ns('Bucket');
export var FileStore = ns('FileStore');
export var FrontendStore = ns('FrontendStore');
export var QuadStore = ns('QuadStore');

// Properties
export var bucket = ns('bucket');
export var endpoint = ns('endpoint');
export var key = ns('key');
export var secret = ns('secret');

//An extra grouping object so all the entities can be accessed from the prefix/name
export const s3 = {
  // Classes
  Bucket,
  FileStore,
  FrontendStore,
  QuadStore,

  // Properties
  bucket,
  endpoint,
  key,
  secret,
};

