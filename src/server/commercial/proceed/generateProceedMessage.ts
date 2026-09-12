import type {
  CommercialQuote,
  CommercialRequest,
  ProceedSnapshot,
} from "@/domain/commercial/types";
import {
  effectiveQuote,
  estimateFreightAmount,
} from "@/server/commercial/comparison/normalize";

/** Narrow requester shape for templates. */
export interface ProceedRequester {
  fullName: string;
  email: string;
  companyName?: string;
  phone?: string;
}

export function buildProceedSnapshot(input: {
  quote: CommercialQuote;
  request: CommercialRequest;
}): ProceedSnapshot {
  const q = effectiveQuote(input.quote);
  const freight = estimateFreightAmount({
    quote: q,
    shipmentQuantityTons: input.request.cargo.weightTons,
  });
  return {
    quoteId: input.quote.id,
    quoteVersion: input.quote.version ?? 1,
    organization:
      q.organizationName ??
      input.request.recipient?.organizationName ??
      "Commercial contact",
    contactId: q.contactId ?? input.request.recipient?.contactId ?? null,
    currency: q.currency ?? null,
    rate: q.freightRate ?? null,
    rateUnit: q.rateUnit ?? null,
    estimatedFreight: freight.amount,
    totalPrice: q.totalPrice ?? null,
    departure: q.estimatedDeparture ?? null,
    transit: q.transitTime ?? null,
    validity: q.validityUntil ?? null,
    vesselName: q.vesselName ?? null,
    vesselType: q.vesselType ?? null,
    includedCharges: q.includedCharges ?? null,
    excludedCharges: q.excludedCharges ?? null,
    paymentTerms: q.paymentTerms ?? null,
    inboundMessageId: input.quote.inboundMessageId,
    capturedAt: new Date().toISOString(),
  };
}

export function generateProceedMessage(input: {
  request: CommercialRequest;
  snapshot: ProceedSnapshot;
  requester: ProceedRequester;
}): { subject: string; body: string } {
  const origin = input.request.origin?.name ?? "—";
  const destination = input.request.destination?.name ?? "—";
  const cargoBits = [
    input.request.cargo.description,
    input.request.cargo.weightTons != null
      ? `${input.request.cargo.weightTons.toLocaleString("en-US")} MT`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const rateLine = formatRate(input.snapshot);
  const lines = [
    `Dear ${input.snapshot.organization},`,
    "",
    "We would like to proceed based on your quotation for the following shipment:",
    "",
    `Origin: ${origin}`,
    `Destination: ${destination}`,
    cargoBits ? `Cargo: ${cargoBits}` : null,
    rateLine ? `Quoted rate: ${rateLine}` : null,
    input.snapshot.estimatedFreight != null && input.snapshot.currency
      ? `Estimated freight: ${input.snapshot.currency} ${input.snapshot.estimatedFreight.toLocaleString("en-US")}`
      : input.snapshot.totalPrice != null && input.snapshot.currency
        ? `Quoted amount: ${input.snapshot.currency} ${input.snapshot.totalPrice.toLocaleString("en-US")}`
        : null,
    input.snapshot.departure
      ? `Laycan / departure: ${input.snapshot.departure}`
      : null,
    input.snapshot.transit
      ? `Transit: approximately ${input.snapshot.transit}`
      : null,
    input.snapshot.vesselName ? `Vessel: ${input.snapshot.vesselName}` : null,
    input.snapshot.includedCharges
      ? `Included: ${input.snapshot.includedCharges}`
      : null,
    input.snapshot.excludedCharges
      ? `Excluded: ${input.snapshot.excludedCharges}`
      : null,
    input.snapshot.paymentTerms
      ? `Payment terms: ${input.snapshot.paymentTerms}`
      : null,
    "",
    "Please confirm:",
    "- vessel / capacity availability",
    "- final commercial terms",
    "- booking or reservation reference",
    "- any documentation required from us",
    "- next operational steps",
    "",
    "Please note that this message is a request to proceed based on the quotation and is subject to your confirmation.",
    "",
    "Kind regards,",
    input.requester.fullName,
    input.requester.companyName || null,
    input.requester.email,
    input.requester.phone || null,
  ].filter((l) => l !== null && l !== undefined) as string[];

  const subject = `Request to proceed — ${origin} to ${destination} — Quote Ref ${input.snapshot.quoteId.slice(0, 12)}`;

  return { subject, body: lines.join("\n") };
}

function formatRate(snapshot: ProceedSnapshot): string | null {
  if (snapshot.rate == null || !snapshot.currency) return null;
  const unit = snapshot.rateUnit ? ` / ${snapshot.rateUnit}` : "";
  return `${snapshot.currency} ${snapshot.rate}${unit}`;
}
