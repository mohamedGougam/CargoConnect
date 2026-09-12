export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds?: number;
  /** Provider that served the decision. */
  provider: string;
  /** True when a fallback path was used (e.g. Redis down). */
  degraded?: boolean;
}

export interface RateLimitProvider {
  readonly name: string;
  /**
   * Consume one unit against key within windowSeconds, limited by max.
   * Keys must be opaque (hashed identities preferred by callers).
   */
  consume(input: {
    key: string;
    max: number;
    windowSeconds: number;
  }): Promise<RateLimitResult>;
  /** Optional connectivity probe. */
  ping?(): Promise<boolean>;
}
