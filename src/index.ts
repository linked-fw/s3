import './types.js';
import './ontologies/s3.register.js';

//SHAPES FIRST
import './shapes/S3Bucket.js';
import './shapes/S3FileStore.js';
// Old quad-store patterns — depend on N3FileStore/BackendStore (in modules_old)
// import './shapes/S3FrontendStore.js';
// import './shapes/S3FrontendStoreProvider.js';
// import './shapes/S3QuadStore.js';

//THEN COMPONENTS
import './utils/accessUrl.js';
import './utils/cors.js';
