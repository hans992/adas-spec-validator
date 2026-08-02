const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 20;

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

export function consumeChatRateLimit(key: string, now = Date.now()): { allowed: boolean; retryAfterSeconds: number } {
  const current = buckets.get(key);
  if (current === undefined || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  if (current.count >= MAX_REQUESTS_PER_WINDOW) {
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)) };
  }

  current.count += 1;
  return { allowed: true, retryAfterSeconds: 0 };
}

export function resetChatRateLimitForTests(): void {
  buckets.clear();
}
