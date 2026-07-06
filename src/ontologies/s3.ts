import { createNameSpace } from '@_linked/core/utils/NameSpace';
import { linkedOntology } from '../package.js';
import * as _this from './s3.js';

export var loadData = () => {
  //@ts-ignore
  return import('../data/s3.json', { with: { type: 'json' } }).then(
    (data) => data.default
  );
};

export var ns = createNameSpace('http://lincd.org/ont/s3/');

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

//Registers this ontology to LINCD.JS, so that data loading can be automated amongst other things
linkedOntology(_this, ns, 's3', loadData, '../data/s3.json');
