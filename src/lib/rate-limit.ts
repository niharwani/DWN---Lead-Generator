/**
 * In-memory sliding-window rate limiter.
 *
 * Scope is per `(ownerId, bucket)` tuple. The limiter lives in the Worker's
 * JS heap, so each isolate carries its own counter — this is a defense against
 * accidental loops and casual abuse, not a cross-isolate quota. If we ever
 * need distributed limits we'll back this with Durable Objects or KV; the
 * callsites would not change.
 */

type Bucket = {
  limit: number;
  windowMs: number;
};

export const BUCKETS = {
  audit: { limit: 20, windowMs: 60_000 }, // 20 audits / minute / owner
  discovery: { limit: 5, windowMs: 60_000 }, // 5 discovery runs / minute
  ai_draft: { limit: 15, windowMs: 60_000 }, // 15 AI drafts / minute
  magic_link: { limit: 5, windowMs: 60_000 }, // 5 magic-link requests / minute / IP
} as const satisfies Record<string, Bucket>;

export type BucketName = keyof typeof BUCKETS;

type Entry = { timestamps: number[] };
const STORE = new Map<string, Entry>();

export class RateLimitError extends Error {
  readonly retryAfterSeconds: number;
  constructor(bucket: BucketName, retryAfterSeconds: number) {
    super(
      `Rate limit for "${bucket}" exceeded. Try again in ~${retryAfterSeconds}s.`
    );
    this.name = "RateLimitError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export function assertWithinRateLimit(
  ownerId: string,
  bucket: BucketName,
  now: number = Date.now()
): void {
  const spec = BUCKETS[bucket];
  const key = `${ownerId}:${bucket}`;
  const entry = STORE.get(key) ?? { timestamps: [] };
  const windowStart = now - spec.windowMs;
  const fresh = entry.timestamps.filter((t) => t > windowStart);
  if (fresh.length >= spec.limit) {
    const oldest = fresh[0] ?? now;
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((oldest + spec.windowMs - now) / 1000)
    );
    throw new RateLimitError(bucket, retryAfterSeconds);
  }
  fresh.push(now);
  STORE.set(key, { timestamps: fresh });
}
