import { createHmac, createHash } from "crypto";
import type { DocumentStorageProvider, StoredObjectMeta } from "./types";

/**
 * S3-compatible object storage (AWS S3, Cloudflare R2, MinIO, etc.).
 * Uses SigV4 with fetch — no AWS SDK dependency.
 * Objects are private; downloads go through authenticated app routes.
 */
export class S3DocumentStorage implements DocumentStorageProvider {
  readonly name = "s3";
  private bucket: string;
  private endpoint: string;
  private region: string;
  private accessKey: string;
  private secretKey: string;
  private forcePathStyle: boolean;

  constructor() {
    this.bucket = process.env.DOCUMENT_STORAGE_BUCKET?.trim() ?? "";
    this.endpoint =
      process.env.DOCUMENT_STORAGE_ENDPOINT?.trim() ||
      `https://s3.${process.env.DOCUMENT_STORAGE_REGION?.trim() || "auto"}.amazonaws.com`;
    this.region = process.env.DOCUMENT_STORAGE_REGION?.trim() || "auto";
    this.accessKey = process.env.DOCUMENT_STORAGE_ACCESS_KEY?.trim() ?? "";
    this.secretKey = process.env.DOCUMENT_STORAGE_SECRET_KEY?.trim() ?? "";
    this.forcePathStyle =
      process.env.DOCUMENT_STORAGE_FORCE_PATH_STYLE === "true" ||
      /r2\.cloudflarestorage|localhost|127\.0\.0\.1/i.test(this.endpoint);

    if (!this.bucket || !this.accessKey || !this.secretKey) {
      throw new Error(
        "S3 document storage requires DOCUMENT_STORAGE_BUCKET, DOCUMENT_STORAGE_ACCESS_KEY, DOCUMENT_STORAGE_SECRET_KEY",
      );
    }
    // Cloudflare R2 access key IDs are exactly 32 characters.
    if (
      /r2\.cloudflarestorage/i.test(this.endpoint) &&
      this.accessKey.length !== 32
    ) {
      throw new Error(
        `R2 DOCUMENT_STORAGE_ACCESS_KEY must be exactly 32 characters (got ${this.accessKey.length}). Re-copy the Access Key ID from Cloudflare R2 API tokens — do not use Account ID or add extra characters.`,
      );
    }
  }

  async upload(input: {
    storageKey: string;
    body: Buffer;
    contentType: string;
  }): Promise<StoredObjectMeta> {
    assertSafeKey(input.storageKey);
    const res = await this.signedFetch("PUT", input.storageKey, {
      body: input.body,
      contentType: input.contentType,
    });
    if (!res.ok) {
      throw new Error(await safeS3Error("s3_upload_failed", res));
    }
    return {
      storageKey: input.storageKey,
      contentType: input.contentType,
      sizeBytes: input.body.length,
    };
  }

  async getMetadata(storageKey: string): Promise<StoredObjectMeta | null> {
    assertSafeKey(storageKey);
    const res = await this.signedFetch("HEAD", storageKey);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(await safeS3Error("s3_head_failed", res));
    const len = Number(res.headers.get("content-length") ?? 0);
    return {
      storageKey,
      contentType: res.headers.get("content-type") ?? "application/octet-stream",
      sizeBytes: len,
    };
  }

  async download(
    storageKey: string,
  ): Promise<{ body: Buffer; contentType: string } | null> {
    assertSafeKey(storageKey);
    const res = await this.signedFetch("GET", storageKey);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(await safeS3Error("s3_get_failed", res));
    const ab = await res.arrayBuffer();
    return {
      body: Buffer.from(ab),
      contentType: res.headers.get("content-type") ?? "application/octet-stream",
    };
  }

  async delete(storageKey: string): Promise<void> {
    assertSafeKey(storageKey);
    const res = await this.signedFetch("DELETE", storageKey);
    if (!res.ok && res.status !== 404) {
      throw new Error(await safeS3Error("s3_delete_failed", res));
    }
  }

  private objectUrl(storageKey: string): { url: string; host: string; canonicalUri: string } {
    const endpoint = new URL(this.endpoint);
    if (this.forcePathStyle) {
      const url = `${endpoint.origin}/${this.bucket}/${storageKey}`;
      return {
        url,
        host: endpoint.host,
        canonicalUri: `/${this.bucket}/${encodeKey(storageKey)}`,
      };
    }
    const host = `${this.bucket}.${endpoint.host}`;
    return {
      url: `${endpoint.protocol}//${host}/${storageKey}`,
      host,
      canonicalUri: `/${encodeKey(storageKey)}`,
    };
  }

  private async signedFetch(
    method: string,
    storageKey: string,
    opts?: { body?: Buffer; contentType?: string },
  ): Promise<Response> {
    const { url, host, canonicalUri } = this.objectUrl(storageKey);
    const now = new Date();
    const amzDate = toAmzDate(now);
    const dateStamp = amzDate.slice(0, 8);
    const body = opts?.body;
    const payloadHash = sha256Hex(body ?? Buffer.alloc(0));
    const headers: Record<string, string> = {
      host,
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": amzDate,
    };
    if (opts?.contentType) headers["content-type"] = opts.contentType;
    // R2/S3-compatible stores expect Content-Length to be present and signed on PUT.
    if (body) headers["content-length"] = String(body.length);

    const signedHeaderKeys = Object.keys(headers).sort();
    const signedHeaders = signedHeaderKeys.join(";");
    const canonicalHeaders = signedHeaderKeys
      .map((k) => `${k}:${headers[k]}\n`)
      .join("");
    const canonicalRequest = [
      method,
      canonicalUri,
      "",
      canonicalHeaders,
      signedHeaders,
      payloadHash,
    ].join("\n");

    const credentialScope = `${dateStamp}/${this.region}/s3/aws4_request`;
    const stringToSign = [
      "AWS4-HMAC-SHA256",
      amzDate,
      credentialScope,
      sha256Hex(canonicalRequest),
    ].join("\n");
    const signingKey = getSignatureKey(
      this.secretKey,
      dateStamp,
      this.region,
      "s3",
    );
    const signature = createHmac("sha256", signingKey)
      .update(stringToSign)
      .digest("hex");
    headers.authorization = `AWS4-HMAC-SHA256 Credential=${this.accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    return fetch(url, {
      method,
      headers,
      body: body ? new Uint8Array(body) : undefined,
    });
  }
}

/** Safe provider error — status + Code/Message only; never auth material. */
async function safeS3Error(prefix: string, res: Response): Promise<string> {
  let code = "";
  let message = "";
  try {
    const text = await res.text();
    const codeMatch = text.match(/<Code>([^<]+)<\/Code>/i);
    const msgMatch = text.match(/<Message>([^<]+)<\/Message>/i);
    code = codeMatch?.[1]?.trim() ?? "";
    message = msgMatch?.[1]?.trim() ?? "";
  } catch {
    /* ignore body parse */
  }
  const parts = [prefix, String(res.status)];
  if (code) parts.push(code);
  if (message) parts.push(message.slice(0, 160));
  return parts.join(":");
}

function assertSafeKey(storageKey: string): void {
  if (
    !storageKey ||
    storageKey.includes("..") ||
    storageKey.startsWith("/") ||
    storageKey.includes("\\") ||
    storageKey.includes("\0")
  ) {
    throw new Error("invalid_storage_key");
  }
}

function encodeKey(key: string): string {
  return key
    .split("/")
    .map((p) => encodeURIComponent(p).replace(/[!'()*]/g, escape))
    .join("/");
}

function toAmzDate(d: Date): string {
  return d.toISOString().replace(/[:-]|\.\d{3}/g, "");
}

function sha256Hex(data: string | Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac("sha256", key).update(data).digest();
}

function getSignatureKey(
  secret: string,
  dateStamp: string,
  region: string,
  service: string,
): Buffer {
  const kDate = hmac(`AWS4${secret}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  return hmac(kService, "aws4_request");
}
