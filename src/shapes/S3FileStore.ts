import { IFileStore } from '@_linked/core/interfaces/IFileStore';
import type {
  ArtifactDestination,
  ArtifactMetadata,
  IArtifactStore,
  PutArtifactInput,
  PutArtifactResult,
} from '@_linked/core/interfaces/IArtifactStore';
import { Shape } from '@_linked/core/shapes/Shape';
import mime from 'mime';
import path from 'path';
import { s3 } from '../ontologies/s3.js';
import { S3Bucket, type S3ClientConfigInput } from './S3Bucket.js';
import type { Readable } from 'stream';

export interface S3FileStoreConfig {
  bucketName?: string;
  accessURL?: string;
  prefix?: string;
  clientConfig?: S3ClientConfigInput;
}

const trimSlashes = (value = '') => value.replace(/^\/+|\/+$/g, '');
const trimTrailingSlash = (value = '') => value.replace(/\/+$/g, '');

export class S3FileStore extends Shape implements IFileStore, IArtifactStore {
  static targetClass = s3.FileStore;

  label: string;
  private _bucket: S3Bucket;
  private readonly config: S3FileStoreConfig;

  public readonly accessURL: string;

  constructor(n: string | { id: string }, config: S3FileStoreConfig = {}) {
    if (typeof n === 'string') {
      //set a fixed URI. This is important because the URI needs to match on the frontend and backend
      super(`${process.env.DATA_ROOT}/s3-filestore/${n}`);
      this.label = n;
    } else {
      super(n);
    }

    this.config = config;
    this.accessURL = this.resolveAccessURL();
  }

  private get bucket(): S3Bucket {
    const bucketName = this.resolveBucketName();
    if (!bucketName) {
      throw new Error(
        'S3_FILES_BUCKET_NAME environment variable must be set to use S3FileStore (or pass bucketName in config)'
      );
    }

    if (!this._bucket) {
      this._bucket = new S3Bucket(bucketName, this.config.clientConfig);
    }
    return this._bucket;
  }

  private resolveBucketName(): string {
    // Scoped store config wins. Legacy shared env vars stay as fallback to keep
    // existing apps working while allowing upload/static separation.
    return (
      this.config.bucketName ??
      process.env.S3_FILES_BUCKET_NAME ??
      process.env.UPLOADS_S3_FILES_BUCKET_NAME ??
      process.env.STATIC_S3_FILES_BUCKET_NAME
    );
  }

  private resolveAccessURL(): string {
    const explicitAccessURL =
      this.config.accessURL ??
      process.env.S3_CDN_URL ??
      process.env.UPLOADS_ACCESS_URL ??
      process.env.STATIC_ACCESS_URL;

    if (explicitAccessURL) {
      return trimTrailingSlash(explicitAccessURL);
    }

    const endpoint =
      this.config.clientConfig?.endpoint ??
      process.env.S3_BUCKET_ENDPOINT ??
      process.env.UPLOADS_S3_BUCKET_ENDPOINT ??
      process.env.STATIC_S3_BUCKET_ENDPOINT;
    const bucketName = this.resolveBucketName();

    if (endpoint && bucketName) {
      return `${trimTrailingSlash(endpoint)}/${bucketName}`;
    }

    return trimTrailingSlash(endpoint);
  }

  private get prefix(): string {
    // Optional per-store key prefix, used for versioned static publishing.
    return trimSlashes(this.config.prefix ?? '');
  }

  private normalizePath(filePath: string): string {
    return filePath.replace(/^\/+/, '');
  }

  private applyPrefix(filePath: string): string {
    const normalizedPath = this.normalizePath(filePath);
    if (!this.prefix) {
      return normalizedPath;
    }
    // Guard against accidental double prefixing when callers pass already-prefixed keys.
    if (normalizedPath.startsWith(`${this.prefix}/`)) {
      return normalizedPath;
    }
    return `${this.prefix}/${normalizedPath}`;
  }

  private stripPrefix(filePath: string): string {
    if (!this.prefix) {
      return filePath;
    }
    const normalizedPath = this.normalizePath(filePath);
    const prefixedPath = `${this.prefix}/`;
    if (normalizedPath.startsWith(prefixedPath)) {
      return normalizedPath.substring(prefixedPath.length);
    }
    return normalizedPath;
  }

  describeDestination(): ArtifactDestination {
    const bucket = this.resolveBucketName();
    if (!bucket) {
      throw new Error('Static artifact bucket is not configured');
    }

    return {
      bucket,
      prefix: this.prefix,
      endpoint:
        this.config.clientConfig?.endpoint ??
        process.env.STATIC_S3_BUCKET_ENDPOINT ??
        process.env.S3_BUCKET_ENDPOINT,
      publicBaseUrl: this.accessURL || undefined,
    };
  }

  async putArtifact(input: PutArtifactInput): Promise<PutArtifactResult> {
    const key = this.applyPrefix(input.key);
    const result = await this.bucket.putObjectOrThrow(key, input.body, {
      ContentType: input.contentType,
      CacheControl: input.cacheControl,
      Metadata: {sha256: input.sha256},
    });

    return {key, eTag: result.ETag};
  }

  async statArtifact(key: string): Promise<ArtifactMetadata> {
    const resolvedKey = this.applyPrefix(key);
    const result = await this.bucket.headObject(resolvedKey);

    return {
      key: resolvedKey,
      size: result.ContentLength ?? 0,
      sha256: result.Metadata?.sha256,
      contentType: result.ContentType,
      cacheControl: result.CacheControl,
      eTag: result.ETag,
    };
  }

  /**
   * List all files in the bucket
   * @param recursive Whether to list files recursively or just the top-level files
   * @returns A list of file paths, relative to the endpoint
   * @todo Think about taking an options parameter instead of positional args
   * @todo Take a path parameter to list files in a subdirectory
   */
  async listFiles(prefix?: string): Promise<string[]> {
    let bucket = this.bucket;
    const keyPrefix = this.prefix
      ? prefix
        ? this.applyPrefix(prefix)
        : `${this.prefix}/`
      : prefix;

    return bucket
      .getAllObjectKeys(keyPrefix)
      .then((keys) => keys.map((key) => this.stripPrefix(key)))
      .catch((err) => {
        console.error('Error listing files:', err);
        return [];
      });
  }

  /**
   * Save a file to the bucket
   * @param filePath The path to save the file to, relative to the endpoint
   * @param fileContent The contents of the file as a buffer
   * @returns The public URL of the file
   */
  async saveFile(
    filePath: string,
    fileContent: string | Uint8Array | Buffer | Readable,
    mimeType?: string,
    preventDuplicate: boolean = false
  ): Promise<string> {
    let bucket = this.bucket;

    filePath = this.normalizePath(filePath);

    if (!mimeType) {
      mimeType = mime.getType(filePath);
    }
    // console.log(`mimeType of ${filePath} is ${mimeType}`);

    //first check if the object already exists
    if (preventDuplicate && (await this.fileExists(filePath))) {
      //if yes, use a more unique name based on the current unix timestamp
      filePath = `${path.dirname(filePath)}/${Date.now()}-${path.basename(
        filePath
      )}`;
      console.log(
        'File already exists, renaming to avoid overwrite: ' + filePath
      );
    }

    const key = this.applyPrefix(filePath);

    let res = await bucket
      .putObject(key, fileContent, {
        ContentType: mimeType,
      })
      .catch((err) => {
        console.error('Error saving file to S3:', err);
        return false;
      });

    if (!res) {
      return null;
    }
    return this.accessURL + '/' + filePath;
  }

  /**
   * Get a file from the bucket
   * @param filePath The path of the file to get, relative to the endpoint
   * @returns The contents of the file as a buffer
   */
  async getFile(filePath: string): Promise<Buffer | null> {
    let bucket = this.bucket;

    const key = this.applyPrefix(filePath);
    const bufferString = await bucket.getObject(key);

    return Buffer.from(bufferString, 'base64');
  }

  /**
   * Delete a file from the bucket
   * @param filePath The path of the file to delete, relative to the endpoint
   */
  async deleteFile(filePath: string): Promise<void> {
    let bucket = this.bucket;

    await bucket.deleteObject(this.applyPrefix(filePath));
  }

  /**
   * Check if a file exists in the bucket
   * @param filePath The path of the file to check, relative to the endpoint
   * @returns Whether the file exists
   */
  async fileExists(filePath: string): Promise<boolean> {
    try {
      const bucket = await this.bucket.getObject(this.applyPrefix(filePath));
      if (!bucket) {
        return false;
      }
      return true;
    } catch (e) {
      return false;
    }
  }
}
