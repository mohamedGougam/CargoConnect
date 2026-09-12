import { NextResponse } from "next/server";
import { readSessionUser } from "@/server/commercial/auth";
import { computeDocumentCompleteness } from "@/server/documents/markReady";
import { generateDocumentRequirementsForBooking } from "@/server/documents/generateRequirements";
import { getRepositories } from "@/server/commercial/repos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/commercial/bookings/:id/documents */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await readSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const { id } = await context.params;
  const repos = getRepositories();
  const booking = await repos.bookings.get(id);
  if (!booking || booking.userId !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let requirements = await repos.documentRequirements.listForBooking(booking.id);
  if (!requirements.length) {
    const request = await repos.requests.get(booking.commercialRequestId);
    if (request) {
      requirements = await generateDocumentRequirementsForBooking({
        booking,
        request,
      });
    }
  }

  const documents = await repos.bookingDocuments.listForBooking(booking.id);
  const validations = await repos.documentValidations.listForBooking(booking.id);
  const completeness = await computeDocumentCompleteness(booking.id);
  const refreshed = (await repos.bookings.get(booking.id)) ?? booking;

  return NextResponse.json({
    booking: {
      id: refreshed.id,
      bookingReference: refreshed.bookingReference,
      status: refreshed.status,
      origin: refreshed.origin,
      destination: refreshed.destination,
      cargoSnapshot: refreshed.cargoSnapshot,
      commercialSnapshot: {
        rate: refreshed.commercialSnapshot.rate,
        currency: refreshed.commercialSnapshot.currency,
        rateUnit: refreshed.commercialSnapshot.rateUnit,
      },
      documentsReadyAt: refreshed.documentsReadyAt,
    },
    checklistNote:
      "CargoConnect document checklist — not a legally complete customs package.",
    malwareNote:
      process.env.MALWARE_SCAN_PROVIDER === "http" ||
      process.env.MALWARE_SCAN_PROVIDER === "clamav"
        ? "Uploads are scanned before readiness. Infected files are blocked."
        : process.env.MALWARE_SCAN_ALLOW_NOOP === "true"
          ? "Demo environment — malware scanning bypassed. Not real protection."
          : "Malware scanner: development noop (bypassed). Configure MALWARE_SCAN_PROVIDER=http for production.",
    requirements,
    documents,
    validations,
    completeness,
  });
}
