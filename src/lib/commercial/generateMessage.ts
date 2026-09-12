import type {
  CommercialAiDraft,
  CommercialRequest,
  CommercialRequestType,
} from "@/domain/commercial/types";
import { formatVesselType } from "@/lib/format";

export interface MessageFormInput {
  type: CommercialRequestType;
  contactName: string;
  companyName?: string;
  originName?: string;
  destinationName?: string;
  cargoDescription?: string;
  cargoType?: string;
  weightTons?: number;
  volumeCbm?: number;
  unitsPackages?: string;
  requestedDeparture?: string;
  preferredVesselType?: string;
  selectedVesselName?: string;
  noVesselPreference?: boolean;
  additionalNotes?: string;
  recipientOrganization?: string;
  dangerousGoods?: boolean;
  oversizedProjectCargo?: boolean;
  handlingRequirements?: string;
}

/**
 * Deterministic commercial message template.
 * Facts come only from structured form fields — never invents price/availability.
 */
export function generateCommercialMessageDraft(
  input: MessageFormInput,
): CommercialAiDraft {
  const origin = input.originName?.trim() || "Origin to be confirmed";
  const destination = input.destinationName?.trim() || "Destination to be confirmed";
  const isQuote = input.type === "QUOTE";

  const subject = isQuote
    ? `Freight quotation request — ${origin} to ${destination}`
    : `Shipment reservation request — ${origin} to ${destination}`;

  const recipientLabel = input.recipientOrganization?.trim() || "Broker / Commercial Team";
  const signer = input.contactName.trim() || "CargoConnect user";
  const companyLine = input.companyName?.trim()
    ? `\n${input.companyName.trim()}`
    : "";

  const cargoLines: string[] = [];
  if (input.cargoDescription) cargoLines.push(`Cargo: ${input.cargoDescription}`);
  if (input.cargoType) cargoLines.push(`Cargo type: ${input.cargoType}`);
  if (input.weightTons != null && Number.isFinite(input.weightTons)) {
    cargoLines.push(`Weight: ${input.weightTons.toLocaleString("en-US")} tons`);
  }
  if (input.volumeCbm != null && Number.isFinite(input.volumeCbm)) {
    cargoLines.push(`Volume: ${input.volumeCbm} m³`);
  }
  if (input.unitsPackages) cargoLines.push(`Units / packages: ${input.unitsPackages}`);
  if (input.requestedDeparture) {
    cargoLines.push(`Preferred departure: ${input.requestedDeparture}`);
  }
  if (input.preferredVesselType) {
    cargoLines.push(`Vessel preference: ${prettyVesselType(input.preferredVesselType)}`);
  }
  if (input.selectedVesselName && !input.noVesselPreference) {
    cargoLines.push(
      `Selected vessel of interest (corridor-relevant only, not a booking): ${input.selectedVesselName}`,
    );
  } else if (input.noVesselPreference) {
    cargoLines.push("Vessel preference: No vessel preference");
  }

  const flags: string[] = [];
  if (input.dangerousGoods) flags.push("Dangerous goods: Yes");
  if (input.oversizedProjectCargo) flags.push("Oversized / project cargo: Yes");
  if (input.handlingRequirements?.trim()) {
    flags.push(`Handling requirements: ${input.handlingRequirements.trim()}`);
  }
  if (input.additionalNotes?.trim()) {
    flags.push(`Additional notes: ${input.additionalNotes.trim()}`);
  }

  const ask = isQuote
    ? "Please provide available options, indicative transit time, commercial rate, and relevant terms."
    : "Please advise whether a reservation request can be considered for this shipment, including indicative transit time, commercial terms, and next steps. This is a reservation request only — not a confirmed booking.";

  const body = [
    `Dear ${recipientLabel},`,
    "",
    isQuote
      ? "We would like to request an up-to-date freight quotation for the following shipment:"
      : "We would like to submit a shipment reservation request for the following:",
    "",
    `Origin: ${origin}`,
    `Destination: ${destination}`,
    ...cargoLines,
    ...(flags.length ? ["", ...flags] : []),
    "",
    ask,
    "",
    "Kind regards,",
    signer + companyLine,
  ].join("\n");

  return {
    subject,
    body,
    generator: "deterministic_template",
    generatedAt: new Date().toISOString(),
  };
}

function prettyVesselType(value: string): string {
  try {
    return formatVesselType(value as Parameters<typeof formatVesselType>[0]);
  } catch {
    return value;
  }
}

/** Merge editable AI draft onto a request (status stays DRAFT until marked ready). */
export function attachAiDraft(
  request: CommercialRequest,
  draft: CommercialAiDraft,
): CommercialRequest {
  return {
    ...request,
    aiDraft: draft,
    updatedAt: new Date().toISOString(),
  };
}
