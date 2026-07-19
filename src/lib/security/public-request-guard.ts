type HeaderSource = {
  get(name: string): string | null;
};

type EnvSource = Record<string, string | undefined>;

export type PublicWriteGuardResult =
  | { ok: true }
  | { ok: false; status: 403 | 413 | 429; message: string; retryAfterSeconds?: number };

type PublicWriteGuardInput = {
  headers: HeaderSource;
  routeKey: string;
  requestUrl?: string;
  maxPayloadBytes?: number;
  rateLimit?: {
    limit: number;
    windowMs: number;
  };
  env?: EnvSource;
  now?: number;
};

type RateBucket = {
  count: number;
  resetAt: number;
};

const defaultPayloadLimitBytes = 64 * 1024;
const maxRateBuckets = 5000;
const rateBuckets = new Map<string, RateBucket>();

export function validatePublicWriteRequest(input: PublicWriteGuardInput): PublicWriteGuardResult {
  const payloadLimit = input.maxPayloadBytes ?? defaultPayloadLimitBytes;
  const contentLength = readContentLength(input.headers);

  if (contentLength !== null && contentLength > payloadLimit) {
    return {
      ok: false,
      status: 413,
      message: "Payload grande demais.",
    };
  }

  if (!isRequestOriginAllowed(input.headers, input.requestUrl, input.env)) {
    return {
      ok: false,
      status: 403,
      message: "Origem nao autorizada.",
    };
  }

  if (input.rateLimit) {
    const rate = takeRateLimit({
      key: `${input.routeKey}:${readClientIp(input.headers)}`,
      limit: input.rateLimit.limit,
      windowMs: input.rateLimit.windowMs,
      now: input.now,
    });

    if (!rate.allowed) {
      return {
        ok: false,
        status: 429,
        message: "Muitas tentativas. Aguarde um pouco e tente novamente.",
        retryAfterSeconds: rate.retryAfterSeconds,
      };
    }
  }

  return { ok: true };
}

export function isRequestOriginAllowed(
  headers: HeaderSource,
  requestUrl?: string,
  env: EnvSource = process.env,
) {
  const origin = normalizeOrigin(headers.get("origin"))
    ?? normalizeOrigin(readRefererOrigin(headers.get("referer")));

  if (!origin) {
    return true;
  }

  const requestOrigin = requestUrl ? normalizeOrigin(requestUrl) : null;

  if (requestOrigin && origin === requestOrigin) {
    return true;
  }

  if (isDevelopmentLocalOrigin(origin, env.NODE_ENV)) {
    return true;
  }

  return getAllowedOrigins(env).has(origin);
}

export function getAllowedOrigins(env: EnvSource = process.env) {
  const origins = new Set<string>();

  for (const value of [
    env.NEXT_PUBLIC_APP_URL,
    env.VERCEL_URL ? `https://${env.VERCEL_URL.replace(/^https?:\/\//i, "")}` : undefined,
    ...splitOriginList(env.TRACKING_ALLOWED_ORIGINS),
  ]) {
    const normalized = normalizeOrigin(value);

    if (normalized) {
      origins.add(normalized);
    }
  }

  return origins;
}

export function readClientIp(headers: HeaderSource) {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();

  return forwarded
    || headers.get("cf-connecting-ip")?.trim()
    || headers.get("x-real-ip")?.trim()
    || "unknown";
}

export function takeRateLimit(input: {
  key: string;
  limit: number;
  windowMs: number;
  now?: number;
}) {
  const now = input.now ?? Date.now();
  const current = rateBuckets.get(input.key);

  if (!current || current.resetAt <= now) {
    pruneRateBuckets(now);
    rateBuckets.set(input.key, {
      count: 1,
      resetAt: now + input.windowMs,
    });

    return { allowed: true as const, remaining: Math.max(input.limit - 1, 0), retryAfterSeconds: 0 };
  }

  if (current.count >= input.limit) {
    return {
      allowed: false as const,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
    };
  }

  current.count += 1;

  return {
    allowed: true as const,
    remaining: Math.max(input.limit - current.count, 0),
    retryAfterSeconds: 0,
  };
}

export function resetPublicRateLimitForTests() {
  rateBuckets.clear();
}

function readContentLength(headers: HeaderSource) {
  const raw = headers.get("content-length");

  if (!raw) {
    return null;
  }

  const value = Number.parseInt(raw, 10);

  return Number.isFinite(value) && value >= 0 ? value : null;
}

function readRefererOrigin(value: string | null) {
  if (!value) {
    return null;
  }

  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function normalizeOrigin(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  try {
    return new URL(value).origin.toLowerCase();
  } catch {
    return null;
  }
}

function splitOriginList(value: string | undefined) {
  return value
    ? value.split(",").map((item) => item.trim()).filter(Boolean)
    : [];
}

function isDevelopmentLocalOrigin(origin: string, nodeEnv: string | undefined = process.env.NODE_ENV) {
  if (nodeEnv === "production") {
    return false;
  }

  try {
    const { hostname } = new URL(origin);
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  } catch {
    return false;
  }
}

function pruneRateBuckets(now: number) {
  if (rateBuckets.size < maxRateBuckets) {
    return;
  }

  for (const [key, bucket] of rateBuckets) {
    if (bucket.resetAt <= now) {
      rateBuckets.delete(key);
    }

    if (rateBuckets.size < maxRateBuckets) {
      break;
    }
  }
}
