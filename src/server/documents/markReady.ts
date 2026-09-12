import type { Booking } from "@/domain/commercial/types";
import { getRepositories } from "@/server/commercial/repos";
import { newId } from "@/server/commercial/repos/memory";

/** Legacy documents without scanStatus are treated as CLEAN outside production. */
function effectiveScanStatus(
  scanStatus: string | null | undefined,
): "PENDING_SCAN" | "CLEAN" | "INFECTED" | "SCAN_FAILED" {
  if (scanStatus === "PENDING_SCAN" || scanStatus === "CLEAN" || scanStatus === "INFECTED" || scanStatus === "SCAN_FAILED") {
    return scanStatus;
  }
  if (process.env.NODE_ENV === "production" && process.env.MALWARE_SCAN_ALLOW_NOOP !== "true") {
    // Unscanned legacy uploads require re-scan in hardened production
    return "PENDING_SCAN";
  }
  return "CLEAN";
}

export interface CompletenessSummary {
  requiredTotal: number;
  requiredUploaded: number;
  percent: number;
  missingRequired: string[];
  unresolvedCritical: string[];
  canMarkReady: boolean;
}

export async function computeDocumentCompleteness(
  bookingId: string,
): Promise<CompletenessSummary> {
  const repos = getRepositories();
  const requirements = await repos.documentRequirements.listForBooking(bookingId);
  const currentDocs = await repos.bookingDocuments.listCurrentForBooking(bookingId);
  const required = requirements.filter((r) => r.required);
  const missingRequired: string[] = [];
  let requiredUploaded = 0;
  const unresolvedCritical: string[] = [];

  for (const req of required) {
    const doc = currentDocs.find((d) => d.requirementId === req.id || d.documentType === req.documentType);
    if (!doc) {
      missingRequired.push(req.label);
      continue;
    }
    const scan = effectiveScanStatus(doc.scanStatus);
    if (scan === "INFECTED") {
      unresolvedCritical.push(`${req.label}: file blocked by malware scan`);
      continue;
    }
    if (scan === "PENDING_SCAN") {
      unresolvedCritical.push(`${req.label}: malware scan pending`);
      continue;
    }
    if (scan === "SCAN_FAILED") {
      unresolvedCritical.push(`${req.label}: malware scan failed — retry upload`);
      continue;
    }
    if (doc.validationStatus === "FAIL") {
      unresolvedCritical.push(`${req.label}: validation failed`);
      continue;
    }
    if (
      (doc.validationStatus === "WARNING" ||
        doc.validationStatus === "REVIEW_REQUIRED" ||
        req.status === "REVIEW_REQUIRED") &&
      !doc.reviewedAt
    ) {
      unresolvedCritical.push(`${req.label}: warning not reviewed`);
      continue;
    }
    requiredUploaded += 1;
  }

  const percent =
    required.length === 0
      ? 100
      : Math.round((requiredUploaded / required.length) * 100);

  return {
    requiredTotal: required.length,
    requiredUploaded,
    percent,
    missingRequired,
    unresolvedCritical,
    canMarkReady:
      missingRequired.length === 0 && unresolvedCritical.length === 0,
  };
}

export type MarkReadyResult =
  | { ok: true; booking: Booking; alreadyReady?: boolean }
  | { ok: false; error: string; code: string; completeness?: CompletenessSummary };

export async function markBookingReadyForOperations(input: {
  bookingId: string;
  userId: string;
}): Promise<MarkReadyResult> {
  const repos = getRepositories();
  const booking = await repos.bookings.get(input.bookingId);
  if (!booking || booking.userId !== input.userId) {
    return { ok: false, error: "Booking not found", code: "not_found" };
  }

  if (booking.status === "READY_FOR_OPERATIONS") {
    return { ok: true, booking, alreadyReady: true };
  }

  if (
    booking.status !== "DOCUMENTS_PENDING" &&
    booking.status !== "COMMERCIALLY_CONFIRMED"
  ) {
    return {
      ok: false,
      error: "Booking is not in a document-preparation state",
      code: "invalid_status",
    };
  }

  const completeness = await computeDocumentCompleteness(booking.id);
  if (!completeness.canMarkReady) {
    return {
      ok: false,
      error: "Document package is not ready",
      code: "incomplete",
      completeness,
    };
  }

  const now = new Date().toISOString();
  const updated: Booking = {
    ...booking,
    status: "READY_FOR_OPERATIONS",
    documentsReadyAt: now,
    updatedAt: now,
  };
  await repos.bookings.update(updated);

  await repos.audits.append({
    id: newId("audit"),
    commercialRequestId: booking.commercialRequestId,
    userId: input.userId,
    eventType: "DOCUMENT_PACKAGE_READY",
    metadata: {
      bookingId: booking.id,
      requiredUploaded: completeness.requiredUploaded,
      requiredTotal: completeness.requiredTotal,
    },
    createdAt: now,
  });

  return { ok: true, booking: updated };
}
