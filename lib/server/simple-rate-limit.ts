type Bucket = {
  count: number;
  resetAt: number;
};

type RateLimitInput = {
  key: string;
  limit: number;
  windowMs: number;
};

type RateLimitResult = {
  ok: boolean;
  remaining: number;
  retryAfterSec: number;
};

const buckets = new Map<string, Bucket>();

function nowMs() {
  return Date.now();
}

function cleanupExpired(ts: number) {
  for (const [k, bucket] of buckets) {
    if (bucket.resetAt <= ts) buckets.delete(k);
  }
}

export function checkRateLimit(input: RateLimitInput): RateLimitResult {
  const ts = nowMs();
  cleanupExpired(ts);
  const limit = Math.max(1, Math.floor(input.limit));
  const windowMs = Math.max(1000, Math.floor(input.windowMs));
  const key = input.key || 'global';
  const current = buckets.get(key);

  if (!current || current.resetAt <= ts) {
    buckets.set(key, { count: 1, resetAt: ts + windowMs });
    return { ok: true, remaining: Math.max(0, limit - 1), retryAfterSec: Math.ceil(windowMs / 1000) };
  }

  if (current.count >= limit) {
    return {
      ok: false,
      remaining: 0,
      retryAfterSec: Math.max(1, Math.ceil((current.resetAt - ts) / 1000)),
    };
  }

  current.count += 1;
  buckets.set(key, current);
  return {
    ok: true,
    remaining: Math.max(0, limit - current.count),
    retryAfterSec: Math.max(1, Math.ceil((current.resetAt - ts) / 1000)),
  };
}
