import type { CORSRule } from '@aws-sdk/client-s3';

/**
 * Options for the default "serve static assets" CORS rule.
 */
export interface StaticAssetCorsOptions {
  /** Methods to allow. Static hosting only ever needs GET/HEAD. */
  allowedMethods?: string[];
  /** Request headers the browser may send on the preflight. */
  allowedHeaders?: string[];
  /**
   * Response headers the browser is allowed to read. ETag and the content
   * headers matter for caching and for range requests on large chunks.
   */
  exposeHeaders?: string[];
  /** How long a preflight may be cached, in seconds. */
  maxAgeSeconds?: number;
  /** Optional rule id, useful when a bucket carries several rules. */
  id?: string;
}

export const DEFAULT_CORS_MAX_AGE_SECONDS = 3600;

/**
 * The rule a bucket needs in order to serve a CDN-hosted frontend release.
 *
 * `linked build-app` bakes Vite's `base` to the release URL, so dynamic-import
 * chunks are fetched from the bucket rather than from the app origin. Module
 * scripts are always fetched in CORS mode, so without
 * `Access-Control-Allow-Origin` on the response those chunks fail to load.
 */
export const staticAssetCorsRule = (
  origins: string[],
  options: StaticAssetCorsOptions = {}
): CORSRule => {
  const rule: CORSRule = {
    AllowedMethods: options.allowedMethods ?? ['GET', 'HEAD'],
    AllowedOrigins: origins,
    AllowedHeaders: options.allowedHeaders ?? ['*'],
    ExposeHeaders: options.exposeHeaders ?? [
      'ETag',
      'Content-Length',
      'Content-Type',
    ],
    MaxAgeSeconds: options.maxAgeSeconds ?? DEFAULT_CORS_MAX_AGE_SECONDS,
  };
  if (options.id) {
    rule.ID = options.id;
  }
  return rule;
};

const normalizeList = (values?: string[]) =>
  [...(values ?? [])].map((value) => value.trim()).sort();

/**
 * Compare two rules by meaning rather than by shape: order within the string
 * lists is irrelevant to S3, and a missing list is the same as an empty one.
 * Used so that `ensureCors` can no-op instead of rewriting an identical rule.
 */
export const corsRulesEqual = (a?: CORSRule, b?: CORSRule): boolean => {
  if (!a || !b) {
    return false;
  }
  const sameList = (x?: string[], y?: string[]) => {
    const left = normalizeList(x);
    const right = normalizeList(y);
    return (
      left.length === right.length &&
      left.every((value, index) => value === right[index])
    );
  };
  return (
    sameList(a.AllowedMethods, b.AllowedMethods) &&
    sameList(a.AllowedOrigins, b.AllowedOrigins) &&
    sameList(a.AllowedHeaders, b.AllowedHeaders) &&
    sameList(a.ExposeHeaders, b.ExposeHeaders) &&
    (a.MaxAgeSeconds ?? null) === (b.MaxAgeSeconds ?? null)
  );
};

/**
 * True when the error means "your credentials may not read or write this
 * bucket's configuration". Object-scoped credentials (Cloudflare R2 tokens in
 * particular) can read and write objects but get a 403 on bucket CORS.
 */
export const isCorsAccessDenied = (error: any): boolean => {
  const name = error?.name ?? error?.Code;
  return (
    error?.$metadata?.httpStatusCode === 403 ||
    name === 'AccessDenied' ||
    name === 'Forbidden' ||
    name === 'NotImplemented'
  );
};

/** True when the bucket simply has no CORS configuration yet. */
export const isNoSuchCorsConfiguration = (error: any): boolean => {
  const name = error?.name ?? error?.Code;
  return (
    name === 'NoSuchCORSConfiguration' ||
    name === 'NoSuchCORSConfigurationError'
  );
};

export const corsAccessDeniedMessage = (bucket: string, action: string) =>
  `These credentials cannot ${action} bucket CORS on "${bucket}". ` +
  `Many providers (Cloudflare R2 among them) never expose bucket CORS to ` +
  `object-scoped credentials, so the rule has to be set in the provider's ` +
  `dashboard or with an account-level token. See the CORS section of the ` +
  `@_linked/s3 README, and verify the result with checkCorsAccess().`;

export interface CorsCheckOptions {
  /** Injectable fetch, so this is testable and usable on older runtimes. */
  fetchImpl?: typeof fetch;
  /** HEAD by default: it is enough and downloads nothing. */
  method?: 'HEAD' | 'GET';
}

export interface CorsCheckResult {
  /** True only when the asset responded OK *and* the origin is allowed. */
  ok: boolean;
  url: string;
  origin: string;
  /** HTTP status, or null when the request never completed. */
  status: number | null;
  /** The raw Access-Control-Allow-Origin header, or null when absent. */
  allowOrigin: string | null;
  /** Whether that header actually covers the origin we asked about. */
  allowsOrigin: boolean;
  /** The raw Access-Control-Expose-Headers header, or null when absent. */
  exposeHeaders: string | null;
  /** Set when the request itself failed (DNS, TLS, offline). */
  error?: string;
  /** The equivalent one-liner, handy to paste into a runbook or an issue. */
  curl: string;
  /** A human-readable verdict. */
  message: string;
}

/**
 * Verify cross-origin access to a published asset from the outside, the way a
 * browser would.
 *
 * This needs nothing but public read access, so it works on deployments whose
 * credentials cannot read bucket configuration at all — which is the common
 * case. Prefer it as the check that a release actually loads.
 */
export const checkCorsAccess = async (
  url: string,
  origin: string,
  options: CorsCheckOptions = {}
): Promise<CorsCheckResult> => {
  const method = options.method ?? 'HEAD';
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const curl = `curl -sI -H 'Origin: ${origin}' ${url}`;

  if (!fetchImpl) {
    return {
      ok: false,
      url,
      origin,
      status: null,
      allowOrigin: null,
      allowsOrigin: false,
      exposeHeaders: null,
      error: 'No fetch implementation available',
      curl,
      message:
        'Could not check CORS: this runtime has no global fetch. Pass fetchImpl, ' +
        `or run: ${curl}`,
    };
  }

  let response: Response;
  try {
    response = await fetchImpl(url, { method, headers: { Origin: origin } });
  } catch (error: any) {
    const reason = error?.message ?? String(error);
    return {
      ok: false,
      url,
      origin,
      status: null,
      allowOrigin: null,
      allowsOrigin: false,
      exposeHeaders: null,
      error: reason,
      curl,
      message: `Could not reach ${url}: ${reason}`,
    };
  }

  const allowOrigin =
    response.headers?.get('access-control-allow-origin') ?? null;
  const exposeHeaders =
    response.headers?.get('access-control-expose-headers') ?? null;
  const allowsOrigin =
    allowOrigin === '*' ||
    (!!allowOrigin && allowOrigin.toLowerCase() === origin.toLowerCase());
  const status = response.status ?? null;
  const reachable = status !== null && status >= 200 && status < 400;
  const ok = reachable && allowsOrigin;

  let message: string;
  if (!reachable) {
    message = `${url} responded ${status}; the asset itself is not publicly readable.`;
  } else if (!allowOrigin) {
    message =
      `${url} has no Access-Control-Allow-Origin header, so a page on ${origin} ` +
      `cannot load it as a module script. Configure bucket CORS.`;
  } else if (!allowsOrigin) {
    message =
      `${url} allows "${allowOrigin}", which does not cover ${origin}. ` +
      `Add that origin to the bucket CORS rule.`;
  } else {
    message = `${url} is loadable from ${origin} (Access-Control-Allow-Origin: ${allowOrigin}).`;
  }

  return {
    ok,
    url,
    origin,
    status,
    allowOrigin,
    allowsOrigin,
    exposeHeaders,
    curl,
    message,
  };
};
