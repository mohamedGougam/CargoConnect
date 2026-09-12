import type { RateLimitProvider, RateLimitResult } from "./types";

/**
 * Redis-compatible rate limiter.
 * Supports:
 * - Upstash REST (UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN)
 * - Redis/Valkey HTTP-like via REDIS_URL using a minimal INCR+EXPIRE script over TCP
 *
 * Vendor-agnostic: domain code never imports Upstash/Redis clients directly.
 */
export class RedisRateLimitProvider implements RateLimitProvider {
  readonly name = "redis";

  async consume(input: {
    key: string;
    max: number;
    windowSeconds: number;
  }): Promise<RateLimitResult> {
    const redisKey = `rl:${input.key}`;
    if (hasUpstash()) {
      return this.consumeUpstash(redisKey, input.max, input.windowSeconds);
    }
    if (process.env.REDIS_URL?.trim()) {
      return this.consumeRedisUrl(redisKey, input.max, input.windowSeconds);
    }
    throw new Error("Redis rate limit provider misconfigured");
  }

  async ping(): Promise<boolean> {
    try {
      if (hasUpstash()) {
        const res = await upstashCommand(["PING"]);
        return res.result === "PONG" || res.result === "pong";
      }
      if (process.env.REDIS_URL?.trim()) {
        const client = await getTcpRedis();
        const pong = await client.command(["PING"]);
        return String(pong).toUpperCase() === "PONG";
      }
      return false;
    } catch {
      return false;
    }
  }

  private async consumeUpstash(
    redisKey: string,
    max: number,
    windowSeconds: number,
  ): Promise<RateLimitResult> {
    // INCR then EXPIRE on first hit
    const incr = await upstashCommand(["INCR", redisKey]);
    const count = Number(incr.result ?? 0);
    if (count === 1) {
      await upstashCommand(["EXPIRE", redisKey, String(windowSeconds)]);
    }
    if (count > max) {
      const ttl = await upstashCommand(["TTL", redisKey]);
      const retry = Math.max(1, Number(ttl.result ?? windowSeconds));
      return {
        allowed: false,
        remaining: 0,
        retryAfterSeconds: retry,
        provider: this.name,
      };
    }
    return {
      allowed: true,
      remaining: Math.max(0, max - count),
      provider: this.name,
    };
  }

  private async consumeRedisUrl(
    redisKey: string,
    max: number,
    windowSeconds: number,
  ): Promise<RateLimitResult> {
    const client = await getTcpRedis();
    const count = Number(await client.command(["INCR", redisKey]));
    if (count === 1) {
      await client.command(["EXPIRE", redisKey, String(windowSeconds)]);
    }
    if (count > max) {
      const ttl = Number(await client.command(["TTL", redisKey]));
      return {
        allowed: false,
        remaining: 0,
        retryAfterSeconds: Math.max(1, ttl > 0 ? ttl : windowSeconds),
        provider: this.name,
      };
    }
    return {
      allowed: true,
      remaining: Math.max(0, max - count),
      provider: this.name,
    };
  }
}

function hasUpstash(): boolean {
  return Boolean(
    process.env.UPSTASH_REDIS_REST_URL?.trim() &&
      process.env.UPSTASH_REDIS_REST_TOKEN?.trim(),
  );
}

async function upstashCommand(
  command: string[],
): Promise<{ result: unknown }> {
  const url = process.env.UPSTASH_REDIS_REST_URL!.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN!.trim();
  const res = await fetch(`${url.replace(/\/$/, "")}/${command.map(encodeURIComponent).join("/")}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`upstash_${res.status}`);
  }
  return (await res.json()) as { result: unknown };
}

/** Minimal RESP client — enough for INCR/EXPIRE/TTL/PING. */
interface TcpRedis {
  command(args: string[]): Promise<unknown>;
}

let tcpCached: TcpRedis | null = null;

async function getTcpRedis(): Promise<TcpRedis> {
  if (tcpCached) return tcpCached;
  const { createConnection } = await import("net");
  const parsed = new URL(process.env.REDIS_URL!.trim());
  const host = parsed.hostname;
  const port = Number(parsed.port || 6379);
  const password = decodeURIComponent(
    parsed.password || parsed.username || "",
  );

  tcpCached = {
    async command(args: string[]) {
      return new Promise((resolve, reject) => {
        const socket = createConnection({ host, port }, () => {
          const write = (parts: string[]) => {
            let payload = `*${parts.length}\r\n`;
            for (const p of parts) {
              const buf = Buffer.from(p, "utf8");
              payload += `$${buf.length}\r\n${p}\r\n`;
            }
            socket.write(payload);
          };
          let buffer = "";
          const onData = (chunk: Buffer) => {
            buffer += chunk.toString("utf8");
            if (!buffer.includes("\r\n")) return;
            try {
              const parsedResp = parseSimpleResp(buffer);
              socket.off("data", onData);
              socket.end();
              resolve(parsedResp);
            } catch (err) {
              socket.off("data", onData);
              socket.destroy();
              reject(err);
            }
          };
          socket.on("data", onData);
          socket.on("error", reject);
          if (password) {
            // AUTH then command sequentially is simplified: AUTH first response ignored by chaining
            write(["AUTH", password]);
          }
          write(args);
        });
        socket.setTimeout(3000, () => {
          socket.destroy();
          reject(new Error("redis_timeout"));
        });
      });
    },
  };
  return tcpCached;
}

function parseSimpleResp(raw: string): unknown {
  if (raw.startsWith("+")) {
    return raw.slice(1, raw.indexOf("\r\n"));
  }
  if (raw.startsWith(":")) {
    return Number(raw.slice(1, raw.indexOf("\r\n")));
  }
  if (raw.startsWith("-")) {
    throw new Error(raw.slice(1, raw.indexOf("\r\n")));
  }
  if (raw.startsWith("$")) {
    const nl = raw.indexOf("\r\n");
    const len = Number(raw.slice(1, nl));
    if (len < 0) return null;
    return raw.slice(nl + 2, nl + 2 + len);
  }
  // Multi-reply after AUTH: take last complete simple value
  const parts = raw.trim().split("\r\n").filter(Boolean);
  const last = parts[parts.length - 1] ?? "";
  if (/^-?\d+$/.test(last)) return Number(last);
  return last.replace(/^\+/, "");
}

export function resetRedisRateLimitClientForTests(): void {
  tcpCached = null;
}
