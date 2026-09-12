import { LocalDocumentStorage } from "./local";
import { S3DocumentStorage } from "./s3";
import type { DocumentStorageProvider } from "./types";

let cached: DocumentStorageProvider | null = null;

export function getDocumentStorage(): DocumentStorageProvider {
  if (cached) return cached;
  const provider = (process.env.DOCUMENT_STORAGE_PROVIDER ?? "local")
    .trim()
    .toLowerCase();
  if (provider === "s3" || provider === "r2") {
    cached = new S3DocumentStorage();
  } else {
    cached = new LocalDocumentStorage(
      process.env.DOCUMENT_STORAGE_LOCAL_DIR?.trim() || undefined,
    );
  }
  return cached;
}

export function resetDocumentStorageForTests(): void {
  cached = null;
}

export * from "./types";
export { LocalDocumentStorage } from "./local";
export { S3DocumentStorage } from "./s3";
