import type {
  Booking,
  BookingDocumentRequirement,
  BookingDocumentType,
  CommercialRequest,
} from "@/domain/commercial/types";
import { getRepositories } from "@/server/commercial/repos";
import { newId } from "@/server/commercial/repos/memory";

const LABELS: Record<BookingDocumentType, string> = {
  COMMERCIAL_INVOICE: "Commercial Invoice",
  PACKING_LIST: "Packing List",
  CARGO_MANIFEST: "Cargo Manifest",
  BILL_OF_LADING_INSTRUCTIONS: "Bill of Lading Instructions",
  CERTIFICATE_OF_ORIGIN: "Certificate of Origin",
  DANGEROUS_GOODS_DECLARATION: "Dangerous Goods Declaration",
  CARGO_DIMENSIONS: "Cargo Dimensions / Technical Specification",
  INSURANCE_CERTIFICATE: "Insurance Certificate",
  EXPORT_DOCUMENTATION: "Export Documentation",
  CUSTOMS_DOCUMENTATION: "Customs Documentation",
  MSDS: "MSDS / Safety Data Sheet",
  LETTER_OF_AUTHORIZATION: "Letter of Authorization",
  OTHER: "Other",
};

/**
 * Generates CargoConnect document checklist — not a legal/customs completeness claim.
 */
export async function generateDocumentRequirementsForBooking(input: {
  booking: Booking;
  request: CommercialRequest;
}): Promise<BookingDocumentRequirement[]> {
  const repos = getRepositories();
  const existing = await repos.documentRequirements.listForBooking(
    input.booking.id,
  );
  if (existing.length) return existing;

  const now = new Date().toISOString();
  const items: Array<{
    type: BookingDocumentType;
    required: boolean;
    source: "SYSTEM" | "BROKER_REQUEST";
    description?: string;
    sourceInboundMessageId?: string | null;
  }> = [
    {
      type: "COMMERCIAL_INVOICE",
      required: true,
      source: "SYSTEM",
      description: "Commercial invoice matching the shipment.",
    },
    {
      type: "PACKING_LIST",
      required: true,
      source: "SYSTEM",
      description: "Packing list with weights and package details.",
    },
    {
      type: "BILL_OF_LADING_INSTRUCTIONS",
      required: true,
      source: "SYSTEM",
      description: "Bill of lading / shipping instructions.",
    },
    {
      type: "CERTIFICATE_OF_ORIGIN",
      required: false,
      source: "SYSTEM",
      description: "Optional certificate of origin when requested by trade lane.",
    },
  ];

  if (input.request.dangerousGoods) {
    items.push(
      {
        type: "DANGEROUS_GOODS_DECLARATION",
        required: true,
        source: "SYSTEM",
        description: "Dangerous goods declaration.",
      },
      {
        type: "MSDS",
        required: true,
        source: "SYSTEM",
        description: "Safety data sheet for hazardous cargo.",
      },
    );
  }

  if (input.request.oversizedProjectCargo) {
    items.push({
      type: "CARGO_DIMENSIONS",
      required: true,
      source: "SYSTEM",
      description: "Cargo dimensions / technical specification for project cargo.",
    });
  }

  // Broker-requested docs from confirmation / inbound messages
  const confirmation = input.booking.confirmationSnapshot;
  const brokerDocs = new Set<string>(
    (confirmation.requiredDocuments ?? []).map((d) => d.toLowerCase()),
  );
  const messages = await repos.messages.listForRequest(
    input.booking.commercialRequestId,
  );
  for (const m of messages.filter((x) => x.direction === "INBOUND")) {
    const body = `${m.subject}\n${m.bodySnapshot}`.toLowerCase();
    if (
      /\b(cargo dimensions|package dimensions|technical specification)\b/.test(
        body,
      )
    ) {
      brokerDocs.add("cargo dimensions");
    }
    if (/\bpacking list\b/.test(body)) brokerDocs.add("packing list");
    if (/\b(msds|safety data)\b/.test(body)) brokerDocs.add("msds");
    if (/\bdangerous goods\b/.test(body)) brokerDocs.add("dangerous goods");
  }

  for (const hint of brokerDocs) {
    if (hint.includes("dimension")) {
      upsertBroker(items, "CARGO_DIMENSIONS", confirmation.inboundMessageId);
    } else if (hint.includes("packing")) {
      // already required system — mark broker source note via description update later
    } else if (hint.includes("msds") || hint.includes("safety")) {
      upsertBroker(items, "MSDS", confirmation.inboundMessageId);
    } else if (hint.includes("dangerous")) {
      upsertBroker(items, "DANGEROUS_GOODS_DECLARATION", confirmation.inboundMessageId);
    }
  }

  const requirements: BookingDocumentRequirement[] = items.map((item) => ({
    id: newId("dreq"),
    bookingId: input.booking.id,
    documentType: item.type,
    label: LABELS[item.type],
    description: item.description ?? null,
    required: item.required,
    source: item.source,
    status: "MISSING",
    sourceInboundMessageId: item.sourceInboundMessageId ?? null,
    createdAt: now,
    updatedAt: now,
  }));

  await repos.documentRequirements.createMany(requirements);
  await repos.audits.append({
    id: newId("audit"),
    commercialRequestId: input.booking.commercialRequestId,
    userId: input.booking.userId,
    eventType: "DOCUMENT_REQUIREMENTS_CREATED",
    metadata: {
      bookingId: input.booking.id,
      count: requirements.length,
      required: requirements.filter((r) => r.required).length,
    },
    createdAt: now,
  });

  // Move booking into documents phase
  if (input.booking.status === "COMMERCIALLY_CONFIRMED") {
    await repos.bookings.update({
      ...input.booking,
      status: "DOCUMENTS_PENDING",
      updatedAt: now,
    });
  }

  return requirements;
}

function upsertBroker(
  items: Array<{
    type: BookingDocumentType;
    required: boolean;
    source: "SYSTEM" | "BROKER_REQUEST";
    description?: string;
    sourceInboundMessageId?: string | null;
  }>,
  type: BookingDocumentType,
  messageId?: string | null,
) {
  const existing = items.find((i) => i.type === type);
  if (existing) {
    existing.required = true;
    existing.source = "BROKER_REQUEST";
    existing.sourceInboundMessageId = messageId ?? existing.sourceInboundMessageId;
    existing.description =
      existing.description ??
      "Requested in broker correspondence — CargoConnect checklist item.";
    return;
  }
  items.push({
    type,
    required: true,
    source: "BROKER_REQUEST",
    description: "Requested in broker correspondence.",
    sourceInboundMessageId: messageId ?? null,
  });
}

export function documentTypeLabel(type: BookingDocumentType): string {
  return LABELS[type];
}
