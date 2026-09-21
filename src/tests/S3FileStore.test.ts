import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { S3Bucket } from '../shapes/S3Bucket.js';
import { S3FileStore } from '../shapes/S3FileStore.js';

/**
 * A stand-in for S3Bucket. The store only ever talks to the bucket, so this is
 * the seam where the network stops; S3Bucket itself is tested against a stubbed
 * S3 client further down.
 */
const mockBucket = () => ({
  putObject: jest.fn(async (..._args: any[]) => ({ ETag: '"stub"' })),
  headObject: jest.fn(async (..._args: any[]) => null as any),
  getObject: jest.fn(async (..._args: any[]) => ''),
  deleteObject: jest.fn(async (..._args: any[]) => undefined),
  getAllObjectKeys: jest.fn(async (..._args: any[]) => [] as string[]),
});

type MockBucket = ReturnType<typeof mockBucket>;

const createStore = (
  config: ConstructorParameters<typeof S3FileStore>[1] = {}
): [S3FileStore, MockBucket] => {
  const store = new S3FileStore(`test-store-${Math.random()}`, {
    bucketName: 'test-bucket',
    accessURL: 'https://cdn.example.com',
    ...config,
  });
  const bucket = mockBucket();
  (store as any)._bucket = bucket;
  return [store, bucket];
};

const putOptions = (bucket: MockBucket) =>
  bucket.putObject.mock.calls[0][2] as Record<string, any>;

describe('S3FileStore.saveFile', () => {
  it('sends ContentType, CacheControl and Metadata from SaveFileOptions', async () => {
    const [store, bucket] = createStore();

    const url = await store.saveFile('assets/app.js', 'content', {
      mimeType: 'application/javascript',
      cacheControl: 'public, max-age=31536000, immutable',
      metadata: { release: '1.2.3' },
    });

    expect(bucket.putObject).toHaveBeenCalledTimes(1);
    expect(bucket.putObject.mock.calls[0][0]).toBe('assets/app.js');
    expect(putOptions(bucket)).toMatchObject({
      ContentType: 'application/javascript',
      CacheControl: 'public, max-age=31536000, immutable',
      Metadata: { release: '1.2.3' },
    });
    expect(url).toBe('https://cdn.example.com/assets/app.js');
  });

  it('still accepts a positional mime type string, and sends no CacheControl', async () => {
    const [store, bucket] = createStore();

    await store.saveFile('assets/app.css', 'body{}', 'text/css');

    const options = putOptions(bucket);
    expect(options.ContentType).toBe('text/css');
    expect(options).not.toHaveProperty('CacheControl');
    expect(options).not.toHaveProperty('Metadata');
  });

  it('falls back to the mime type of the file name when none is given', async () => {
    const [store, bucket] = createStore();

    await store.saveFile('assets/logo.png', 'bytes');

    expect(putOptions(bucket).ContentType).toBe('image/png');
  });

  it('omits CacheControl and Metadata when the options object leaves them out', async () => {
    const [store, bucket] = createStore();

    await store.saveFile('assets/app.js', 'content', { mimeType: 'text/plain' });

    const options = putOptions(bucket);
    expect(options).not.toHaveProperty('CacheControl');
    expect(options).not.toHaveProperty('Metadata');
  });

  it('renames on collision when preventDuplicates is set in the options', async () => {
    const [store, bucket] = createStore();
    bucket.headObject.mockImplementation(async () => ({ ContentLength: 12 }));

    const url = await store.saveFile('uploads/photo.jpg', 'bytes', {
      preventDuplicates: true,
    });

    const key = bucket.putObject.mock.calls[0][0] as string;
    expect(key).not.toBe('uploads/photo.jpg');
    expect(key).toMatch(/^uploads\/\d+-photo\.jpg$/);
    expect(url).toBe(`https://cdn.example.com/${key}`);
  });

  it('renames on collision when preventDuplicates is passed positionally', async () => {
    const [store, bucket] = createStore();
    bucket.headObject.mockImplementation(async () => ({ ContentLength: 12 }));

    await store.saveFile('uploads/photo.jpg', 'bytes', 'image/jpeg', true);

    expect(bucket.putObject.mock.calls[0][0]).toMatch(
      /^uploads\/\d+-photo\.jpg$/
    );
    expect(putOptions(bucket).ContentType).toBe('image/jpeg');
  });

  it('overwrites by default, even when the file exists', async () => {
    const [store, bucket] = createStore();
    bucket.headObject.mockImplementation(async () => ({ ContentLength: 12 }));

    await store.saveFile('uploads/photo.jpg', 'bytes');

    expect(bucket.putObject.mock.calls[0][0]).toBe('uploads/photo.jpg');
  });

  it('applies its own overwrite default when core reports preventDuplicates as undefined', async () => {
    const [store, bucket] = createStore();
    bucket.headObject.mockImplementation(async () => ({ ContentLength: 12 }));

    // Core deliberately never invents `false`; an options object that simply
    // leaves the flag out must still overwrite, exactly like the two-argument
    // call above.
    await store.saveFile('uploads/photo.jpg', 'bytes', {
      mimeType: 'image/jpeg',
      preventDuplicates: undefined,
    });

    expect(bucket.putObject.mock.calls[0][0]).toBe('uploads/photo.jpg');
  });

  it('never downloads the object it is about to overwrite', async () => {
    const [store, bucket] = createStore();
    bucket.headObject.mockImplementation(async () => ({ ContentLength: 12 }));

    await store.saveFile('uploads/photo.jpg', 'bytes', {
      preventDuplicates: true,
    });

    expect(bucket.getObject).not.toHaveBeenCalled();
    expect(bucket.headObject).toHaveBeenCalledWith('uploads/photo.jpg');
  });

  it('renames on collision with a 0-byte object already at the path', async () => {
    const [store, bucket] = createStore();
    // An empty object exists: GetObject would return '' and read as "absent",
    // HeadObject reports it as the file it is.
    bucket.headObject.mockImplementation(async () => ({ ContentLength: 0 }));

    await store.saveFile('uploads/photo.jpg', 'bytes', {
      preventDuplicates: true,
    });

    expect(bucket.putObject.mock.calls[0][0]).toMatch(
      /^uploads\/\d+-photo\.jpg$/
    );
  });

  it('applies the store prefix and strips leading slashes', async () => {
    const [store, bucket] = createStore({ prefix: 'releases/1.2.3' });

    const url = await store.saveFile('/assets/app.js', 'content');

    expect(bucket.putObject.mock.calls[0][0]).toBe(
      'releases/1.2.3/assets/app.js'
    );
    expect(url).toBe('https://cdn.example.com/assets/app.js');
  });
});

describe('S3FileStore.fileExists', () => {
  it('asks HeadObject, not GetObject', async () => {
    const [store, bucket] = createStore();
    bucket.headObject.mockImplementation(async () => ({ ContentLength: 5 }));

    expect(await store.fileExists('uploads/photo.jpg')).toBe(true);
    expect(bucket.getObject).not.toHaveBeenCalled();
  });

  it('reports a 0-byte object as existing', async () => {
    const [store, bucket] = createStore();
    bucket.headObject.mockImplementation(async () => ({ ContentLength: 0 }));

    // The GetObject implementation returned '' here and answered "false".
    expect(await store.fileExists('uploads/empty.txt')).toBe(true);
  });

  it('reports a missing object as absent', async () => {
    const [store, bucket] = createStore();
    bucket.headObject.mockImplementation(async () => null);

    expect(await store.fileExists('uploads/missing.txt')).toBe(false);
  });

  it('applies the store prefix and strips leading slashes', async () => {
    const [store, bucket] = createStore({ prefix: 'releases/1.2.3' });
    bucket.headObject.mockImplementation(async () => null);

    await store.fileExists('/assets/app.js');

    expect(bucket.headObject).toHaveBeenCalledWith(
      'releases/1.2.3/assets/app.js'
    );
  });
});

describe('S3FileStore.statFile', () => {
  it('maps ContentLength, ChecksumSHA256 and ETag', async () => {
    const [store, bucket] = createStore();
    bucket.headObject.mockImplementation(async () => ({
      ContentLength: 1234,
      ChecksumSHA256: 'Zm9vYmFy',
      ETag: '"d41d8cd98f00b204e9800998ecf8427e"',
    }));

    const stat = await store.statFile('assets/app.js');

    expect(stat).toEqual({
      size: 1234,
      sha256: 'Zm9vYmFy',
      etag: '"d41d8cd98f00b204e9800998ecf8427e"',
    });
  });

  it('reports sha256 as undefined when the object carries no checksum', async () => {
    const [store, bucket] = createStore();
    bucket.headObject.mockImplementation(async () => ({
      ContentLength: 10,
      ETag: '"abc"',
    }));

    const stat = await store.statFile('assets/app.js');

    // An ETag is an MD5 at best, so it must never stand in for a content hash.
    expect(stat.sha256).toBeUndefined();
    expect(stat.etag).toBe('"abc"');
  });

  it('reports size 0 when the endpoint omits ContentLength', async () => {
    const [store, bucket] = createStore();
    bucket.headObject.mockImplementation(async () => ({ ETag: '"abc"' }));

    const stat = await store.statFile('assets/app.js');

    // FileStat.size is a required number; an unreported size must fail a
    // verify-after-upload size check rather than read as undefined.
    expect(stat.size).toBe(0);
    expect(stat.etag).toBe('"abc"');
  });

  it('reports a 0-byte object as size 0', async () => {
    const [store, bucket] = createStore();
    bucket.headObject.mockImplementation(async () => ({
      ContentLength: 0,
      ETag: '"e"',
    }));

    expect((await store.statFile('assets/empty.txt')).size).toBe(0);
  });

  it('returns null when the object does not exist', async () => {
    const [store, bucket] = createStore();
    bucket.headObject.mockImplementation(async () => null);

    expect(await store.statFile('missing.js')).toBeNull();
  });

  it('heads exactly the key that saveFile wrote, prefix and all', async () => {
    const [store, bucket] = createStore({ prefix: 'releases/1.2.3' });

    await store.saveFile('/assets/app.js', 'content');
    await store.statFile('/assets/app.js');

    expect(bucket.headObject.mock.calls[0][0]).toBe(
      bucket.putObject.mock.calls[0][0]
    );
    expect(bucket.headObject.mock.calls[0][0]).toBe(
      'releases/1.2.3/assets/app.js'
    );
  });

  it('does not double-apply the prefix for an already prefixed path', async () => {
    const [store, bucket] = createStore({ prefix: 'releases/1.2.3' });

    await store.statFile('releases/1.2.3/assets/app.js');

    expect(bucket.headObject.mock.calls[0][0]).toBe(
      'releases/1.2.3/assets/app.js'
    );
  });
});

describe('S3Bucket.headObject', () => {
  let bucket: S3Bucket;
  let send: jest.Mock<(command: any) => Promise<any>>;

  beforeEach(() => {
    bucket = new S3Bucket('test-bucket');
    send = jest.fn();
    (bucket as any)._client = { send };
  });

  it('returns the command output for an existing object', async () => {
    const output = { ContentLength: 3, ETag: '"abc"' };
    send.mockImplementation(async () => output);

    const head = await bucket.headObject('some/key.txt');

    expect(head).toBe(output);
    expect(send.mock.calls[0][0].input).toMatchObject({
      Bucket: 'test-bucket',
      Key: 'some/key.txt',
    });
  });

  it('returns null on NotFound', async () => {
    send.mockImplementation(async () => {
      const error: any = new Error('Not Found');
      error.name = 'NotFound';
      throw error;
    });

    expect(await bucket.headObject('missing.txt')).toBeNull();
  });

  it('returns null on a bare 404 from an S3-compatible endpoint', async () => {
    send.mockImplementation(async () => {
      const error: any = new Error('404');
      error.$metadata = { httpStatusCode: 404 };
      throw error;
    });

    expect(await bucket.headObject('missing.txt')).toBeNull();
  });

  it('is the single existence check: ensureKeyExists creates the key on a bare 404', async () => {
    const sent: string[] = [];
    send.mockImplementation(async (command: any) => {
      sent.push(command.constructor.name);
      if (command.constructor.name === 'HeadObjectCommand') {
        const error: any = new Error('404');
        error.$metadata = { httpStatusCode: 404 };
        throw error;
      }
      return {};
    });

    await bucket.ensureKeyExists('state.json');

    // The old hand-rolled check only knew `NotFound`, so a bare 404 rejected
    // instead of seeding the key.
    expect(sent).toEqual(['HeadObjectCommand', 'PutObjectCommand']);
  });

  it('ensureKeyExists writes nothing when the key is already there', async () => {
    const sent: string[] = [];
    send.mockImplementation(async (command: any) => {
      sent.push(command.constructor.name);
      return { ContentLength: 2 };
    });

    await bucket.ensureKeyExists('state.json');

    expect(sent).toEqual(['HeadObjectCommand']);
  });

  it('rethrows any other error', async () => {
    send.mockImplementation(async () => {
      const error: any = new Error('Access Denied');
      error.name = 'AccessDenied';
      error.$metadata = { httpStatusCode: 403 };
      throw error;
    });

    await expect(bucket.headObject('secret.txt')).rejects.toThrow(
      'Access Denied'
    );
  });
});

describe('S3FileStore is not a Shape', () => {
  // Pins the decision from core 0e8c86e ("datasets are not shapes"), so a future
  // refactor cannot silently re-inherit.
  it('does not extend Shape', async () => {
    const { Shape } = await import('@_linked/core/shapes/Shape');
    const store = new S3FileStore('pin-test');
    expect(store instanceof Shape).toBe(false);
  });
});
