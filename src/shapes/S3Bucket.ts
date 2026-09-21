import {
  CopyObjectCommand,
  CopyObjectCommandInput,
  CORSRule,
  CreateBucketCommand,
  DeleteObjectCommand,
  DeleteObjectCommandInput,
  GetBucketCorsCommand,
  GetObjectCommand,
  GetObjectCommandInput,
  HeadObjectCommand,
  HeadObjectCommandInput,
  HeadObjectCommandOutput,
  ListObjectsCommand,
  PutBucketCorsCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import {
  corsAccessDeniedMessage,
  corsRulesEqual,
  isCorsAccessDenied,
  isNoSuchCorsConfiguration,
  staticAssetCorsRule,
  type StaticAssetCorsOptions,
} from '../utils/cors.js';
import {
  PutObjectCommandInput,
  PutObjectCommandOutput,
} from '@aws-sdk/client-s3/dist-types/commands/PutObjectCommand';
import { StreamingBlobPayloadInputTypes } from '@smithy/types';
import { Shape } from '@_linked/core/shapes/Shape';
import { s3 } from '../ontologies/s3.js';
import { linkedShape } from '../package.js';
import { ListObjectsCommandInput } from '@aws-sdk/client-s3/dist-types/commands/ListObjectsCommand';

export interface S3ClientConfigInput {
  endpoint?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  region?: string;
}

export const endpoint: string = process.env.S3_BUCKET_ENDPOINT;

/**
 * Builds an S3 client from explicit config, falling back to legacy env vars.
 * This enables multiple S3 stores in one process with independent credentials/endpoints.
 */
export const createS3Client = (config: S3ClientConfigInput = {}) =>
  new S3Client({
    endpoint: config.endpoint ?? process.env.S3_BUCKET_ENDPOINT,
    // https://github.com/aws/aws-sdk-js-v3/issues/3392#issuecomment-1120027821
    credentials: {
      accessKeyId: config.accessKeyId ?? process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey:
        config.secretAccessKey ?? process.env.AWS_SECRET_ACCESS_KEY,
    },
    region: config.region ?? process.env.AWS_REGION ?? 'us-east-1',
  });

/**
 * Legacy singleton exported for backward compatibility. New code should prefer
 * per-instance clients by passing config into S3Bucket/S3FileStore.
 */
export const s3Client = createS3Client();

@linkedShape
export class S3Bucket extends Shape {
  static targetClass = s3.Bucket;

  protected _client: S3Client;
  label: string;

  private ensureKeyPromise: Map<string, Promise<string | void>> = new Map();

  constructor(n?: string | { id: string }, clientConfig?: S3ClientConfigInput) {
    // `undefined`, not `null`: Shape only skips assigning an id for undefined,
    // and would read `.id` off null otherwise.
    super(typeof n === 'string' ? undefined : n);
    if (typeof n === 'string') {
      this.label = n;
    }
    this._client = createS3Client(clientConfig);
  }

  get endpoint(): string {
    return this._client.config.endpoint.toString();
  }

  /**
   * Delete an object from the bucket.
   * @param key The key of the object to delete
   * @param options Additional options to pass to the DeleteObjectCommand
   * @returns The response from the DeleteObjectCommand
   * @todo Batch delete, see https://docs.aws.amazon.com/AmazonS3/latest/API/API_DeleteObjects.html
   */
  async deleteObject(
    key: string,
    options?: Omit<DeleteObjectCommandInput, 'Key' | 'Bucket'>
  ) {
    let bucketParams: DeleteObjectCommandInput = {
      Bucket: this.label,
      Key: key,
      ...options,
    };
    try {
      const data = await this._client.send(
        new DeleteObjectCommand(bucketParams)
      );
      // console.log('Successfully deleted object ' + key);
      return data;
    } catch (err) {
      console.log('Could not delete object: ', err);
    }
  }

  async copyObject(
    sourceKey: string,
    destinationKey: string,
    options?: Omit<PutObjectCommandInput, 'Key' | 'Bucket'>
  ) {
    let bucketParams: CopyObjectCommandInput = {
      Bucket: this.label,
      Key: destinationKey,
      CopySource: `${this.label}/${sourceKey}`,
      ...options,
    };
    try {
      const data = await this._client.send(new CopyObjectCommand(bucketParams));
      // console.log('Successfully copied object ' + sourceKey + ' to ' + destinationKey);
      return data.$metadata.httpStatusCode === 200;
    } catch (err) {
      console.log('Could not copy object: ', err);
    }
  }

  /**
   * Put an object into the bucket.
   *
   * @param key The key of the object to PUT (i.e. file name)
   * @param value The value of the object to PUT (i.e. file contents)
   * @param options Additional options to pass to the PutObjectCommand
   * @returns The response from the PutObjectCommand
   */
  async putObject(
    key: string,
    value: StreamingBlobPayloadInputTypes,
    options?: Omit<PutObjectCommandInput, 'Body' | 'Key' | 'Bucket'>
  ): Promise<PutObjectCommandOutput> {
    let bucketParams: PutObjectCommandInput = {
      Bucket: this.label,
      Key: key,
      Body: value,
      ACL: 'public-read',
      ...options,
    };

    try {
      const data = await this._client.send(new PutObjectCommand(bucketParams));
      // console.log(
      //   'Successfully uploaded object: ' +
      //     bucketParams.Bucket +
      //     '/' +
      //     bucketParams.Key,
      // );
      return data;
    } catch (err) {
      console.log('Error', err);
    }
    return null;
  }

  /**
   * Get a list of all object keys in the bucket.
   * Important to note that only a maximum 1000 keys will be returned.
   *
   * @param prefix The prefix to search for in the bucket. This can be a folder or the beginning of a file name.
   * @returns A list of all object keys in the bucket
   * @todo Recursive search within directories
   * @todo Implement pagination
   */
  async getAllObjectKeys(prefix = ''): Promise<string[]> {
    let bucketParams = {
      Bucket: this.label,
      Prefix: prefix,
    } as ListObjectsCommandInput;
    try {
      const data = await this._client.send(
        new ListObjectsCommand(bucketParams)
      );
      return data.Contents?.map((object) => object.Key) || [];
    } catch (err) {
      console.log('Could not list bucket contents: ', err);
      return Promise.reject(err);
    }
  }

  /**
   * Get the contents of an object in the bucket.
   * @param key The key of the object to get
   * @returns The contents of the object as a string
   */
  async getObject(key: string): Promise<string> {
    let bucketParams: GetObjectCommandInput = {
      Bucket: this.label,
      Key: key,
    };

    return new Promise(async (resolve, reject) => {
      const getObjectCommand = new GetObjectCommand(bucketParams);

      try {
        const response = await this._client.send(getObjectCommand);
        // let objectData = response.Body.toString();
        // resolve(objectData);

        //for future usecases: use this to stream data or use binary data,
        // see https://stackoverflow.com/questions/36942442/how-to-get-response-from-s3-getobject-in-node-js
        // // Store all of data chunks returned from the response data stream
        // // into an array then use Array#join() to use the returned contents as a String
        let responseDataChunks = [];
        // let body:ReadableStream = response.Body as ReadableStream;
        let body = response.Body as any;
        // Handle an error while streaming the response body
        body.once('error', (err) => reject(err));

        // Attach a 'data' listener to add the chunks of data to our array
        // Each chunk is a Buffer instance
        body.on('data', (chunk) => responseDataChunks.push(chunk));

        // Once the stream has no more data, join the chunks into a string and return the string
        body.once('end', () => resolve(responseDataChunks.join('')));
      } catch (err) {
        // Handle the error or throw
        return reject(err);
      }
    });
  }

  /**
   * Read an object's metadata without downloading its contents.
   *
   * @param key The key of the object to head
   * @returns The HeadObject response, or null when the object does not exist.
   *   Any other error (permissions, network, no such bucket) is rethrown, so a
   *   caller cannot mistake a broken connection for a missing file.
   */
  async headObject(key: string): Promise<HeadObjectCommandOutput | null> {
    let bucketParams: HeadObjectCommandInput = {
      Bucket: this.label,
      Key: key,
    };

    try {
      return await this._client.send(new HeadObjectCommand(bucketParams));
    } catch (error) {
      // v3 of the AWS SDK reports a missing object as NotFound; some
      // S3-compatible endpoints surface the bare 404 instead.
      if (
        error?.name === 'NotFound' ||
        error?.$metadata?.httpStatusCode === 404
      ) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Ensure that the given key exists in the bucket, the file contents
   * will be an empty json object.
   *
   * @param key The key to insert if it does not exist
   * @returns The promise that will resolve when the key exists
   */
  async ensureKeyExists(key: string) {
    if (!this.ensureKeyPromise.has(key)) {
      let promise = this._ensureKeyExists(key);
      this.ensureKeyPromise.set(key, promise);
    }
    return this.ensureKeyPromise.get(key);
  }

  private async _ensureKeyExists(key: string): Promise<string | void> {
    let bucketParams: HeadObjectCommandInput = {
      Bucket: this.label,
      Key: key,
    };

    //see if the object already exists. `headObject` owns the single
    //"does this key exist" decision in this class, including the bare-404
    //fallback that S3-compatible endpoints need.
    let head: HeadObjectCommandOutput | null;
    try {
      head = await this.headObject(key);
    } catch (error) {
      throw 'Error checking existence of object: ' + error;
    }

    if (head) {
      return;
    }

    //If the object does not exist, create it,
    // with the content being an empty json object
    try {
      await this._client.send(
        new PutObjectCommand({
          ...bucketParams,
          Body: JSON.stringify({}),
        })
      );
    } catch (err) {
      if (err.name === 'NoSuchBucket') {
        await this.createBucket();
        await this._ensureKeyExists(key);
        return;
      }
      throw 'Error putting object: ' + err;
    }
  }

  /**
   * Create the bucket if it does not exist.
   * @returns The promise that will resolve when the bucket exists
   */
  async createBucket() {
    let bucketParams = { Bucket: this.label };
    try {
      const data = await this._client.send(
        new CreateBucketCommand(bucketParams)
      );
      console.log('Successfully created bucket ' + this.label);
      return data; // For unit tests.
    } catch (err) {
      console.log('Could not create bucket: ', err);
    }
  }

  /**
   * Read the bucket's CORS configuration.
   *
   * @returns The rules, or null when the bucket has none configured. A bucket
   *   without CORS answers `GetBucketCors` with `NoSuchCORSConfiguration`,
   *   which is an ordinary state and not an error worth throwing over.
   * @throws When the credentials may not read bucket configuration, with a
   *   message naming what to do about it. Use {@link ensureCors} if you want
   *   that case handled for you.
   */
  async getBucketCors(): Promise<CORSRule[] | null> {
    try {
      const data = await this._client.send(
        new GetBucketCorsCommand({ Bucket: this.label })
      );
      return data.CORSRules ?? null;
    } catch (err) {
      if (isNoSuchCorsConfiguration(err)) {
        return null;
      }
      if (isCorsAccessDenied(err)) {
        const error: any = new Error(
          corsAccessDeniedMessage(this.label, 'read')
        );
        error.name = 'CorsAccessDenied';
        error.cause = err;
        throw error;
      }
      throw err;
    }
  }

  /**
   * Replace the bucket's CORS configuration with the given rules.
   *
   * `PutBucketCors` replaces the whole configuration, so pass every rule the
   * bucket should end up with.
   *
   * @throws When the credentials may not write bucket configuration, with a
   *   message naming what to do about it.
   */
  async putBucketCors(rules: CORSRule[]): Promise<CORSRule[]> {
    try {
      await this._client.send(
        new PutBucketCorsCommand({
          Bucket: this.label,
          CORSConfiguration: { CORSRules: rules },
        })
      );
      return rules;
    } catch (err) {
      if (isCorsAccessDenied(err)) {
        const error: any = new Error(
          corsAccessDeniedMessage(this.label, 'set')
        );
        error.name = 'CorsAccessDenied';
        error.cause = err;
        throw error;
      }
      throw err;
    }
  }

  /**
   * Make sure the bucket serves static assets to the given page origins.
   *
   * Best effort by design: it reads the current configuration first and writes
   * nothing when an equivalent rule is already there, and it reports rather
   * than throws when the credentials are not allowed to touch bucket config —
   * which is the normal case on Cloudflare R2 and other providers that keep
   * bucket CORS out of reach of object-scoped tokens.
   *
   * @param origins The page origins that will load the assets, e.g.
   *   `['https://app.example']`.
   * @param options Overrides for the default rule, plus `replace` to drop any
   *   rules the bucket already carries instead of keeping them.
   */
  async ensureCors(
    origins: string[],
    options: StaticAssetCorsOptions & { replace?: boolean } = {}
  ): Promise<EnsureCorsResult> {
    const { replace, ...ruleOptions } = options;
    const desired = staticAssetCorsRule(origins, ruleOptions);

    let existing: CORSRule[] | null;
    try {
      existing = await this.getBucketCors();
    } catch (err: any) {
      if (err?.name === 'CorsAccessDenied') {
        console.warn(err.message);
        return { status: 'forbidden', rules: null, message: err.message };
      }
      throw err;
    }

    if (existing?.some((rule) => corsRulesEqual(rule, desired))) {
      return {
        status: 'unchanged',
        rules: existing,
        message: `Bucket "${this.label}" already allows ${origins.join(', ')}.`,
      };
    }

    // PutBucketCors replaces the entire configuration, so carry any unrelated
    // rules over unless the caller explicitly asked for a clean slate.
    const rules = replace || !existing ? [desired] : [...existing, desired];

    try {
      await this.putBucketCors(rules);
    } catch (err: any) {
      if (err?.name === 'CorsAccessDenied') {
        console.warn(err.message);
        return { status: 'forbidden', rules: null, message: err.message };
      }
      throw err;
    }

    return {
      status: 'updated',
      rules,
      message: `Bucket "${this.label}" now allows ${origins.join(', ')} for GET/HEAD.`,
    };
  }
}

export interface EnsureCorsResult {
  /**
   * `unchanged` when an equivalent rule was already in place, `updated` when
   * the rule was written, `forbidden` when the credentials may not configure
   * bucket CORS (in which case `message` says what to do instead).
   */
  status: 'unchanged' | 'updated' | 'forbidden';
  /** The rules now in effect, or null when they could not be read or written. */
  rules: CORSRule[] | null;
  message: string;
}
