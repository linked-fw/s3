import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { S3Bucket } from '../shapes/S3Bucket.js';
import { S3FileStore } from '../shapes/S3FileStore.js';
import { checkCorsAccess, staticAssetCorsRule } from '../utils/cors.js';

/**
 * The bucket talks to a stubbed S3 client, matching how S3Bucket.headObject is
 * tested: the network stops at `_client.send`, and assertions read the command
 * inputs that would have gone out.
 */
const stubClient = () => {
  const send = jest.fn<(command: any) => Promise<any>>();
  const bucket = new S3Bucket('test-bucket');
  (bucket as any)._client = { send };
  return [bucket, send] as const;
};

const sdkError = (name: string, httpStatusCode?: number) => {
  const error: any = new Error(name);
  error.name = name;
  if (httpStatusCode) {
    error.$metadata = { httpStatusCode };
  }
  return error;
};

const commandNames = (send: any) =>
  send.mock.calls.map((call: any[]) => call[0].constructor.name);

describe('S3Bucket.getBucketCors', () => {
  it('returns the configured rules', async () => {
    const [bucket, send] = stubClient();
    const rules = [{ AllowedMethods: ['GET'], AllowedOrigins: ['*'] }];
    send.mockImplementation(async () => ({ CORSRules: rules }));

    expect(await bucket.getBucketCors()).toBe(rules);
    expect(send.mock.calls[0][0].input).toMatchObject({
      Bucket: 'test-bucket',
    });
  });

  it('returns null when the bucket has no CORS configuration', async () => {
    const [bucket, send] = stubClient();
    send.mockImplementation(async () => {
      throw sdkError('NoSuchCORSConfiguration', 404);
    });

    expect(await bucket.getBucketCors()).toBeNull();
  });

  it('throws an actionable error when the credentials may not read config', async () => {
    const [bucket, send] = stubClient();
    send.mockImplementation(async () => {
      throw sdkError('AccessDenied', 403);
    });

    await expect(bucket.getBucketCors()).rejects.toThrow(
      /cannot read bucket CORS/
    );
  });

  it('rethrows unrelated errors untouched', async () => {
    const [bucket, send] = stubClient();
    send.mockImplementation(async () => {
      throw sdkError('NoSuchBucket', 404);
    });

    await expect(bucket.getBucketCors()).rejects.toThrow('NoSuchBucket');
  });
});

describe('S3Bucket.putBucketCors', () => {
  it('sends the rules as the whole configuration', async () => {
    const [bucket, send] = stubClient();
    send.mockImplementation(async () => ({}));
    const rules = staticAssetCorsRule(['https://app.example']);

    await bucket.putBucketCors([rules]);

    expect(send.mock.calls[0][0].input).toEqual({
      Bucket: 'test-bucket',
      CORSConfiguration: { CORSRules: [rules] },
    });
  });

  it('throws an actionable error on a 403', async () => {
    const [bucket, send] = stubClient();
    send.mockImplementation(async () => {
      throw sdkError('AccessDenied', 403);
    });

    await expect(bucket.putBucketCors([])).rejects.toThrow(
      /cannot set bucket CORS/
    );
  });
});

describe('S3Bucket.ensureCors', () => {
  let warn: any;

  beforeEach(() => {
    warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('writes the default static-asset rule when the bucket has none', async () => {
    const [bucket, send] = stubClient();
    send.mockImplementation(async (command: any) => {
      if (command.constructor.name === 'GetBucketCorsCommand') {
        throw sdkError('NoSuchCORSConfiguration', 404);
      }
      return {};
    });

    const result = await bucket.ensureCors(['https://app.example']);

    expect(result.status).toBe('updated');
    expect(commandNames(send)).toEqual([
      'GetBucketCorsCommand',
      'PutBucketCorsCommand',
    ]);
    expect(send.mock.calls[1][0].input.CORSConfiguration.CORSRules).toEqual([
      {
        AllowedMethods: ['GET', 'HEAD'],
        AllowedOrigins: ['https://app.example'],
        AllowedHeaders: ['*'],
        ExposeHeaders: ['ETag', 'Content-Length', 'Content-Type'],
        MaxAgeSeconds: 3600,
      },
    ]);
  });

  it('reads back what it wrote', async () => {
    const [bucket, send] = stubClient();
    let stored: any[] | null = null;
    send.mockImplementation(async (command: any) => {
      if (command.constructor.name === 'PutBucketCorsCommand') {
        stored = command.input.CORSConfiguration.CORSRules;
        return {};
      }
      if (!stored) {
        throw sdkError('NoSuchCORSConfiguration', 404);
      }
      return { CORSRules: stored };
    });

    await bucket.ensureCors(['https://app.example']);

    expect(await bucket.getBucketCors()).toEqual([
      staticAssetCorsRule(['https://app.example']),
    ]);
  });

  it('no-ops when an equivalent rule is already there', async () => {
    const [bucket, send] = stubClient();
    // Same meaning, different list order: still a no-op.
    const existing = {
      ...staticAssetCorsRule(['https://app.example']),
      AllowedMethods: ['HEAD', 'GET'],
    };
    send.mockImplementation(async () => ({ CORSRules: [existing] }));

    const result = await bucket.ensureCors(['https://app.example']);

    expect(result.status).toBe('unchanged');
    expect(commandNames(send)).toEqual(['GetBucketCorsCommand']);
  });

  it('keeps unrelated existing rules when it adds one', async () => {
    const [bucket, send] = stubClient();
    const unrelated = {
      AllowedMethods: ['PUT'],
      AllowedOrigins: ['https://admin.example'],
    };
    send.mockImplementation(async (command: any) => {
      if (command.constructor.name === 'GetBucketCorsCommand') {
        return { CORSRules: [unrelated] };
      }
      return {};
    });

    await bucket.ensureCors(['https://app.example']);

    const written = send.mock.calls[1][0].input.CORSConfiguration.CORSRules;
    expect(written).toHaveLength(2);
    expect(written[0]).toBe(unrelated);
  });

  it('drops existing rules when replace is set', async () => {
    const [bucket, send] = stubClient();
    send.mockImplementation(async (command: any) => {
      if (command.constructor.name === 'GetBucketCorsCommand') {
        return { CORSRules: [{ AllowedMethods: ['PUT'], AllowedOrigins: [] }] };
      }
      return {};
    });

    await bucket.ensureCors(['https://app.example'], { replace: true });

    expect(
      send.mock.calls[1][0].input.CORSConfiguration.CORSRules
    ).toHaveLength(1);
  });

  it('reports rather than throws when reading config is forbidden', async () => {
    const [bucket, send] = stubClient();
    send.mockImplementation(async () => {
      throw sdkError('AccessDenied', 403);
    });

    const result = await bucket.ensureCors(['https://app.example']);

    expect(result.status).toBe('forbidden');
    expect(result.rules).toBeNull();
    expect(result.message).toMatch(/dashboard/);
    expect(commandNames(send)).toEqual(['GetBucketCorsCommand']);
    expect(warn).toHaveBeenCalled();
  });

  it('reports rather than throws when only writing is forbidden', async () => {
    const [bucket, send] = stubClient();
    send.mockImplementation(async (command: any) => {
      if (command.constructor.name === 'GetBucketCorsCommand') {
        return { CORSRules: [] };
      }
      throw sdkError('AccessDenied', 403);
    });

    const result = await bucket.ensureCors(['https://app.example']);

    expect(result.status).toBe('forbidden');
    expect(result.message).toMatch(/cannot set bucket CORS/);
  });

  it('honours custom origins, max age and exposed headers', async () => {
    const [bucket, send] = stubClient();
    send.mockImplementation(async (command: any) =>
      command.constructor.name === 'GetBucketCorsCommand'
        ? { CORSRules: [] }
        : {}
    );

    await bucket.ensureCors(['https://a.example', 'https://b.example'], {
      maxAgeSeconds: 86400,
      exposeHeaders: ['ETag'],
    });

    expect(
      send.mock.calls[1][0].input.CORSConfiguration.CORSRules[0]
    ).toMatchObject({
      AllowedOrigins: ['https://a.example', 'https://b.example'],
      MaxAgeSeconds: 86400,
      ExposeHeaders: ['ETag'],
    });
  });
});

const stubResponse = (status: number, headers: Record<string, string>) => {
  const lower = Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value])
  );
  return {
    status,
    headers: { get: (name: string) => lower[name.toLowerCase()] ?? null },
  } as any;
};

describe('checkCorsAccess', () => {
  it('sends the Origin header on a HEAD request', async () => {
    const fetchImpl = jest.fn(async () =>
      stubResponse(200, { 'access-control-allow-origin': '*' })
    ) as any;

    const result = await checkCorsAccess(
      'https://cdn.example/releases/1.0.0/app.js',
      'https://app.example',
      { fetchImpl }
    );

    expect(fetchImpl.mock.calls[0][0]).toBe(
      'https://cdn.example/releases/1.0.0/app.js'
    );
    expect(fetchImpl.mock.calls[0][1]).toEqual({
      method: 'HEAD',
      headers: { Origin: 'https://app.example' },
    });
    expect(result.ok).toBe(true);
    expect(result.allowOrigin).toBe('*');
  });

  it('accepts an exact origin echo', async () => {
    const fetchImpl = jest.fn(async () =>
      stubResponse(200, {
        'access-control-allow-origin': 'https://app.example',
        'access-control-expose-headers': 'ETag',
      })
    ) as any;

    const result = await checkCorsAccess(
      'https://cdn.example/app.js',
      'https://app.example',
      { fetchImpl }
    );

    expect(result.ok).toBe(true);
    expect(result.exposeHeaders).toBe('ETag');
  });

  it('fails when the header is missing', async () => {
    const fetchImpl = jest.fn(async () => stubResponse(200, {})) as any;

    const result = await checkCorsAccess(
      'https://cdn.example/app.js',
      'https://app.example',
      { fetchImpl }
    );

    expect(result.ok).toBe(false);
    expect(result.allowOrigin).toBeNull();
    expect(result.message).toMatch(/no Access-Control-Allow-Origin/);
  });

  it('fails when the header allows a different origin', async () => {
    const fetchImpl = jest.fn(async () =>
      stubResponse(200, {
        'access-control-allow-origin': 'https://other.example',
      })
    ) as any;

    const result = await checkCorsAccess(
      'https://cdn.example/app.js',
      'https://app.example',
      { fetchImpl }
    );

    expect(result.ok).toBe(false);
    expect(result.allowsOrigin).toBe(false);
    expect(result.message).toMatch(/does not cover/);
  });

  it('fails, without throwing, when the asset is not publicly readable', async () => {
    const fetchImpl = jest.fn(async () =>
      stubResponse(403, { 'access-control-allow-origin': '*' })
    ) as any;

    const result = await checkCorsAccess(
      'https://cdn.example/app.js',
      'https://app.example',
      { fetchImpl }
    );

    expect(result.ok).toBe(false);
    expect(result.status).toBe(403);
    expect(result.message).toMatch(/not publicly readable/);
  });

  it('reports a network failure instead of rejecting', async () => {
    const fetchImpl = jest.fn(async () => {
      throw new Error('getaddrinfo ENOTFOUND cdn.example');
    }) as any;

    const result = await checkCorsAccess(
      'https://cdn.example/app.js',
      'https://app.example',
      { fetchImpl }
    );

    expect(result.ok).toBe(false);
    expect(result.status).toBeNull();
    expect(result.error).toMatch(/ENOTFOUND/);
  });

  it('hands back the equivalent curl one-liner', async () => {
    const fetchImpl = jest.fn(async () => stubResponse(200, {})) as any;

    const result = await checkCorsAccess(
      'https://cdn.example/app.js',
      'https://app.example',
      { fetchImpl }
    );

    expect(result.curl).toBe(
      "curl -sI -H 'Origin: https://app.example' https://cdn.example/app.js"
    );
  });
});

describe('S3FileStore CORS helpers', () => {
  const createStore = (config = {}) =>
    new S3FileStore(`cors-store-${Math.random()}`, {
      bucketName: 'test-bucket',
      accessURL: 'https://cdn.example.com',
      ...config,
    });

  it('checks the asset at the store access URL, prefix included', async () => {
    const store = createStore({ prefix: 'releases/1.2.3' });
    const fetchImpl = jest.fn(async () =>
      stubResponse(200, { 'access-control-allow-origin': '*' })
    ) as any;

    const result = await store.checkAssetCors(
      '/assets/app.js',
      'https://app.example',
      { fetchImpl }
    );

    expect(fetchImpl.mock.calls[0][0]).toBe(
      'https://cdn.example.com/releases/1.2.3/assets/app.js'
    );
    expect(result.ok).toBe(true);
  });

  it('delegates ensureCors to its bucket', async () => {
    const store = createStore();
    const ensureCors = jest.fn(async () => ({
      status: 'updated' as const,
      rules: [],
      message: 'ok',
    }));
    (store as any)._bucket = { ensureCors };

    const result = await store.ensureCors(['https://app.example'], {
      maxAgeSeconds: 60,
    });

    expect(ensureCors.mock.calls[0]).toEqual([
      ['https://app.example'],
      { maxAgeSeconds: 60 },
    ]);
    expect(result.status).toBe('updated');
  });
});
