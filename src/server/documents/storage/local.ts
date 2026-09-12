import { mkdir, readFile, unlink, writeFile, stat } from "fs/promises";
import path from "path";
import type { DocumentStorageProvider, StoredObjectMeta } from "./types";

/**
 * Local filesystem adapter for development and tests.
 * Not suitable as sole production storage on ephemeral hosts.
 */
export class LocalDocumentStorage implements DocumentStorageProvider {
  readonly name = "local";
  private root: string;

  constructor(rootDir?: string) {
    this.root = rootDir ?? path.join(process.cwd(), ".data", "documents");
  }

  private resolve(storageKey: string): string {
    if (
      !storageKey ||
      storageKey.includes("..") ||
      storageKey.startsWith("/") ||
      storageKey.includes("\\")
    ) {
      throw new Error("invalid_storage_key");
    }
    const full = path.join(this.root, storageKey);
    const normalizedRoot = path.resolve(this.root);
    const normalizedFull = path.resolve(full);
    if (!normalizedFull.startsWith(normalizedRoot + path.sep) && normalizedFull !== normalizedRoot) {
      throw new Error("invalid_storage_key");
    }
    return normalizedFull;
  }

  async upload(input: {
    storageKey: string;
    body: Buffer;
    contentType: string;
  }): Promise<StoredObjectMeta> {
    const full = this.resolve(input.storageKey);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, input.body);
    await writeFile(
      `${full}.meta.json`,
      JSON.stringify({
        contentType: input.contentType,
        sizeBytes: input.body.length,
      }),
    );
    return {
      storageKey: input.storageKey,
      contentType: input.contentType,
      sizeBytes: input.body.length,
    };
  }

  async getMetadata(storageKey: string): Promise<StoredObjectMeta | null> {
    try {
      const full = this.resolve(storageKey);
      const s = await stat(full);
      let contentType = "application/octet-stream";
      try {
        const meta = JSON.parse(await readFile(`${full}.meta.json`, "utf8")) as {
          contentType?: string;
        };
        contentType = meta.contentType ?? contentType;
      } catch {
        /* ignore */
      }
      return { storageKey, contentType, sizeBytes: s.size };
    } catch {
      return null;
    }
  }

  async download(
    storageKey: string,
  ): Promise<{ body: Buffer; contentType: string } | null> {
    const meta = await this.getMetadata(storageKey);
    if (!meta) return null;
    const body = await readFile(this.resolve(storageKey));
    return { body, contentType: meta.contentType };
  }

  async delete(storageKey: string): Promise<void> {
    const full = this.resolve(storageKey);
    try {
      await unlink(full);
    } catch {
      /* ignore */
    }
    try {
      await unlink(`${full}.meta.json`);
    } catch {
      /* ignore */
    }
  }
}
