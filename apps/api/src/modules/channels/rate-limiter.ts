/**
 * In-memory Token Bucket Rate Limiter & Throttler for Realtime Chat
 */

interface Bucket {
  tokens: number;
  lastRefill: number;
}

const MAX_TOKENS = 10;
const REFILL_INTERVAL_MS = 10_000; // 10 seconds for full refill
const REFILL_RATE_PER_MS = MAX_TOKENS / REFILL_INTERVAL_MS; // 0.001 token/ms (10 tokens / 10s)

// Map: `${channelId}:${userId}` -> Bucket
const messageBuckets = new Map<string, Bucket>();

// Map: `${channelId}:${userId}` -> timestamp of last allowed typing notification
const typingLastSent = new Map<string, number>();

/**
 * Checks and consumes a message token for a given user in a specific channel.
 * Returns true if allowed, false if rate limited.
 */
export function consumeMessageToken(channelId: string, userId: string): boolean {
  const key = `${channelId}:${userId}`;
  const now = Date.now();
  let bucket = messageBuckets.get(key);

  if (!bucket) {
    bucket = { tokens: MAX_TOKENS, lastRefill: now };
    messageBuckets.set(key, bucket);
  } else {
    const elapsed = Math.max(0, now - bucket.lastRefill);
    bucket.tokens = Math.min(MAX_TOKENS, bucket.tokens + elapsed * REFILL_RATE_PER_MS);
    bucket.lastRefill = now;
  }

  if (bucket.tokens >= 1) {
    bucket.tokens -= 1;
    return true;
  }

  return false;
}

/**
 * Throttles typing indicators to at most 1 event per 2 seconds per user/channel.
 * Returns true if allowed, false if throttled.
 */
export function checkTypingThrottle(channelId: string, userId: string): boolean {
  const key = `${channelId}:${userId}`;
  const now = Date.now();
  const lastTime = typingLastSent.get(key) || 0;

  if (now - lastTime < 2_000) {
    return false; // Throttled
  }

  typingLastSent.set(key, now);
  return true;
}

/**
 * Clears typing state when a user disconnects or leaves.
 */
export function clearTypingStateForUser(userId: string): void {
  for (const key of typingLastSent.keys()) {
    if (key.endsWith(`:${userId}`)) {
      typingLastSent.delete(key);
    }
  }
}

/**
 * Resets rate limit buckets (useful for test resets).
 */
export function resetChatRateLimits(): void {
  messageBuckets.clear();
  typingLastSent.clear();
}

// Periodic cleanup of stale rate-limit buckets (every 5 minutes)
if (process.env.NODE_ENV !== 'test') {
  setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of messageBuckets.entries()) {
      if (now - bucket.lastRefill > 60_000 && bucket.tokens >= MAX_TOKENS) {
        messageBuckets.delete(key);
      }
    }
    for (const [key, lastTime] of typingLastSent.entries()) {
      if (now - lastTime > 60_000) {
        typingLastSent.delete(key);
      }
    }
  }, 5 * 60_000).unref();
}
