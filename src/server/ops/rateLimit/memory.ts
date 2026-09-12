import type { RateLimitProvider, RateLimitResult } from "./types";

interface Bucket {
  count: number;
  resetAt: number;
}

export class MemoryRateLimitProvider implements RateLimitProvider {
  readonly name = "memory";
  private buckets = new Map<string, Bucket>();

  async consume(input: {
    key: string;
    max: number;
    windowSeconds: number;
  }): Promise<RateLimitResult> {
    const now = Date.now();
    const existing = this.buckets.get(input.key);
    if (!existing || existing.resetAt <= now) {
      const resetAt = now + input.windowSeconds * 1000;
      this.buckets.set(input.key, { count: 1, resetAt });
      return {
        allowed: true,
        remaining: Math.max(0, input.max - 1),
        provider: this.name,
      };
    }
    if (existing.count >= input.max) {
      return {
        allowed: false,
        remaining: 0,
        retryAfterSeconds: Math.max(
          1,
          Math.ceil((existing.resetAt - now) / 1000),
        ),
        provider: this.name,
      };
    }
    existing.count += 1;
    return {
      allowed: true,
      remaining: Math.max(0, input.max - existing.count),
      provider: this.name,
    };
  }

  async ping(): Promise<boolean> {
    return true;
  }

  resetForTests(): void {
    this.buckets.clear();
  }
}
