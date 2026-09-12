export interface StoredObjectMeta {
  storageKey: string;
  contentType: string;
  sizeBytes: number;
}

export interface DocumentStorageProvider {
  readonly name: string;
  upload(input: {
    storageKey: string;
    body: Buffer;
    contentType: string;
  }): Promise<StoredObjectMeta>;
  getMetadata(storageKey: string): Promise<StoredObjectMeta | null>;
  /** Private download — returns buffer (authenticated streaming path). */
  download(storageKey: string): Promise<{ body: Buffer; contentType: string } | null>;
  delete(storageKey: string): Promise<void>;
}

export const ALLOWED_DOCUMENT_CONTENT_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
  "text/plain",
  "image/jpeg",
  "image/png",
]);

export const ALLOWED_DOCUMENT_EXTENSIONS = new Set([
  "pdf",
  "docx",
  "xlsx",
  "csv",
  "txt",
  "jpg",
  "jpeg",
  "png",
]);

export function maxDocumentBytes(): number {
  const mb = Number(process.env.DOCUMENT_MAX_FILE_SIZE_MB ?? "15");
  const safe = Number.isFinite(mb) && mb > 0 ? mb : 15;
  return Math.min(safe, 50) * 1024 * 1024;
}

export function sanitizeFilename(raw: string): string {
  const base = raw.split(/[/\\]/).pop() ?? "document";
  const cleaned = base
    .replace(/[^\w.\- ()[\]]+/g, "_")
    .replace(/^\.+/, "")
    .slice(0, 180);
  return cleaned || "document";
}

export function extensionOf(filename: string): string {
  const parts = filename.toLowerCase().split(".");
  return parts.length > 1 ? (parts.at(-1) ?? "") : "";
}

export function assertAllowedUpload(input: {
  filename: string;
  contentType: string;
  sizeBytes: number;
}): { ok: true; filename: string } | { ok: false; error: string; code: string } {
  const filename = sanitizeFilename(input.filename);
  const ext = extensionOf(filename);
  if (!ALLOWED_DOCUMENT_EXTENSIONS.has(ext)) {
    return { ok: false, error: "File type not allowed", code: "invalid_type" };
  }
  const mime = input.contentType.split(";")[0]?.trim().toLowerCase() ?? "";
  if (!ALLOWED_DOCUMENT_CONTENT_TYPES.has(mime)) {
    // Allow extension-based fallback for browsers that send octet-stream
    if (mime !== "application/octet-stream") {
      return { ok: false, error: "Content type not allowed", code: "invalid_type" };
    }
  }
  if (input.sizeBytes <= 0) {
    return { ok: false, error: "Empty file", code: "empty_file" };
  }
  if (input.sizeBytes > maxDocumentBytes()) {
    return { ok: false, error: "File too large", code: "oversized" };
  }
  // Block double extensions that look executable
  if (/\.(exe|bat|cmd|js|mjs|sh|ps1|dll|com|scr)(\.|$)/i.test(filename)) {
    return { ok: false, error: "File type not allowed", code: "invalid_type" };
  }
  return { ok: true, filename };
}

export function buildStorageKey(input: {
  bookingId: string;
  documentId: string;
  filename: string;
}): string {
  const safeName = sanitizeFilename(input.filename);
  // Server-owned key — never accept client paths
  return `bookings/${input.bookingId}/${input.documentId}/${safeName}`;
}
