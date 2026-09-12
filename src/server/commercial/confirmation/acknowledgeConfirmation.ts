import type {
  Booking,
  CommercialConfirmation,
  CommercialRequest,
  CommercialRequestStatus,
  ProceedConfirmationStatus,
} from "@/domain/commercial/types";
import { classifyProceedReplyDetailed } from "@/server/commercial/proceed/classifyProceedReply";
import { compareConfirmationToSnapshot } from "@/server/commercial/confirmation/compareConfirmation";
import { extractConfirmationFields } from "@/server/commercial/confirmation/extractConfirmation";
import { getRepositories } from "@/server/commercial/repos";
import type { CommercialMessage } from "@/server/commercial/repos/types";
import { newId } from "@/server/commercial/repos/memory";

export async function processProceedConfirmationReply(input: {
  request: CommercialRequest;
  message: CommercialMessage;
  subject: string;
  textBody: string;
}): Promise<{
  confirmation: CommercialConfirmation;
  request: CommercialRequest;
}> {
  const repos = getRepositories();
  const now = new Date().toISOString();
  const proceed = await repos.proceedRequests.getLatestForRequest(
    input.request.id,
  );
  if (!proceed || (proceed.status !== "SENT" && proceed.status !== "DELIVERY_SIMULATED")) {
    throw new Error("No sent proceed request for confirmation processing");
  }

  const classified = classifyProceedReplyDetailed(input.textBody, input.subject);
  let classification = classified.classification;

  await repos.audits.append({
    id: newId("audit"),
    commercialRequestId: input.request.id,
    userId: input.request.userId,
    eventType: "PROCEED_CONFIRMATION_RECEIVED",
    metadata: { messageId: input.message.id, proceedId: proceed.id },
    createdAt: now,
  });

  const extracted = extractConfirmationFields({
    subject: input.subject,
    textBody: input.textBody,
    snapshot: proceed.snapshot,
  });

  const compare = compareConfirmationToSnapshot({
    snapshot: proceed.snapshot,
    extracted,
    requestOrigin: input.request.origin?.name,
    requestDestination: input.request.destination?.name,
    requestQuantityTons: input.request.cargo.weightTons,
  });

  // Material diffs override a naive "confirmed" classification
  if (
    classification === "PROCEED_CONFIRMED" &&
    compare.hasMaterialChange
  ) {
    classification = "TERMS_CHANGED";
    classified.reasons.push("Material differences vs proceed snapshot");
  }

  await repos.audits.append({
    id: newId("audit"),
    commercialRequestId: input.request.id,
    userId: input.request.userId,
    eventType: "PROCEED_CONFIRMATION_CLASSIFIED",
    metadata: {
      classification,
      reasons: classified.reasons.slice(0, 5),
      confidenceLabel: extracted.confidenceLabel,
    },
    createdAt: now,
  });

  await repos.audits.append({
    id: newId("audit"),
    commercialRequestId: input.request.id,
    userId: input.request.userId,
    eventType: "CONFIRMATION_TERMS_COMPARED",
    metadata: {
      termsChanged: compare.termsChanged,
      diffCount: compare.diffs.length,
      material: compare.hasMaterialChange,
    },
    createdAt: now,
  });

  // Supersede prior pending confirmations
  const prior = await repos.confirmations.listForRequest(input.request.id);
  for (const c of prior) {
    if (c.reviewStatus === "PENDING_REVIEW") {
      await repos.confirmations.update({
        ...c,
        reviewStatus: "SUPERSEDED",
        updatedAt: now,
      });
    }
  }

  const fromEmail =
    input.message.fromAddress.match(/<([^>]+)>/)?.[1] ??
    input.message.fromAddress;

  const confirmation: CommercialConfirmation = {
    id: newId("conf"),
    commercialRequestId: input.request.id,
    proceedRequestId: proceed.id,
    inboundMessageId: input.message.id,
    userId: input.request.userId,
    classification,
    reviewStatus: "PENDING_REVIEW",
    confirmedByOrganization:
      proceed.recipientOrganization ||
      input.message.fromName ||
      proceed.snapshot.organization,
    confirmedByEmail: fromEmail?.trim().toLowerCase() ?? null,
    senderTrust: input.message.senderTrust ?? null,
    bookingReference: extracted.bookingReference,
    carrierReference: extracted.carrierReference,
    brokerReference: extracted.brokerReference,
    vesselName: extracted.vesselName,
    vesselImo: extracted.vesselImo,
    vesselMmsi: extracted.vesselMmsi,
    confirmedRate: extracted.confirmedRate,
    currency: extracted.currency,
    rateUnit: extracted.rateUnit,
    confirmedFreightAmount: extracted.confirmedFreightAmount,
    laycanStart: extracted.laycanStart,
    laycanEnd: extracted.laycanEnd,
    departureDate: extracted.departureText,
    departureText: extracted.departureText,
    origin: extracted.origin,
    destination: extracted.destination,
    cargoDescription: extracted.cargoDescription,
    cargoQuantity: extracted.cargoQuantity,
    includedCharges: extracted.includedCharges,
    excludedCharges: extracted.excludedCharges,
    paymentTerms: extracted.paymentTerms,
    requiredDocuments: extracted.requiredDocuments,
    nextSteps: extracted.nextSteps,
    termsChanged: compare.termsChanged || classification === "TERMS_CHANGED",
    diffs: compare.diffs,
    extractionConfidence: extracted.extractionConfidence,
    confidenceLabel: extracted.confidenceLabel,
    classificationReasons: classified.reasons,
    createdAt: now,
    updatedAt: now,
    reviewedAt: null,
  };

  await repos.confirmations.create(confirmation);

  const nextStatus = mapRequestStatus(classification);
  const updatedRequest: CommercialRequest = {
    ...input.request,
    status: nextStatus,
    confirmationStatus: classification,
    activeConfirmationId: confirmation.id,
    updatedAt: now,
  };
  await repos.requests.save(updatedRequest);

  if (classification === "PROCEED_REJECTED") {
    await repos.audits.append({
      id: newId("audit"),
      commercialRequestId: input.request.id,
      userId: input.request.userId,
      eventType: "PROCEED_REJECTED",
      metadata: { confirmationId: confirmation.id },
      createdAt: now,
    });
  } else if (classification === "MORE_INFORMATION_REQUIRED") {
    await repos.audits.append({
      id: newId("audit"),
      commercialRequestId: input.request.id,
      userId: input.request.userId,
      eventType: "PROCEED_MORE_INFO_REQUIRED",
      metadata: { confirmationId: confirmation.id },
      createdAt: now,
    });
  } else if (classification === "TERMS_CHANGED") {
    await repos.audits.append({
      id: newId("audit"),
      commercialRequestId: input.request.id,
      userId: input.request.userId,
      eventType: "PROCEED_TERMS_CHANGED",
      metadata: { confirmationId: confirmation.id, diffs: compare.diffs.length },
      createdAt: now,
    });
  }

  return { confirmation, request: updatedRequest };
}

function mapRequestStatus(
  classification: ProceedConfirmationStatus,
): CommercialRequestStatus {
  switch (classification) {
    case "PROCEED_CONFIRMED":
      return "CONFIRMATION_REVIEW_REQUIRED";
    case "TERMS_CHANGED":
      return "TERMS_CHANGED";
    case "PROCEED_REJECTED":
      return "CONFIRMATION_REJECTED";
    case "MORE_INFORMATION_REQUIRED":
      return "MORE_INFORMATION_REQUIRED";
    default:
      return "CONFIRMATION_RECEIVED";
  }
}

export async function generateBookingReference(): Promise<string> {
  const repos = getRepositories();
  const year = new Date().getFullYear();
  for (let attempt = 0; attempt < 5; attempt++) {
    const count = await repos.bookings.countForYear(year);
    const seq = String(count + 1 + attempt).padStart(6, "0");
    const ref = `CC-${year}-${seq}`;
    const existing = await repos.bookings.getByReference(ref);
    if (!existing) return ref;
  }
  return `CC-${year}-${Date.now().toString().slice(-6)}`;
}

export type AcknowledgeResult =
  | { ok: true; request: CommercialRequest; booking: Booking; alreadyConfirmed?: boolean }
  | { ok: false; error: string; code: string; request?: CommercialRequest; booking?: Booking };

/**
 * Explicit user acknowledgement of a clean confirmation → COMMERCIALLY_CONFIRMED + Booking.
 * Never auto-called from classification.
 */
export async function acknowledgeCommercialConfirmation(input: {
  requestId: string;
  confirmationId: string;
  userId: string;
}): Promise<AcknowledgeResult> {
  const repos = getRepositories();
  const request = await repos.requests.get(input.requestId);
  if (!request || request.userId !== input.userId) {
    return { ok: false, error: "Request not found", code: "not_found" };
  }

  const existingBooking = await repos.bookings.getForRequest(request.id);
  if (existingBooking) {
    return {
      ok: true,
      request,
      booking: existingBooking,
      alreadyConfirmed: true,
    };
  }
  if (request.status === "COMMERCIALLY_CONFIRMED") {
    return {
      ok: false,
      error: "Request marked confirmed but booking missing",
      code: "booking_missing",
      request,
    };
  }

  const confirmation = await repos.confirmations.get(input.confirmationId);
  if (
    !confirmation ||
    confirmation.commercialRequestId !== request.id ||
    confirmation.userId !== input.userId
  ) {
    return { ok: false, error: "Confirmation not found", code: "not_found" };
  }

  if (confirmation.classification !== "PROCEED_CONFIRMED" || confirmation.termsChanged) {
    return {
      ok: false,
      error:
        "Changed or non-clean confirmation cannot create a booking without a separate changed-terms approval flow",
      code: "terms_changed",
      request,
    };
  }

  if (confirmation.reviewStatus === "ACKNOWLEDGED") {
    const booking = await repos.bookings.getForRequest(request.id);
    if (booking) {
      return { ok: true, request, booking, alreadyConfirmed: true };
    }
  }

  const claimed = await repos.confirmations.claimForAcknowledge(
    confirmation.id,
    input.userId,
  );
  if (!claimed) {
    const latest = await repos.confirmations.get(confirmation.id);
    const booking = await repos.bookings.getForRequest(request.id);
    if (booking) {
      return { ok: true, request, booking, alreadyConfirmed: true };
    }
    if (latest?.termsChanged || latest?.classification !== "PROCEED_CONFIRMED") {
      return {
        ok: false,
        error: "Confirmation is not eligible for commercial agreement",
        code: "terms_changed",
        request,
      };
    }
    return {
      ok: false,
      error: "Could not claim confirmation for acknowledgement",
      code: "claim_failed",
      request,
    };
  }

  const proceed = await repos.proceedRequests.get(claimed.proceedRequestId);
  if (!proceed) {
    return { ok: false, error: "Proceed request missing", code: "not_found" };
  }

  const now = new Date().toISOString();
  const bookingReference = await generateBookingReference();
  const booking: Booking = {
    id: newId("book"),
    bookingReference,
    commercialRequestId: request.id,
    selectedQuoteId: proceed.commercialQuoteId,
    proceedRequestId: proceed.id,
    confirmationId: claimed.id,
    userId: input.userId,
    status: "COMMERCIALLY_CONFIRMED",
    origin: request.origin?.name ?? claimed.origin ?? null,
    destination: request.destination?.name ?? claimed.destination ?? null,
    cargoSnapshot: { ...request.cargo },
    commercialSnapshot: { ...proceed.snapshot },
    confirmationSnapshot: { ...claimed },
    vesselSnapshot: claimed.vesselName
      ? {
          vesselName: claimed.vesselName,
          vesselImo: claimed.vesselImo,
          vesselMmsi: claimed.vesselMmsi,
        }
      : null,
    externalBookingReference: claimed.bookingReference ?? null,
    brokerReference: claimed.brokerReference ?? null,
    carrierReference: claimed.carrierReference ?? null,
    brokerOrganization: claimed.confirmedByOrganization ?? null,
    createdAt: now,
    confirmedAt: now,
    updatedAt: now,
  };

  try {
    await repos.bookings.create(booking);
  } catch {
    const raced = await repos.bookings.getForRequest(request.id);
    if (raced) {
      return { ok: true, request, booking: raced, alreadyConfirmed: true };
    }
    return {
      ok: false,
      error: "Could not create booking",
      code: "booking_create_failed",
      request,
    };
  }

  const updatedRequest: CommercialRequest = {
    ...request,
    status: "COMMERCIALLY_CONFIRMED",
    confirmationStatus: "PROCEED_CONFIRMED",
    activeConfirmationId: claimed.id,
    bookingId: booking.id,
    updatedAt: now,
  };
  await repos.requests.save(updatedRequest);

  await repos.audits.append({
    id: newId("audit"),
    commercialRequestId: request.id,
    userId: input.userId,
    eventType: "CONFIRMATION_REVIEWED",
    metadata: { confirmationId: claimed.id },
    createdAt: now,
  });
  await repos.audits.append({
    id: newId("audit"),
    commercialRequestId: request.id,
    userId: input.userId,
    eventType: "COMMERCIAL_AGREEMENT_CONFIRMED",
    metadata: { confirmationId: claimed.id, bookingId: booking.id },
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
    },
    createdAt: now,
  });

  const { generateDocumentRequirementsForBooking } = await import(
    "@/server/documents/generateRequirements"
  );
  await generateDocumentRequirementsForBooking({
    booking,
    request: updatedRequest,
  });
  const refreshed = (await repos.bookings.get(booking.id)) ?? {
    ...booking,
    status: "DOCUMENTS_PENDING" as const,
  };

  return { ok: true, request: updatedRequest, booking: refreshed };
}
