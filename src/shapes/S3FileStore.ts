import {
  FileStat,
  IFileStore,
  SaveFileOptions,
  normalizeSaveFileOptions,
} from '@_linked/core/interfaces/IFileStore';
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

export class S3FileStore extends Shape implements IFileStore {
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
   * @param options Save options, or a plain string read as the old positional mime type
   * @param preventDuplicates Only honoured when `options` is a string
   * @returns The public URL of the file
   */
  async saveFile(
    filePath: string,
    fileContent: string | Uint8Array | Buffer | Readable,
    options?: SaveFileOptions | string,
    preventDuplicates?: boolean
  ): Promise<string> {
    let bucket = this.bucket;

    // Normalised in core so this store cannot drift from the other IFileStores.
    const opts = normalizeSaveFileOptions(options, preventDuplicates);

    filePath = this.normalizePath(filePath);

    const mimeType = opts.mimeType ?? mime.getType(filePath);

    //first check if the object already exists
    if (opts.preventDuplicates && (await this.fileExists(filePath))) {
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
        // Only send the optional headers when they were asked for, so the
        // bucket's own defaults keep applying otherwise.
        ...(opts.cacheControl ? { CacheControl: opts.cacheControl } : {}),
        ...(opts.metadata ? { Metadata: opts.metadata } : {}),
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

  /**
   * Read the metadata of a stored file, for verify-after-upload.
   *
   * @param filePath The path of the file, relative to the endpoint. Normalised
   *   and prefixed exactly as `saveFile` does, so a path that was just saved
   *   can be handed straight back here.
   * @returns The stat, or null when the object does not exist.
   */
  async statFile(filePath: string): Promise<FileStat | null> {
    const key = this.applyPrefix(this.normalizePath(filePath));

    const head = await this.bucket.headObject(key);
    if (!head) {
      return null;
    }

    return {
      size: head.ContentLength,
      // Only present when the object was uploaded with a checksum. Left
      // undefined otherwise: the caller must then treat the file as
      // "cannot verify". ETag is never a content hash (MD5 at best, and
      // something else entirely for multipart uploads), so it is reported
      // separately and never as sha256.
      sha256: head.ChecksumSHA256 ?? undefined,
      etag: head.ETag,
    };
  }
}
