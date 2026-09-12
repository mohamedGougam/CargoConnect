import type {
  AcceptedCommercialSnapshot,
  Booking,
  CommercialRequest,
  ProceedSnapshot,
} from "@/domain/commercial/types";
import { generateBookingReference } from "@/server/commercial/confirmation/acknowledgeConfirmation";
import { generateDocumentRequirementsForBooking } from "@/server/documents/generateRequirements";
import { getRepositories } from "@/server/commercial/repos";
import { newId } from "@/server/commercial/repos/memory";

export type AcceptChangedTermsResult =
  | {
      ok: true;
      request: CommercialRequest;
      booking: Booking;
      acceptedSnapshot: AcceptedCommercialSnapshot;
      alreadyAccepted?: boolean;
    }
  | { ok: false; error: string; code: string; request?: CommercialRequest };

/**
 * Explicit user acceptance of broker-changed commercial terms.
 * Creates immutable AcceptedCommercialSnapshot + Booking. Never auto-called.
 */
export async function acceptChangedCommercialTerms(input: {
  requestId: string;
  confirmationId: string;
  userId: string;
}): Promise<AcceptChangedTermsResult> {
  const repos = getRepositories();
  const request = await repos.requests.get(input.requestId);
  if (!request || request.userId !== input.userId) {
    return { ok: false, error: "Request not found", code: "not_found" };
  }

  const existingBooking = await repos.bookings.getForRequest(request.id);
  if (existingBooking) {
    const snap = existingBooking.acceptedCommercialSnapshotId
      ? await repos.acceptedSnapshots.get(
          existingBooking.acceptedCommercialSnapshotId,
        )
      : await repos.acceptedSnapshots.getForConfirmation(input.confirmationId);
    if (snap) {
      return {
        ok: true,
        request,
        booking: existingBooking,
        acceptedSnapshot: snap,
        alreadyAccepted: true,
      };
    }
  }

  const confirmation = await repos.confirmations.get(input.confirmationId);
  if (
    !confirmation ||
    confirmation.commercialRequestId !== request.id ||
    confirmation.userId !== input.userId
  ) {
    return { ok: false, error: "Confirmation not found", code: "not_found" };
  }

  if (
    confirmation.classification !== "TERMS_CHANGED" &&
    !confirmation.termsChanged
  ) {
    return {
      ok: false,
      error: "Confirmation does not contain changed terms",
      code: "invalid_status",
      request,
    };
  }

  const priorAccepted = await repos.acceptedSnapshots.getForConfirmation(
    confirmation.id,
  );
  if (priorAccepted?.bookingId) {
    const booking = await repos.bookings.get(priorAccepted.bookingId);
    if (booking) {
      return {
        ok: true,
        request,
        booking,
        acceptedSnapshot: priorAccepted,
        alreadyAccepted: true,
      };
    }
  }

  const proceed = await repos.proceedRequests.get(confirmation.proceedRequestId);
  if (!proceed) {
    return { ok: false, error: "Proceed request missing", code: "not_found" };
  }

  // Freeze original proceed snapshot unchanged; build revised accepted terms
  const previous = { ...proceed.snapshot };
  const acceptedTerms = buildAcceptedTermsFromConfirmation(
    previous,
    confirmation,
  );

  const now = new Date().toISOString();
  const acceptedSnapshot: AcceptedCommercialSnapshot = {
    id: newId("asnap"),
    commercialRequestId: request.id,
    confirmationId: confirmation.id,
    proceedRequestId: proceed.id,
    previousProceedSnapshot: previous,
    acceptedTerms,
    diffsAccepted: [...confirmation.diffs],
    acceptedByUserId: input.userId,
    acceptedAt: now,
    bookingId: null,
  };
  await repos.acceptedSnapshots.create(acceptedSnapshot);

  await repos.confirmations.update({
    ...confirmation,
    reviewStatus: "ACKNOWLEDGED",
    reviewedAt: now,
    updatedAt: now,
  });

  const bookingReference = await generateBookingReference();
  const booking: Booking = {
    id: newId("book"),
    bookingReference,
    commercialRequestId: request.id,
    selectedQuoteId: proceed.commercialQuoteId,
    proceedRequestId: proceed.id,
    confirmationId: confirmation.id,
    userId: input.userId,
    status: "COMMERCIALLY_CONFIRMED",
    origin: request.origin?.name ?? confirmation.origin ?? null,
    destination: request.destination?.name ?? confirmation.destination ?? null,
    cargoSnapshot: { ...request.cargo },
    commercialSnapshot: { ...acceptedTerms },
    confirmationSnapshot: { ...confirmation },
    acceptedCommercialSnapshotId: acceptedSnapshot.id,
    vesselSnapshot: confirmation.vesselName
      ? {
          vesselName: confirmation.vesselName,
          vesselImo: confirmation.vesselImo,
          vesselMmsi: confirmation.vesselMmsi,
        }
      : null,
    externalBookingReference: confirmation.bookingReference ?? null,
    brokerReference: confirmation.brokerReference ?? null,
    carrierReference: confirmation.carrierReference ?? null,
    brokerOrganization: confirmation.confirmedByOrganization ?? null,
    createdAt: now,
    confirmedAt: now,
    updatedAt: now,
  };

  try {
    await repos.bookings.create(booking);
  } catch {
    const raced = await repos.bookings.getForRequest(request.id);
    if (raced) {
      return {
        ok: true,
        request,
        booking: raced,
        acceptedSnapshot,
        alreadyAccepted: true,
      };
    }
    return {
      ok: false,
      error: "Could not create booking",
      code: "booking_create_failed",
      request,
    };
  }

  const linked: AcceptedCommercialSnapshot = {
    ...acceptedSnapshot,
    bookingId: booking.id,
  };
  // payload update via recreate pattern — store bookingId on memory/pg via create already done;
  // update by re-insert is not available; patch through acceptedSnapshots.create overwrite not supported.
  // For memory, mutate; for postgres we update payload via a second create not possible.
  // Use bookings link only; acceptedSnapshot.bookingId set in response object.
  void linked;

  const updatedRequest: CommercialRequest = {
    ...request,
    status: "COMMERCIALLY_CONFIRMED",
    confirmationStatus: "TERMS_CHANGED",
    activeConfirmationId: confirmation.id,
    bookingId: booking.id,
    updatedAt: now,
  };
  await repos.requests.save(updatedRequest);

  await repos.audits.append({
    id: newId("audit"),
    commercialRequestId: request.id,
    userId: input.userId,
    eventType: "CHANGED_TERMS_ACCEPTED",
    metadata: {
      confirmationId: confirmation.id,
      acceptedSnapshotId: acceptedSnapshot.id,
      bookingId: booking.id,
      diffCount: confirmation.diffs.length,
    },
    createdAt: now,
  });
  await repos.audits.append({
    id: newId("audit"),
    commercialRequestId: request.id,
    userId: input.userId,
    eventType: "COMMERCIAL_AGREEMENT_CONFIRMED",
    metadata: {
      confirmationId: confirmation.id,
      bookingId: booking.id,
      via: "changed_terms",
    },
    createdAt: now,
  });
  await repos.audits.append({
    id: newId("audit"),
    commercialRequestId: request.id,
    userId: input.userId,
    eventType: "BOOKING_CREATED",
    metadata: {
      bookingId: booking.id,
      bookingReference: booking.bookingReference,
      via: "changed_terms",
    },
    createdAt: now,
  });

  await generateDocumentRequirementsForBooking({
    booking,
    request: updatedRequest,
  });
  const refreshed = (await repos.bookings.get(booking.id)) ?? booking;

  return {
    ok: true,
    request: updatedRequest,
    booking: refreshed,
    acceptedSnapshot: { ...acceptedSnapshot, bookingId: booking.id },
  };
}

function buildAcceptedTermsFromConfirmation(
  previous: ProceedSnapshot,
  confirmation: {
    confirmedRate?: number | null;
    currency?: string | null;
    rateUnit?: string | null;
    confirmedFreightAmount?: number | null;
    departureText?: string | null;
    vesselName?: string | null;
    paymentTerms?: string | null;
    excludedCharges?: string[];
    includedCharges?: string[];
    confirmedByOrganization?: string | null;
  },
): ProceedSnapshot {
  return {
    ...previous,
    organization:
      confirmation.confirmedByOrganization ?? previous.organization,
    rate: confirmation.confirmedRate ?? previous.rate,
    currency: confirmation.currency ?? previous.currency,
    rateUnit: confirmation.rateUnit ?? previous.rateUnit,
    estimatedFreight:
      confirmation.confirmedFreightAmount ?? previous.estimatedFreight,
    departure: confirmation.departureText ?? previous.departure,
    vesselName: confirmation.vesselName ?? previous.vesselName,
    paymentTerms: confirmation.paymentTerms ?? previous.paymentTerms,
    excludedCharges:
      confirmation.excludedCharges?.[0] ?? previous.excludedCharges,
    includedCharges:
      confirmation.includedCharges?.[0] ?? previous.includedCharges,
    capturedAt: new Date().toISOString(),
  };
}
