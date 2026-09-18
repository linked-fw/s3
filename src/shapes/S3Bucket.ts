import {
  CopyObjectCommand,
  CopyObjectCommandInput,
  CreateBucketCommand,
  DeleteObjectCommand,
  DeleteObjectCommandInput,
  GetObjectCommand,
  GetObjectCommandInput,
  HeadObjectCommand,
  HeadObjectCommandInput,
  HeadObjectCommandOutput,
  ListObjectsCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
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
    // A string is the external bucket label, not a Linked node reference.
    // Pass undefined so Shape does not try to read an id from a null value.
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

  /** Strict upload path for release artifacts. Unlike the legacy putObject,
   * errors propagate to the caller so a release cannot report false success.
   */
  async putObjectOrThrow(
    key: string,
    value: StreamingBlobPayloadInputTypes,
    options?: Omit<PutObjectCommandInput, 'Body' | 'Key' | 'Bucket'>
  ): Promise<PutObjectCommandOutput> {
    return this._client.send(
      new PutObjectCommand({
        Bucket: this.label,
        Key: key,
        Body: value,
        ACL: 'public-read',
        ...options,
      })
    );
  }

  async headObject(key: string): Promise<HeadObjectCommandOutput> {
    return this._client.send(
      new HeadObjectCommand({Bucket: this.label, Key: key})
    );
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

    return new Promise<string | void>(async (resolve, reject) => {
      //see if the object already exists
      try {
        await this._client.send(new HeadObjectCommand(bucketParams));
        resolve();
      } catch (error) {
        if (error.name === 'NotFound') {
          // Note with v3 AWS-SDK use error.code
          //If the object does not exist, create it,
          // with the content being an empty json object
          try {
            await this._client.send(
              new PutObjectCommand({
                ...bucketParams,
                Body: JSON.stringify({}),
              })
            );
            // console.log(
            //   `Successfully created object "${bucketParams.Key}" in bucket ${bucketParams.Bucket}`,
            // );
            resolve();
          } catch (err) {
            if (err.name === 'NoSuchBucket') {
              await this.createBucket();
              await this._ensureKeyExists(key);
              resolve();
            }
            reject('Error putting object: ' + err);
          }
        } else {
          reject('Error checking existence of object: ' + error);
        }
      }
    });
  }

  private async keyExists(key: string): Promise<boolean> {
    let bucketParams: HeadObjectCommandInput = {
      Bucket: this.label,
      Key: key,
    };

    return new Promise<boolean>(async (resolve, reject) => {
      //see if the object already exists
      try {
        await this._client.send(new HeadObjectCommand(bucketParams));
        resolve(true);
      } catch (error) {
        if (error.name === 'NotFound') {
          return false;
        } else {
          console.warn('Error checking existence of object: ' + error);
          return false;
        }
      }
    });
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
}
