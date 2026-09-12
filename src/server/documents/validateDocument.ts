import type {
  BookingDocument,
  BookingDocumentType,
  DocumentValidationCheck,
  DocumentValidationResult,
  DocumentValidationStatus,
} from "@/domain/commercial/types";
import type { Booking } from "@/domain/commercial/types";
import { getRepositories } from "@/server/commercial/repos";
import { newId } from "@/server/commercial/repos/memory";

/**
 * Deterministic lightweight extraction + consistency checks.
 * Does not claim regulatory/legal validation. No malware scanning.
 */
export function extractDocumentMetadata(input: {
  documentType: BookingDocumentType;
  filename: string;
  textContent: string;
}): Record<string, unknown> {
  const text = input.textContent;
  const fields: Record<string, unknown> = {};

  const invoiceNo = text.match(
    /invoice\s*(?:no\.?|number|#)\s*[:#]?\s*([A-Z0-9-]{3,20})/i,
  );
  if (invoiceNo) fields.invoiceNumber = invoiceNo[1];

  const date = text.match(
    /\b(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{4}-\d{2}-\d{2}|\d{1,2}\s+[A-Za-z]+\s+\d{4})\b/,
  );
  if (date) fields.date = date[1];

  const currency =
    text.match(/\b(USD|EUR|GBP|AED|SAR)\b/i)?.[1]?.toUpperCase() ?? null;
  if (currency) fields.currency = currency;

  const total = text.match(
    /(?:total|amount)\s*:?\s*(?:USD|EUR|GBP|\$)?\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.\d+)?)/i,
  );
  if (total) fields.total = Number(total[1].replace(/,/g, ""));

  const weight = text.match(
    /\b([0-9]{1,3}(?:,[0-9]{3})*(?:\.\d+)?|\d+(?:\.\d+)?)\s*(?:MT|mt|tons?|tonnes?)\b/,
  );
  if (weight) fields.weightTons = Number(weight[1].replace(/,/g, ""));

  const packages = text.match(
    /\b(\d+)\s*(?:packages?|pkgs?|cartons?|units?)\b/i,
  );
  if (packages) fields.packageCount = Number(packages[1]);

  const dims = text.match(
    /\b(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)\s*(cm|m|mm)?/i,
  );
  if (dims) {
    fields.dimensions = `${dims[1]}x${dims[2]}x${dims[3]}${dims[4] ? ` ${dims[4]}` : ""}`;
  }

  const un = text.match(/\bUN\s*(\d{4})\b/i);
  if (un) fields.unNumber = un[1];
  const hazard = text.match(/\b(?:class|hazard)\s*[:#]?\s*([0-9](?:\.[0-9])?)/i);
  if (hazard) fields.hazardClass = hazard[1];

  const origin = text.match(/\borigin\s*:?\s*([A-Za-z][A-Za-z\s-]{2,40})/i);
  if (origin) fields.origin = origin[1].trim();
  const destination = text.match(
    /\b(?:destination|discharge)\s*:?\s*([A-Za-z][A-Za-z\s-]{2,40})/i,
  );
  if (destination) fields.destination = destination[1].trim();

  fields.filename = input.filename;
  fields.documentType = input.documentType;
  return fields;
}

export function validateDocumentAgainstBooking(input: {
  booking: Booking;
  document: BookingDocument;
  textContent: string;
}): DocumentValidationResult {
  const extracted = extractDocumentMetadata({
    documentType: input.document.documentType,
    filename: input.document.filename,
    textContent: input.textContent,
  });
  const checks: DocumentValidationCheck[] = [];
  const mismatches: string[] = [];

  checks.push({
    code: "file_non_empty",
    message: "File is non-empty",
    severity: "CRITICAL",
    passed: input.document.sizeBytes > 0,
  });
  checks.push({
    code: "type_selected",
    message: "Document type selected",
    severity: "INFO",
    passed: Boolean(input.document.documentType),
  });

  const bookedWeight = input.booking.cargoSnapshot.weightTons;
  const docWeight =
    typeof extracted.weightTons === "number" ? extracted.weightTons : null;
  if (bookedWeight != null && docWeight != null) {
    const delta = Math.abs(bookedWeight - docWeight);
    const ok = delta <= 0.5;
    checks.push({
      code: "weight_match",
      message: ok
        ? "Cargo weight consistent with booking"
        : `Cargo weight differs from booking by ${delta} MT.`,
      severity: ok ? "INFO" : "WARNING",
      passed: ok,
    });
    if (!ok) {
      mismatches.push(
        `Cargo weight differs from booking by ${delta} MT.`,
      );
    }
  }

  const bookedOrigin = input.booking.origin?.toLowerCase();
  const docOrigin =
    typeof extracted.origin === "string"
      ? extracted.origin.toLowerCase()
      : null;
  if (bookedOrigin && docOrigin && !docOrigin.includes(bookedOrigin) && !bookedOrigin.includes(docOrigin)) {
    checks.push({
      code: "origin_mismatch",
      message: "Origin appears to differ from booking",
      severity: "WARNING",
      passed: false,
    });
    mismatches.push("Origin mismatch vs booking");
  }

  const bookedDest = input.booking.destination?.toLowerCase();
  const docDest =
    typeof extracted.destination === "string"
      ? extracted.destination.toLowerCase()
      : null;
  if (
    bookedDest &&
    docDest &&
    !docDest.includes(bookedDest) &&
    !bookedDest.includes(docDest)
  ) {
    checks.push({
      code: "destination_mismatch",
      message: "Destination appears to differ from booking",
      severity: "WARNING",
      passed: false,
    });
    mismatches.push("Destination mismatch vs booking");
  }

  const cargoDesc = input.booking.cargoSnapshot.description?.toLowerCase();
  if (
    cargoDesc &&
    input.textContent &&
    !input.textContent.toLowerCase().includes(cargoDesc) &&
    (input.document.documentType === "COMMERCIAL_INVOICE" ||
      input.document.documentType === "PACKING_LIST")
  ) {
    // Soft info only — many invoices use different wording
    checks.push({
      code: "cargo_description",
      message: "Cargo description wording may differ from booking",
      severity: "INFO",
      passed: true,
    });
  }

  const hasCriticalFail = checks.some(
    (c) => c.severity === "CRITICAL" && !c.passed,
  );
  const hasWarning = checks.some((c) => c.severity === "WARNING" && !c.passed);
  let status: DocumentValidationStatus = "PASS";
  if (hasCriticalFail) status = "FAIL";
  else if (hasWarning) status = "WARNING";

  return {
    id: newId("dval"),
    documentId: input.document.id,
    bookingId: input.booking.id,
    status,
    checks,
    extractedFields: extracted,
    mismatches,
    validatedAt: new Date().toISOString(),
  };
}

export async function persistValidationResult(
  result: DocumentValidationResult,
  userId: string,
  commercialRequestId: string,
): Promise<void> {
  const repos = getRepositories();
  await repos.documentValidations.create(result);
  const doc = await repos.bookingDocuments.get(result.documentId);
  if (doc) {
    await repos.bookingDocuments.update({
      ...doc,
      validationStatus: result.status,
      extractedMetadata: result.extractedFields,
    });
  }
  await repos.audits.append({
    id: newId("audit"),
    commercialRequestId,
    userId,
    eventType: "DOCUMENT_VALIDATED",
    metadata: {
      documentId: result.documentId,
      status: result.status,
      mismatchCount: result.mismatches.length,
    },
    createdAt: result.validatedAt,
  });
  if (result.mismatches.length) {
    await repos.audits.append({
      id: newId("audit"),
      commercialRequestId,
      userId,
      eventType: "DOCUMENT_WARNING_CREATED",
      metadata: {
        documentId: result.documentId,
        mismatches: result.mismatches.slice(0, 5),
      },
      createdAt: result.validatedAt,
    });
  }
}
