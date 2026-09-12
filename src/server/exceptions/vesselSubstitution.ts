import { getRepositories } from "@/server/commercial/repos";
import { applyExceptionDraft } from "@/server/exceptions/upsertException";
import { evaluateExceptionsForBooking } from "@/server/exceptions/evaluateExceptions";

/**
 * Detect vessel substitution phrases in broker/carrier email.
 * Never changes vessel association automatically.
 */
export function detectVesselSubstitutionPhrase(text: string): {
  previousName?: string;
  reportedName: string;
  evidenceText: string;
} | null {
  const patterns = [
    /changed\s+from\s+(MV\s+[\w-]+|[\w-]+)\s+to\s+(MV\s+[\w-]+|[\w-]+)/i,
    /vessel\s+nomination\s+has\s+changed\s+from\s+(MV\s+[\w-]+|[\w-]+)\s+to\s+(MV\s+[\w-]+|[\w-]+)/i,
    /nominated\s+vessel\s+(?:is\s+now|changed\s+to)\s+(MV\s+[\w-]+|[\w-]+)/i,
    /please\s+note\s+vessel\s+(?:is\s+now|changed\s+to)\s+(MV\s+[\w-]+|[\w-]+)/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (!m) continue;
    const start = Math.max(0, (m.index ?? 0) - 20);
    const end = Math.min(text.length, (m.index ?? 0) + m[0].length + 40);
    const evidenceText = text.slice(start, end).replace(/\s+/g, " ").trim();
    if (m[2]) {
      return {
        previousName: normalizeVessel(m[1]),
        reportedName: normalizeVessel(m[2]),
        evidenceText,
      };
    }
    return {
      reportedName: normalizeVessel(m[1]),
      evidenceText,
    };
  }
  return null;
}

function normalizeVessel(name: string): string {
  const t = name.trim().replace(/\s+/g, " ");
  if (/^MV\s+/i.test(t)) return t.replace(/^mv\s+/i, "MV ");
  return `MV ${t}`;
}

export async function createVesselSubstitutionException(input: {
  commercialRequestId: string;
  inboundMessageId: string;
  textBody: string;
}): Promise<boolean> {
  const detected = detectVesselSubstitutionPhrase(input.textBody);
  if (!detected) return false;

  const repos = getRepositories();
  const booking = await repos.bookings.getForRequest(input.commercialRequestId);
  if (!booking) return false;
  const execution = await repos.shipmentExecutions.getForBooking(booking.id);
  if (!execution || execution.status === "COMPLETED") return false;

  const current = execution.vesselName ?? "unassociated";
  const reported = detected.reportedName;
  if (
    current !== "unassociated" &&
    normalizeCompare(current) === normalizeCompare(reported)
  ) {
    return false;
  }

  await applyExceptionDraft({
    shipmentExecutionId: execution.id,
    bookingId: booking.id,
    commercialRequestId: input.commercialRequestId,
    draft: {
      type: "VESSEL_SUBSTITUTION",
      logicalKey: `${execution.id}:VESSEL_SUBSTITUTION:${normalizeCompare(reported)}`,
      severity: "HIGH",
      title: "Reported vessel nomination differs",
      explanation: `A broker/carrier update reports vessel ${reported}. Current association remains ${current}. Vessel association was not changed automatically.`,
      evidence: [
        { label: "Current vessel", value: current },
        { label: "Reported vessel", value: reported },
        {
          label: "Email excerpt",
          value: detected.evidenceText,
          reference: input.inboundMessageId,
        },
      ],
      source: "EMAIL",
      active: true,
    },
  });

  // Also re-evaluate AIS/dwell/conflict rules for this booking only
  await evaluateExceptionsForBooking(booking.id);
  return true;
}

function normalizeCompare(name: string): string {
  return name.replace(/^MV\s+/i, "").trim().toUpperCase();
}
