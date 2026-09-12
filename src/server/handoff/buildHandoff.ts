import type {
  Booking,
  CommercialRequest,
  HandoffDocumentManifestEntry,
  HandoffFieldProvenance,
  HandoffMissingItem,
  HandoffWarning,
  OperationalHandoff,
} from "@/domain/commercial/types";
import { computeDocumentCompleteness } from "@/server/documents/markReady";
import { getRepositories } from "@/server/commercial/repos";
import type { StoredUser } from "@/server/commercial/repos/types";

function validationLabel(
  status: string | undefined,
  uploaded: boolean,
): string {
  if (!uploaded) return "Not uploaded";
  switch (status) {
    case "PASS":
      return "Checks passed";
    case "WARNING":
    case "REVIEW_REQUIRED":
      return "Review required";
    case "FAIL":
      return "Validation failed";
    default:
      return status ?? "Pending";
  }
}

export function buildHandoffReference(
  bookingReference: string,
  version: number,
): string {
  return `HO-${bookingReference}-V${version}`;
}

export function buildOperationalSummary(input: {
  cargoDescription?: string | null;
  quantityTons?: number | null;
  origin?: string | null;
  destination?: string | null;
  currency?: string | null;
  rate?: number | null;
  rateUnit?: string | null;
  vesselName?: string | null;
  docsComplete: boolean;
  missingMessages: string[];
}): string {
  const cargo =
    input.quantityTons != null
      ? `${input.quantityTons.toLocaleString("en-US")} MT ${input.cargoDescription ?? "cargo"}`
      : (input.cargoDescription ?? "Cargo");
  const route = `${input.origin ?? "origin TBD"} to ${input.destination ?? "destination TBD"}`;
  const rate =
    input.rate != null
      ? `under ${input.currency ?? ""} ${input.rate}${input.rateUnit ? `/${input.rateUnit}` : ""} terms`.replace(
          /\s+/g,
          " ",
        )
      : "under agreed commercial terms";
  const vessel = input.vesselName
    ? `${input.vesselName} nominated.`
    : "Vessel not nominated.";
  const docs = input.docsComplete
    ? "Required documents complete."
    : "Required documents incomplete.";
  const missing =
    input.missingMessages.length > 0
      ? ` ${input.missingMessages[0]}.`
      : "";
  return `${cargo} shipment from ${route} ${rate}. ${vessel} ${docs}${missing}`.trim();
}

export async function assertHandoffReady(input: {
  bookingId: string;
  userId: string;
}): Promise<
  | {
      ok: true;
      booking: Booking;
      request: CommercialRequest;
      user: StoredUser;
    }
  | { ok: false; error: string; code: string }
> {
  const repos = getRepositories();
  const booking = await repos.bookings.get(input.bookingId);
  if (!booking || booking.userId !== input.userId) {
    return { ok: false, error: "Booking not found", code: "not_found" };
  }
  if (booking.status !== "READY_FOR_OPERATIONS") {
    return {
      ok: false,
      error: "Booking must be READY_FOR_OPERATIONS",
      code: "HANDOFF_NOT_READY",
    };
  }

  const completeness = await computeDocumentCompleteness(booking.id);
  if (!completeness.canMarkReady) {
    return {
      ok: false,
      error: "Critical document issues block handoff",
      code: "HANDOFF_NOT_READY",
    };
  }

  const request = await repos.requests.get(booking.commercialRequestId);
  if (!request) {
    return { ok: false, error: "Request not found", code: "HANDOFF_NOT_READY" };
  }

  const user = await repos.users.findById(input.userId);
  if (!user) {
    return { ok: false, error: "User not found", code: "not_found" };
  }

  return { ok: true, booking, request, user };
}

export async function buildHandoffContent(input: {
  booking: Booking;
  request: CommercialRequest;
  user: StoredUser;
  version: number;
  supersedesHandoffId?: string | null;
  operationsContactName?: string | null;
  operationsContactEmail?: string | null;
  operationsContactPhone?: string | null;
  operationalNotes?: string | null;
}): Promise<
  Omit<
    OperationalHandoff,
    | "id"
    | "status"
    | "generatedAt"
    | "updatedAt"
    | "reviewedAt"
    | "finalizedAt"
    | "finalizedByUserId"
  >
> {
  const repos = getRepositories();
  const { booking, request, user } = input;
  const commercial = booking.commercialSnapshot;
  const sourceLabel = booking.acceptedCommercialSnapshotId
    ? "Accepted Commercial Snapshot"
    : "Booking commercial snapshot (proceed / confirmation)";

  const requirements = await repos.documentRequirements.listForBooking(
    booking.id,
  );
  const currentDocs = await repos.bookingDocuments.listCurrentForBooking(
    booking.id,
  );

  const documentManifest: HandoffDocumentManifestEntry[] = requirements.map(
    (req) => {
      const doc = currentDocs.find(
        (d) =>
          d.requirementId === req.id || d.documentType === req.documentType,
      );
      return {
        documentType: req.documentType,
        label: req.label,
        required: req.required,
        uploaded: Boolean(doc),
        filename: doc?.filename ?? null,
        version: doc?.version ?? null,
        validationLabel: validationLabel(doc?.validationStatus, Boolean(doc)),
        source: doc
          ? `Uploaded document v${doc.version}`
          : req.required
            ? "Required — not uploaded"
            : "Optional — not uploaded",
        documentId: doc?.id ?? null,
      };
    },
  );

  const warnings: HandoffWarning[] = [];
  const missingInformation: HandoffMissingItem[] = [];

  for (const entry of documentManifest) {
    if (entry.required && !entry.uploaded) {
      warnings.push({
        code: "REQUIRED_DOCUMENT_MISSING",
        message: `Required document missing: ${entry.label}`,
        severity: "CRITICAL",
      });
    } else if (!entry.required && !entry.uploaded) {
      warnings.push({
        code: "OPTIONAL_DOCUMENT_MISSING",
        message: `${entry.label} is optional and not uploaded.`,
        severity: "INFO",
      });
    } else if (
      entry.uploaded &&
      (entry.validationLabel === "Review required" ||
        entry.validationLabel === "Validation failed")
    ) {
      warnings.push({
        code: "DOCUMENT_VALIDATION_ISSUE",
        message: `${entry.label}: ${entry.validationLabel}`,
        severity:
          entry.validationLabel === "Validation failed" ? "CRITICAL" : "WARNING",
      });
    }
  }

  if (!booking.vesselSnapshot?.vesselName && !commercial.vesselName) {
    missingInformation.push({
      code: "VESSEL_UNKNOWN",
      message: "Vessel not nominated",
    });
    warnings.push({
      code: "VESSEL_UNKNOWN",
      message: "Vessel not nominated.",
      severity: "WARNING",
    });
  } else if (!booking.vesselSnapshot?.vesselImo) {
    missingInformation.push({
      code: "VESSEL_IMO_UNAVAILABLE",
      message: "Vessel IMO unavailable",
    });
    warnings.push({
      code: "VESSEL_IMO_UNAVAILABLE",
      message: "Vessel IMO not available.",
      severity: "WARNING",
    });
  }

  missingInformation.push({
    code: "LOADING_TERMINAL_UNSPECIFIED",
    message: "Loading terminal not specified",
  });
  missingInformation.push({
    code: "DISCHARGE_TERMINAL_UNSPECIFIED",
    message: "Discharge terminal not specified",
  });

  const brokerPhone = null;
  if (!brokerPhone) {
    missingInformation.push({
      code: "BROKER_OPS_PHONE_UNAVAILABLE",
      message: "Broker operational phone number unavailable",
    });
  }

  const hasDimensionsDoc = documentManifest.some(
    (d) => d.documentType === "CARGO_DIMENSIONS" && d.uploaded,
  );
  if (
    !hasDimensionsDoc &&
    !request.cargo.volumeCbm &&
    !request.cargo.unitsPackages
  ) {
    missingInformation.push({
      code: "CARGO_DIMENSIONS_MISSING",
      message: "Cargo dimensions not provided",
    });
  }

  const provenance: HandoffFieldProvenance[] = [
    {
      field: "bookingReference",
      displayValue: booking.bookingReference,
      source: "Booking record",
    },
    {
      field: "rate",
      displayValue:
        commercial.rate != null
          ? `${commercial.currency ?? ""} ${commercial.rate}${commercial.rateUnit ? ` / ${commercial.rateUnit}` : ""}`.trim()
          : "—",
      source: sourceLabel,
    },
    {
      field: "cargoQuantity",
      displayValue:
        booking.cargoSnapshot.weightTons != null
          ? `${booking.cargoSnapshot.weightTons.toLocaleString("en-US")} MT`
          : "—",
      source: "Booking cargo snapshot",
    },
    {
      field: "vessel",
      displayValue:
        booking.vesselSnapshot?.vesselName ?? commercial.vesselName ?? "—",
      source: booking.vesselSnapshot?.vesselName
        ? "Broker confirmation / booking vessel snapshot"
        : commercial.vesselName
          ? "Commercial snapshot"
          : "Not available",
    },
    {
      field: "route",
      displayValue: `${booking.origin ?? "—"} → ${booking.destination ?? "—"}`,
      source: "Booking route snapshot",
    },
  ];

  for (const entry of documentManifest.filter((e) => e.uploaded)) {
    provenance.push({
      field: `document:${entry.documentType}`,
      displayValue: `${entry.label} v${entry.version}`,
      source: entry.source,
    });
  }

  const vesselName =
    booking.vesselSnapshot?.vesselName ?? commercial.vesselName ?? null;
  const completeness = await computeDocumentCompleteness(booking.id);

  return {
    handoffReference: buildHandoffReference(
      booking.bookingReference,
      input.version,
    ),
    bookingId: booking.id,
    userId: booking.userId,
    version: input.version,
    supersedesHandoffId: input.supersedesHandoffId ?? null,
    bookingSnapshot: {
      bookingReference: booking.bookingReference,
      status: booking.status,
      externalBookingReference: booking.externalBookingReference ?? null,
      brokerReference: booking.brokerReference ?? null,
      carrierReference: booking.carrierReference ?? null,
      brokerOrganization: booking.brokerOrganization ?? null,
      confirmedAt: booking.confirmedAt,
      documentsReadyAt: booking.documentsReadyAt ?? null,
    },
    commercialSnapshot: {
      ...commercial,
      sourceLabel,
    },
    shipmentSnapshot: {
      origin: booking.origin ?? null,
      destination: booking.destination ?? null,
      cargoDescription: booking.cargoSnapshot.description ?? null,
      quantityTons: booking.cargoSnapshot.weightTons ?? null,
      unit: "MT",
      volumeCbm: booking.cargoSnapshot.volumeCbm ?? null,
      unitsPackages: booking.cargoSnapshot.unitsPackages ?? null,
      dangerousGoods: request.dangerousGoods ?? null,
    },
    vesselSnapshot: {
      vesselName,
      vesselImo: booking.vesselSnapshot?.vesselImo ?? null,
      vesselMmsi: booking.vesselSnapshot?.vesselMmsi ?? null,
      vesselType: commercial.vesselType ?? null,
    },
    contactsSnapshot: {
      requesterName: user.fullName,
      requesterEmail: user.email,
      brokerOrganization:
        booking.brokerOrganization ?? commercial.organization ?? null,
      brokerEmail: request.recipient?.email ?? null,
      brokerPhone: null,
    },
    documentManifest,
    warnings,
    missingInformation,
    provenance,
    operationsContactName: input.operationsContactName ?? user.fullName,
    operationsContactEmail: input.operationsContactEmail ?? user.email,
    operationsContactPhone: input.operationsContactPhone ?? user.phone ?? null,
    operationalNotes: input.operationalNotes ?? null,
    operationalSummary: buildOperationalSummary({
      cargoDescription: booking.cargoSnapshot.description,
      quantityTons: booking.cargoSnapshot.weightTons,
      origin: booking.origin,
      destination: booking.destination,
      currency: commercial.currency,
      rate: commercial.rate,
      rateUnit: commercial.rateUnit,
      vesselName,
      docsComplete: completeness.canMarkReady,
      missingMessages: missingInformation.map((m) => m.message),
    }),
  };
}

/** True when live documents differ from a finalized handoff manifest. */
export async function detectNewerDocumentsThanHandoff(
  handoff: OperationalHandoff,
): Promise<boolean> {
  const repos = getRepositories();
  const current = await repos.bookingDocuments.listCurrentForBooking(
    handoff.bookingId,
  );
  for (const entry of handoff.documentManifest) {
    if (!entry.uploaded || !entry.documentId) continue;
    const live = current.find(
      (d) =>
        d.documentType === entry.documentType ||
        d.requirementId ===
          current.find((c) => c.id === entry.documentId)?.requirementId,
    );
    const byType = current.find((d) => d.documentType === entry.documentType);
    const doc = byType ?? live;
    if (!doc) continue;
    if (doc.id !== entry.documentId || doc.version !== entry.version) {
      return true;
    }
  }
  for (const doc of current) {
    const inManifest = handoff.documentManifest.find(
      (e) => e.documentType === doc.documentType && e.uploaded,
    );
    if (!inManifest) return true;
  }
  return false;
}
