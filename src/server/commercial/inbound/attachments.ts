const ALLOWED_EXTENSIONS = new Set([
  ".pdf",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".csv",
  ".txt",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".tif",
  ".tiff",
]);

const ALLOWED_CONTENT_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
  "text/plain",
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/tiff",
]);

/** Soft MVP cap — not antivirus. */
export const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024;

export function sanitizeAttachmentFilename(raw: string): string {
  const base = raw.split(/[/\\]/).pop() ?? "attachment";
  return base
    .replace(/[^\w.\- ()[\]]+/g, "_")
    .replace(/^\.+/, "")
    .slice(0, 180) || "attachment";
}

export function isAttachmentAllowed(input: {
  filename: string;
  contentType: string;
  sizeBytes: number;
}): { ok: true; filename: string } | { ok: false; reason: string } {
  if (input.sizeBytes < 0 || input.sizeBytes > MAX_ATTACHMENT_BYTES) {
    return { ok: false, reason: "size" };
  }
  const filename = sanitizeAttachmentFilename(input.filename);
  const ext = filename.includes(".")
    ? `.${filename.split(".").pop()!.toLowerCase()}`
    : "";
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return { ok: false, reason: "extension" };
  }
  const ct = (input.contentType || "application/octet-stream").split(";")[0].trim().toLowerCase();
  if (
    ct &&
    ct !== "application/octet-stream" &&
    !ALLOWED_CONTENT_TYPES.has(ct)
  ) {
    return { ok: false, reason: "content_type" };
  }
  return { ok: true, filename };
}
