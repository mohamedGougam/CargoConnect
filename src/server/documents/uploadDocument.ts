import type {
  BookingDocument,
  BookingDocumentType,
  DocumentScanStatus,
} from "@/domain/commercial/types";
import {
  assertAllowedUpload,
  buildStorageKey,
  getDocumentStorage,
} from "@/server/documents/storage";
import {
  persistValidationResult,
  validateDocumentAgainstBooking,
} from "@/server/documents/validateDocument";
import { getRepositories } from "@/server/commercial/repos";
import { newId } from "@/server/commercial/repos/memory";
import {
  getMalwareScanProvider,
  toDocumentScanStatus,
} from "@/server/ops/malware";
import { logger } from "@/server/ops/logger";
import { metrics } from "@/server/ops/metrics";
import { getRequestId } from "@/server/ops/correlation";

export type UploadDocumentResult =
  | { ok: true; document: BookingDocument; replaced?: boolean }
  | { ok: false; error: string; code: string };

export async function uploadBookingDocument(input: {
  bookingId: string;
  userId: string;
  requirementId?: string | null;
  documentType: BookingDocumentType;
  filename: string;
  contentType: string;
  body: Buffer;
}): Promise<UploadDocumentResult> {
  const repos = getRepositories();
  const booking = await repos.bookings.get(input.bookingId);
  if (!booking || booking.userId !== input.userId) {
    return { ok: false, error: "Booking not found", code: "not_found" };
  }

  if (
    booking.status !== "COMMERCIALLY_CONFIRMED" &&
    booking.status !== "DOCUMENTS_PENDING"
  ) {
    if (booking.status !== "READY_FOR_OPERATIONS") {
      return {
        ok: false,
        error: "Documents cannot be uploaded in this booking status",
        code: "invalid_status",
      };
    }
  }

  const allowed = assertAllowedUpload({
    filename: input.filename,
    contentType: input.contentType,
    sizeBytes: input.body.length,
  });
  if (!allowed.ok) {
    return { ok: false, error: allowed.error, code: allowed.code };
  }

  let requirement = input.requirementId
    ? await repos.documentRequirements.get(input.requirementId)
    : undefined;
  if (requirement && requirement.bookingId !== booking.id) {
    return { ok: false, error: "Invalid requirement", code: "not_found" };
  }
  if (!requirement) {
    const reqs = await repos.documentRequirements.listForBooking(booking.id);
    requirement = reqs.find((r) => r.documentType === input.documentType);
  }

  const priorCurrent = (
    await repos.bookingDocuments.listCurrentForBooking(booking.id)
  ).filter((d) => d.documentType === input.documentType);

  const allOfType = (await repos.bookingDocuments.listForBooking(booking.id)).filter(
    (d) => d.documentType === input.documentType,
  );
  const version =
    allOfType.length === 0
      ? 1
      : Math.max(...allOfType.map((d) => d.version)) + 1;

  const documentId = newId("bdoc");
  const storageKey = buildStorageKey({
    bookingId: booking.id,
    documentId,
    filename: allowed.filename,
  });

  const storage = getDocumentStorage();
  const contentType =
    input.contentType.split(";")[0]?.trim() || "application/octet-stream";

  try {
    await storage.upload({
      storageKey,
      body: input.body,
      contentType,
    });
  } catch (err) {
    metrics.uploadFailure();
    logger.error("storage.upload_failed", {
      event: "storage.upload_failed",
      bookingId: booking.id,
      requestId: getRequestId(),
      message: err instanceof Error ? err.message : "upload_failed",
    });
    return {
      ok: false,
      error: "Document storage unavailable",
      code: "storage_unavailable",
    };
  }

  const now = new Date().toISOString();
  for (const old of priorCurrent) {
    await repos.bookingDocuments.update({
      ...old,
      isCurrent: false,
    });
  }

  const supersededId = priorCurrent[0]?.id ?? null;
  let doc: BookingDocument = {
    id: documentId,
    bookingId: booking.id,
    requirementId: requirement?.id ?? null,
    documentType: input.documentType,
    filename: allowed.filename,
    storageKey,
    contentType,
    sizeBytes: input.body.length,
    uploadedByUserId: input.userId,
    uploadedAt: now,
    validationStatus: "PENDING",
    scanStatus: "PENDING_SCAN",
    scanProvider: null,
    scannedAt: null,
    scanDetails: null,
    quarantined: false,
    extractedMetadata: null,
    notes: null,
    version,
    supersedesDocumentId: supersededId,
    isCurrent: true,
  };

  try {
    await repos.bookingDocuments.create(doc);
  } catch (err) {
    metrics.uploadFailure();
    // Storage succeeded but DB failed — best-effort orphan cleanup
    try {
      await storage.delete(storageKey);
    } catch {
      logger.warn("storage.orphan_cleanup_failed", {
        event: "storage.orphan_cleanup_failed",
        bookingId: booking.id,
        storageKeyPrefix: `bookings/${booking.id}/${documentId}/`,
      });
    }
    logger.error("document.db_create_failed", {
      event: "document.db_create_failed",
      bookingId: booking.id,
      message: err instanceof Error ? err.message : "db_failed",
    });
    return {
      ok: false,
      error: "Failed to persist document metadata",
      code: "db_unavailable",
    };
  }

  metrics.uploadSuccess();

  await repos.audits.append({
    id: newId("audit"),
    commercialRequestId: booking.commercialRequestId,
    userId: input.userId,
    eventType: supersededId ? "DOCUMENT_REPLACED" : "DOCUMENT_UPLOADED",
    metadata: {
      bookingId: booking.id,
      documentId: doc.id,
      documentType: doc.documentType,
      version: doc.version,
      sizeBytes: doc.sizeBytes,
    },
    createdAt: now,
  });

  // Malware scan — never log file bytes
  await repos.audits.append({
    id: newId("audit"),
    commercialRequestId: booking.commercialRequestId,
    userId: input.userId,
    eventType: "DOCUMENT_SCAN_STARTED",
    metadata: {
      bookingId: booking.id,
      documentId: doc.id,
      filename: doc.filename,
      sizeBytes: doc.sizeBytes,
    },
    createdAt: new Date().toISOString(),
  });

  const scanner = getMalwareScanProvider();
  const scanResult = await scanner.scan({
    filename: doc.filename,
    contentType: doc.contentType,
    body: input.body,
  });
  const scanStatus: DocumentScanStatus = toDocumentScanStatus(scanResult);
  const quarantined = scanStatus === "INFECTED";

  if (scanStatus === "CLEAN") metrics.scanClean();
  else if (scanStatus === "INFECTED") metrics.scanInfected();
  else metrics.scanFailed();

  let quarantineKey = storageKey;
  if (quarantined) {
    quarantineKey = `quarantine/${booking.id}/${documentId}/${allowed.filename}`;
    try {
      await storage.upload({
        storageKey: quarantineKey,
        body: input.body,
        contentType,
      });
      await storage.delete(storageKey);
    } catch {
      // Keep original key but mark quarantined
      quarantineKey = storageKey;
    }
  }

  doc = {
    ...doc,
    storageKey: quarantineKey,
    scanStatus,
    scanProvider: scanResult.provider,
    scannedAt: scanResult.scannedAt,
    scanDetails: scanResult.details ?? null,
    quarantined,
    notes:
      scanResult.provider === "noop"
        ? "Malware scanning bypassed (development/noop provider)"
        : doc.notes,
  };
  await repos.bookingDocuments.update(doc);

  const scanEvent =
    scanStatus === "CLEAN"
      ? "DOCUMENT_SCAN_CLEAN"
      : scanStatus === "INFECTED"
        ? "DOCUMENT_SCAN_INFECTED"
        : "DOCUMENT_SCAN_FAILED";
  await repos.audits.append({
    id: newId("audit"),
    commercialRequestId: booking.commercialRequestId,
    userId: input.userId,
    eventType: scanEvent,
    metadata: {
      bookingId: booking.id,
      documentId: doc.id,
      scanStatus,
      provider: scanResult.provider,
    },
    createdAt: new Date().toISOString(),
  });
  if (quarantined) {
    await repos.audits.append({
      id: newId("audit"),
      commercialRequestId: booking.commercialRequestId,
      userId: input.userId,
      eventType: "DOCUMENT_QUARANTINED",
      metadata: { bookingId: booking.id, documentId: doc.id },
      createdAt: new Date().toISOString(),
    });
  }

  // Do not run extraction / readiness contribution for infected files
  if (scanStatus === "INFECTED") {
    if (requirement) {
      await repos.documentRequirements.update({
        ...requirement,
        status: "REJECTED",
        updatedAt: new Date().toISOString(),
      });
    }
    return { ok: true, document: doc, replaced: Boolean(supersededId) };
  }

  // Business validation only when not infected
  const textContent = bufferToText(input.body, input.contentType);
  const validation = validateDocumentAgainstBooking({
    booking,
    document: doc,
    textContent,
  });
  await persistValidationResult(
    validation,
    input.userId,
    booking.commercialRequestId,
  );

  if (requirement) {
    const reqStatus =
      scanStatus !== "CLEAN"
        ? "REVIEW_REQUIRED"
        : validation.status === "WARNING" ||
            validation.status === "REVIEW_REQUIRED"
          ? "REVIEW_REQUIRED"
          : validation.status === "FAIL"
            ? "REJECTED"
            : "UPLOADED";
    await repos.documentRequirements.update({
      ...requirement,
      status: reqStatus,
      updatedAt: new Date().toISOString(),
    });
  }

  if (booking.status === "COMMERCIALLY_CONFIRMED") {
    await repos.bookings.update({
      ...booking,
      status: "DOCUMENTS_PENDING",
      updatedAt: new Date().toISOString(),
    });
  }

  try {
    const { evaluateExceptionsForBooking } = await import(
      "@/server/exceptions/evaluateExceptions"
    );
    await evaluateExceptionsForBooking(booking.id);
  } catch {
    // Non-fatal
  }

  const refreshed = (await repos.bookingDocuments.get(doc.id)) ?? doc;
  return {
    ok: true,
    document: refreshed,
    replaced: Boolean(supersededId),
  };
}

function bufferToText(body: Buffer, contentType: string): string {
  const mime = contentType.toLowerCase();
  if (
    mime.includes("text/") ||
    mime.includes("csv") ||
    mime.includes("json")
  ) {
    return body.toString("utf8").slice(0, 200_000);
  }
  const raw = body.toString("latin1");
  const matches = raw.match(/[\x20-\x7E\n\r\t]{4,}/g);
  return (matches ?? []).join(" ").slice(0, 200_000);
}

export async function reviewDocumentWarning(input: {
  bookingId: string;
  documentId: string;
  userId: string;
}): Promise<UploadDocumentResult | { ok: true; document: BookingDocument }> {
  const repos = getRepositories();
  const booking = await repos.bookings.get(input.bookingId);
  if (!booking || booking.userId !== input.userId) {
    return { ok: false, error: "Booking not found", code: "not_found" };
  }
  const doc = await repos.bookingDocuments.get(input.documentId);
  if (!doc || doc.bookingId !== booking.id) {
    return { ok: false, error: "Document not found", code: "not_found" };
  }
  if (doc.scanStatus === "INFECTED") {
    return {
      ok: false,
      error: "Infected documents cannot be accepted",
      code: "DOCUMENT_INFECTED",
    };
  }
  const now = new Date().toISOString();
  const updated: BookingDocument = {
    ...doc,
    validationStatus:
      doc.validationStatus === "WARNING" || doc.validationStatus === "REVIEW_REQUIRED"
        ? "PASS"
        : doc.validationStatus,
    reviewedAt: now,
    reviewedByUserId: input.userId,
    notes: doc.notes
      ? `${doc.notes}\nReviewed by user`
      : "Warning reviewed by user",
  };
  await repos.bookingDocuments.update(updated);
  if (doc.requirementId) {
    const req = await repos.documentRequirements.get(doc.requirementId);
    if (req) {
      await repos.documentRequirements.update({
        ...req,
        status: "ACCEPTED",
        updatedAt: now,
      });
    }
  }
  await repos.audits.append({
    id: newId("audit"),
    commercialRequestId: booking.commercialRequestId,
    userId: input.userId,
    eventType: "DOCUMENT_REVIEWED",
    metadata: { documentId: doc.id, bookingId: booking.id },
    createdAt: now,
  });
  return { ok: true, document: updated };
}
