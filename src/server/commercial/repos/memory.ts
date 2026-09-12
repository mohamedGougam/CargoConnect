import { randomBytes } from "crypto";
import type {
  AcceptedCommercialSnapshot,
  Booking,
  BookingDocument,
  BookingDocumentRequirement,
  CommercialConfirmation,
  CommercialContact,
  CommercialProceedRequest,
  CommercialQuote,
  CommercialRequest,
  DocumentValidationResult,
  OperationalHandoff,
  PendingCommercialIntent,
  SelectedCommercialQuote,
  ShipmentExecution,
  ShipmentMilestone,
  ShipmentMilestoneCandidate,
  ShipmentObservation,
  ShipmentVesselAssociation,
  OperationalException,
  ClaimPreparation,
  ClaimEvidenceItem,
} from "@/domain/commercial/types";
import type {
  AuditEvent,
  CommercialMessage,
  CommercialMessageAttachment,
  CommercialRepositories,
  EmailVerificationTokenRecord,
  StoredUser,
} from "./types";
import { COMMERCIAL_CONTACTS } from "@/data/commercial/contacts";

interface MemoryShape {
  users: StoredUser[];
  verificationTokens: EmailVerificationTokenRecord[];
  intents: PendingCommercialIntent[];
  requests: CommercialRequest[];
  contacts: CommercialContact[];
  messages: CommercialMessage[];
  attachments: CommercialMessageAttachment[];
  quotes: CommercialQuote[];
  selections: SelectedCommercialQuote[];
  proceedRequests: CommercialProceedRequest[];
  confirmations: CommercialConfirmation[];
  bookings: Booking[];
  acceptedSnapshots: AcceptedCommercialSnapshot[];
  documentRequirements: BookingDocumentRequirement[];
  bookingDocuments: BookingDocument[];
  documentValidations: DocumentValidationResult[];
  handoffs: OperationalHandoff[];
  shipmentExecutions: ShipmentExecution[];
  shipmentMilestones: ShipmentMilestone[];
  shipmentVesselAssociations: ShipmentVesselAssociation[];
  shipmentObservations: ShipmentObservation[];
  shipmentMilestoneCandidates: ShipmentMilestoneCandidate[];
  operationalExceptions: OperationalException[];
  claimPreparations: ClaimPreparation[];
  claimEvidenceItems: ClaimEvidenceItem[];
  audits: AuditEvent[];
}

const memory: MemoryShape = {
  users: [],
  verificationTokens: [],
  intents: [],
  requests: [],
  contacts: [...COMMERCIAL_CONTACTS],
  messages: [],
  attachments: [],
  quotes: [],
  selections: [],
  proceedRequests: [],
  confirmations: [],
  bookings: [],
  acceptedSnapshots: [],
  documentRequirements: [],
  bookingDocuments: [],
  documentValidations: [],
  handoffs: [],
  shipmentExecutions: [],
  shipmentMilestones: [],
  shipmentVesselAssociations: [],
  shipmentObservations: [],
  shipmentMilestoneCandidates: [],
  operationalExceptions: [],
  claimPreparations: [],
  claimEvidenceItems: [],
  audits: [],
};

export function createMemoryRepositories(): CommercialRepositories {
  return {
    users: {
      async findByEmail(email) {
        const normalized = email.trim().toLowerCase();
        return memory.users.find((u) => u.email === normalized);
      },
      async findById(id) {
        return memory.users.find((u) => u.id === id);
      },
      async create(user) {
        memory.users.push({
          ...user,
          emailVerifiedAt: user.emailVerifiedAt ?? null,
        });
        return user;
      },
      async markEmailVerified(userId, verifiedAt) {
        const user = memory.users.find((u) => u.id === userId);
        if (!user) return undefined;
        user.emailVerifiedAt = verifiedAt;
        user.updatedAt = verifiedAt;
        return { ...user };
      },
    },
    verificationTokens: {
      async create(token) {
        memory.verificationTokens.push(token);
      },
      async findValidByHash(tokenHash) {
        const now = Date.now();
        return memory.verificationTokens.find(
          (t) =>
            t.tokenHash === tokenHash &&
            !t.usedAt &&
            new Date(t.expiresAt).getTime() > now,
        );
      },
      async markUsed(id, usedAt) {
        const token = memory.verificationTokens.find((t) => t.id === id);
        if (token) token.usedAt = usedAt;
      },
      async invalidateActiveForUser(userId) {
        const now = new Date().toISOString();
        for (const t of memory.verificationTokens) {
          if (t.userId === userId && !t.usedAt) t.usedAt = now;
        }
      },
      async countRecentForUser(userId, sinceIso) {
        const since = new Date(sinceIso).getTime();
        return memory.verificationTokens.filter(
          (t) => t.userId === userId && new Date(t.createdAt).getTime() >= since,
        ).length;
      },
    },
    intents: {
      async save(intent) {
        memory.intents = memory.intents.filter((i) => i.id !== intent.id);
        memory.intents.push(intent);
        if (memory.intents.length > 200) memory.intents = memory.intents.slice(-200);
      },
      async get(id) {
        return memory.intents.find((i) => i.id === id);
      },
      async delete(id) {
        memory.intents = memory.intents.filter((i) => i.id !== id);
      },
    },
    requests: {
      async save(request) {
        const idx = memory.requests.findIndex((r) => r.id === request.id);
        if (idx >= 0) memory.requests[idx] = request;
        else memory.requests.push(request);
        return request;
      },
      async get(id) {
        return memory.requests.find((r) => r.id === id);
      },
      async listForUser(userId) {
        return memory.requests
          .filter((r) => r.userId === userId)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      },
      async findByReplyToken(token) {
        const normalized = token.trim();
        return memory.requests.find((r) => r.replyToken === normalized);
      },
      async claimForSend(id, userId) {
        const req = memory.requests.find((r) => r.id === id);
        if (!req || req.userId !== userId) return null;
        if (req.status !== "READY_TO_SEND" && req.status !== "SEND_FAILED") {
          return null;
        }
        req.status = "SENDING";
        req.updatedAt = new Date().toISOString();
        return { ...req };
      },
    },
    contacts: {
      async listAll() {
        return [...memory.contacts];
      },
      async getById(id) {
        return memory.contacts.find((c) => c.id === id);
      },
      async listForPort(portId) {
        return memory.contacts.filter((c) => c.portId === portId);
      },
      async upsertMany(contacts) {
        for (const c of contacts) {
          const idx = memory.contacts.findIndex((x) => x.id === c.id);
          if (idx >= 0) memory.contacts[idx] = c;
          else memory.contacts.push(c);
        }
      },
    },
    messages: {
      async create(message) {
        memory.messages.push(message);
        return message;
      },
      async get(id) {
        return memory.messages.find((m) => m.id === id);
      },
      async listForRequest(requestId) {
        return memory.messages
          .filter((m) => m.commercialRequestId === requestId)
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      },
      async findByProviderMessageId(provider, providerMessageId) {
        return memory.messages.find(
          (m) =>
            m.provider === provider && m.providerMessageId === providerMessageId,
        );
      },
      async findByInternetMessageId(internetMessageId) {
        const needle = internetMessageId.trim().toLowerCase();
        return memory.messages.find(
          (m) => m.internetMessageId?.trim().toLowerCase() === needle,
        );
      },
      async countSuccessfulOutbound(requestId) {
        return memory.messages.filter(
          (m) =>
            m.commercialRequestId === requestId &&
            m.direction === "OUTBOUND" &&
            (m.deliveryStatus === "SENT" || m.deliveryStatus === "SIMULATED"),
        ).length;
      },
    },
    attachments: {
      async createMany(attachments) {
        memory.attachments.push(...attachments);
      },
      async listForMessage(messageId) {
        return memory.attachments.filter(
          (a) => a.commercialMessageId === messageId,
        );
      },
      async listForRequest(requestId) {
        const messageIds = new Set(
          memory.messages
            .filter((m) => m.commercialRequestId === requestId)
            .map((m) => m.id),
        );
        return memory.attachments.filter((a) =>
          messageIds.has(a.commercialMessageId),
        );
      },
    },
    quotes: {
      async create(quote) {
        memory.quotes.push(quote);
        return quote;
      },
      async get(id) {
        return memory.quotes.find((q) => q.id === id);
      },
      async update(quote) {
        const idx = memory.quotes.findIndex((q) => q.id === quote.id);
        if (idx >= 0) memory.quotes[idx] = quote;
        else memory.quotes.push(quote);
        return quote;
      },
      async listForRequest(requestId) {
        return memory.quotes
          .filter((q) => q.commercialRequestId === requestId)
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      },
    },
    selections: {
      async create(selection) {
        memory.selections.push(selection);
        return selection;
      },
      async update(selection) {
        const idx = memory.selections.findIndex((s) => s.id === selection.id);
        if (idx >= 0) memory.selections[idx] = selection;
        else memory.selections.push(selection);
        return selection;
      },
      async get(id) {
        return memory.selections.find((s) => s.id === id);
      },
      async getActiveForRequest(requestId) {
        return memory.selections.find(
          (s) => s.commercialRequestId === requestId && s.active,
        );
      },
      async listForRequest(requestId) {
        return memory.selections
          .filter((s) => s.commercialRequestId === requestId)
          .sort((a, b) => a.selectedAt.localeCompare(b.selectedAt));
      },
      async deactivateAllForRequest(requestId) {
        for (const s of memory.selections) {
          if (s.commercialRequestId === requestId && s.active) {
            s.active = false;
          }
        }
      },
    },
    proceedRequests: {
      async create(proceed) {
        memory.proceedRequests.push(proceed);
        return proceed;
      },
      async update(proceed) {
        const idx = memory.proceedRequests.findIndex((p) => p.id === proceed.id);
        if (idx >= 0) memory.proceedRequests[idx] = proceed;
        else memory.proceedRequests.push(proceed);
        return proceed;
      },
      async get(id) {
        return memory.proceedRequests.find((p) => p.id === id);
      },
      async getLatestForRequest(requestId) {
        return memory.proceedRequests
          .filter((p) => p.commercialRequestId === requestId)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
      },
      async claimForSend(id, userId) {
        const p = memory.proceedRequests.find((x) => x.id === id);
        if (!p || p.userId !== userId) return null;
        if (p.status !== "READY_TO_SEND" && p.status !== "SEND_FAILED") return null;
        p.status = "SENDING";
        p.updatedAt = new Date().toISOString();
        return { ...p };
      },
    },
    confirmations: {
      async create(confirmation) {
        memory.confirmations.push(confirmation);
        return confirmation;
      },
      async update(confirmation) {
        const idx = memory.confirmations.findIndex((c) => c.id === confirmation.id);
        if (idx >= 0) memory.confirmations[idx] = confirmation;
        else memory.confirmations.push(confirmation);
        return confirmation;
      },
      async get(id) {
        return memory.confirmations.find((c) => c.id === id);
      },
      async getLatestForRequest(requestId) {
        return memory.confirmations
          .filter((c) => c.commercialRequestId === requestId)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
      },
      async listForRequest(requestId) {
        return memory.confirmations
          .filter((c) => c.commercialRequestId === requestId)
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      },
      async claimForAcknowledge(id, userId) {
        const c = memory.confirmations.find((x) => x.id === id);
        if (!c || c.userId !== userId) return null;
        if (c.reviewStatus !== "PENDING_REVIEW") return null;
        if (
          c.classification !== "PROCEED_CONFIRMED" ||
          c.termsChanged
        ) {
          return null;
        }
        c.reviewStatus = "ACKNOWLEDGED";
        c.reviewedAt = new Date().toISOString();
        c.updatedAt = c.reviewedAt;
        return { ...c };
      },
    },
    bookings: {
      async create(booking) {
        if (memory.bookings.some((b) => b.commercialRequestId === booking.commercialRequestId)) {
          throw new Error("booking_already_exists");
        }
        if (memory.bookings.some((b) => b.bookingReference === booking.bookingReference)) {
          throw new Error("booking_reference_conflict");
        }
        memory.bookings.push(booking);
        return booking;
      },
      async update(booking) {
        const idx = memory.bookings.findIndex((b) => b.id === booking.id);
        if (idx >= 0) memory.bookings[idx] = booking;
        else memory.bookings.push(booking);
        return booking;
      },
      async get(id) {
        return memory.bookings.find((b) => b.id === id);
      },
      async getByReference(reference) {
        return memory.bookings.find((b) => b.bookingReference === reference);
      },
      async getForRequest(requestId) {
        return memory.bookings.find((b) => b.commercialRequestId === requestId);
      },
      async listForUser(userId) {
        return memory.bookings
          .filter((b) => b.userId === userId)
          .sort((a, b) => b.confirmedAt.localeCompare(a.confirmedAt));
      },
      async countForYear(year) {
        const prefix = `CC-${year}-`;
        return memory.bookings.filter((b) =>
          b.bookingReference.startsWith(prefix),
        ).length;
      },
    },
    acceptedSnapshots: {
      async create(snapshot) {
        memory.acceptedSnapshots.push(snapshot);
        return snapshot;
      },
      async get(id) {
        return memory.acceptedSnapshots.find((s) => s.id === id);
      },
      async getForConfirmation(confirmationId) {
        return memory.acceptedSnapshots.find(
          (s) => s.confirmationId === confirmationId,
        );
      },
    },
    documentRequirements: {
      async createMany(requirements) {
        memory.documentRequirements.push(...requirements);
        return requirements;
      },
      async update(requirement) {
        const idx = memory.documentRequirements.findIndex(
          (r) => r.id === requirement.id,
        );
        if (idx >= 0) memory.documentRequirements[idx] = requirement;
        else memory.documentRequirements.push(requirement);
        return requirement;
      },
      async get(id) {
        return memory.documentRequirements.find((r) => r.id === id);
      },
      async listForBooking(bookingId) {
        return memory.documentRequirements.filter((r) => r.bookingId === bookingId);
      },
    },
    bookingDocuments: {
      async create(doc) {
        memory.bookingDocuments.push(doc);
        return doc;
      },
      async update(doc) {
        const idx = memory.bookingDocuments.findIndex((d) => d.id === doc.id);
        if (idx >= 0) memory.bookingDocuments[idx] = doc;
        else memory.bookingDocuments.push(doc);
        return doc;
      },
      async get(id) {
        return memory.bookingDocuments.find((d) => d.id === id);
      },
      async listForBooking(bookingId) {
        return memory.bookingDocuments
          .filter((d) => d.bookingId === bookingId)
          .sort((a, b) => a.uploadedAt.localeCompare(b.uploadedAt));
      },
      async listCurrentForBooking(bookingId) {
        return memory.bookingDocuments.filter(
          (d) => d.bookingId === bookingId && d.isCurrent,
        );
      },
    },
    documentValidations: {
      async create(result) {
        memory.documentValidations.push(result);
        return result;
      },
      async getLatestForDocument(documentId) {
        return memory.documentValidations
          .filter((v) => v.documentId === documentId)
          .sort((a, b) => b.validatedAt.localeCompare(a.validatedAt))[0];
      },
      async listForBooking(bookingId) {
        return memory.documentValidations.filter((v) => v.bookingId === bookingId);
      },
    },
    handoffs: {
      async create(handoff) {
        memory.handoffs.push(handoff);
        return handoff;
      },
      async update(handoff) {
        const idx = memory.handoffs.findIndex((h) => h.id === handoff.id);
        if (idx >= 0) memory.handoffs[idx] = handoff;
        else memory.handoffs.push(handoff);
        return handoff;
      },
      async get(id) {
        return memory.handoffs.find((h) => h.id === id);
      },
      async getByReference(reference) {
        return memory.handoffs.find((h) => h.handoffReference === reference);
      },
      async listForBooking(bookingId) {
        return memory.handoffs
          .filter((h) => h.bookingId === bookingId)
          .sort((a, b) => b.version - a.version);
      },
      async getLatestForBooking(bookingId) {
        const list = memory.handoffs
          .filter((h) => h.bookingId === bookingId)
          .sort((a, b) => b.version - a.version);
        return list[0];
      },
    },
    shipmentExecutions: {
      async create(execution) {
        memory.shipmentExecutions.push(execution);
        return execution;
      },
      async update(execution) {
        const idx = memory.shipmentExecutions.findIndex(
          (e) => e.id === execution.id,
        );
        if (idx >= 0) memory.shipmentExecutions[idx] = execution;
        else memory.shipmentExecutions.push(execution);
        return execution;
      },
      async get(id) {
        return memory.shipmentExecutions.find((e) => e.id === id);
      },
      async getForBooking(bookingId) {
        return memory.shipmentExecutions.find((e) => e.bookingId === bookingId);
      },
      async listForUser(userId) {
        return memory.shipmentExecutions
          .filter((e) => e.userId === userId)
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      },
      async listActiveForWatcher() {
        return memory.shipmentExecutions.filter(
          (e) => e.status !== "COMPLETED" && Boolean(e.vesselMmsi || e.vesselImo),
        );
      },
    },
    shipmentMilestones: {
      async create(milestone) {
        memory.shipmentMilestones.push(milestone);
        return milestone;
      },
      async update(milestone) {
        const idx = memory.shipmentMilestones.findIndex(
          (m) => m.id === milestone.id,
        );
        if (idx >= 0) memory.shipmentMilestones[idx] = milestone;
        else memory.shipmentMilestones.push(milestone);
        return milestone;
      },
      async get(id) {
        return memory.shipmentMilestones.find((m) => m.id === id);
      },
      async listForExecution(executionId) {
        return memory.shipmentMilestones
          .filter((m) => m.shipmentExecutionId === executionId)
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      },
      async getLatestConfirmed(executionId, type) {
        return memory.shipmentMilestones
          .filter(
            (m) =>
              m.shipmentExecutionId === executionId &&
              m.type === type &&
              m.status === "CONFIRMED",
          )
          .sort((a, b) =>
            (b.occurredAt ?? b.createdAt).localeCompare(
              a.occurredAt ?? a.createdAt,
            ),
          )[0];
      },
    },
    shipmentVesselAssociations: {
      async create(association) {
        memory.shipmentVesselAssociations.push(association);
        return association;
      },
      async update(association) {
        const idx = memory.shipmentVesselAssociations.findIndex(
          (a) => a.id === association.id,
        );
        if (idx >= 0) memory.shipmentVesselAssociations[idx] = association;
        else memory.shipmentVesselAssociations.push(association);
        return association;
      },
      async listForExecution(executionId) {
        return memory.shipmentVesselAssociations
          .filter((a) => a.shipmentExecutionId === executionId)
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      },
      async getActive(executionId) {
        return memory.shipmentVesselAssociations.find(
          (a) => a.shipmentExecutionId === executionId && a.active,
        );
      },
    },
    shipmentObservations: {
      async create(observation) {
        memory.shipmentObservations.push(observation);
        return observation;
      },
      async listForExecution(executionId, limit = 100) {
        return memory.shipmentObservations
          .filter((o) => o.shipmentExecutionId === executionId)
          .sort((a, b) => b.observedAt.localeCompare(a.observedAt))
          .slice(0, limit);
      },
      async getLatest(executionId) {
        return memory.shipmentObservations
          .filter((o) => o.shipmentExecutionId === executionId)
          .sort((a, b) => b.observedAt.localeCompare(a.observedAt))[0];
      },
      async countForExecution(executionId) {
        return memory.shipmentObservations.filter(
          (o) => o.shipmentExecutionId === executionId,
        ).length;
      },
      async deleteOldest(executionId, keepNewest) {
        const all = memory.shipmentObservations
          .filter((o) => o.shipmentExecutionId === executionId)
          .sort((a, b) => b.observedAt.localeCompare(a.observedAt));
        const drop = all.slice(keepNewest);
        if (!drop.length) return 0;
        const dropIds = new Set(drop.map((d) => d.id));
        memory.shipmentObservations = memory.shipmentObservations.filter(
          (o) => !dropIds.has(o.id),
        );
        return drop.length;
      },
    },
    shipmentMilestoneCandidates: {
      async create(candidate) {
        memory.shipmentMilestoneCandidates.push(candidate);
        return candidate;
      },
      async update(candidate) {
        const idx = memory.shipmentMilestoneCandidates.findIndex(
          (c) => c.id === candidate.id,
        );
        if (idx >= 0) memory.shipmentMilestoneCandidates[idx] = candidate;
        else memory.shipmentMilestoneCandidates.push(candidate);
        return candidate;
      },
      async get(id) {
        return memory.shipmentMilestoneCandidates.find((c) => c.id === id);
      },
      async listForExecution(executionId) {
        return memory.shipmentMilestoneCandidates
          .filter((c) => c.shipmentExecutionId === executionId)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      },
      async listPendingForExecution(executionId) {
        return memory.shipmentMilestoneCandidates.filter(
          (c) =>
            c.shipmentExecutionId === executionId && c.status === "PENDING",
        );
      },
    },
    operationalExceptions: {
      async create(exception) {
        memory.operationalExceptions.push(exception);
        return exception;
      },
      async update(exception) {
        const idx = memory.operationalExceptions.findIndex(
          (e) => e.id === exception.id,
        );
        if (idx >= 0) memory.operationalExceptions[idx] = exception;
        else memory.operationalExceptions.push(exception);
        return exception;
      },
      async get(id) {
        return memory.operationalExceptions.find((e) => e.id === id);
      },
      async listForExecution(executionId) {
        return memory.operationalExceptions
          .filter((e) => e.shipmentExecutionId === executionId)
          .sort((a, b) => b.detectedAt.localeCompare(a.detectedAt));
      },
      async listOpenForExecution(executionId) {
        return memory.operationalExceptions.filter(
          (e) =>
            e.shipmentExecutionId === executionId &&
            (e.status === "OPEN" || e.status === "ACKNOWLEDGED"),
        );
      },
      async findActiveByLogicalKey(logicalKey) {
        return memory.operationalExceptions.find(
          (e) =>
            e.logicalKey === logicalKey &&
            (e.status === "OPEN" || e.status === "ACKNOWLEDGED"),
        );
      },
    },
    claimPreparations: {
      async create(claim) {
        memory.claimPreparations.push(claim);
        return claim;
      },
      async update(claim) {
        const idx = memory.claimPreparations.findIndex((c) => c.id === claim.id);
        if (idx >= 0) memory.claimPreparations[idx] = claim;
        else memory.claimPreparations.push(claim);
        return claim;
      },
      async get(id) {
        return memory.claimPreparations.find((c) => c.id === id);
      },
      async getByReference(reference) {
        return memory.claimPreparations.find((c) => c.reference === reference);
      },
      async listForUser(userId) {
        return memory.claimPreparations
          .filter((c) => c.userId === userId)
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      },
      async listForBooking(bookingId) {
        return memory.claimPreparations
          .filter((c) => c.bookingId === bookingId)
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      },
      async countForBooking(bookingId) {
        return memory.claimPreparations.filter((c) => c.bookingId === bookingId)
          .length;
      },
    },
    claimEvidenceItems: {
      async create(item) {
        memory.claimEvidenceItems.push(item);
        return item;
      },
      async update(item) {
        const idx = memory.claimEvidenceItems.findIndex((i) => i.id === item.id);
        if (idx >= 0) memory.claimEvidenceItems[idx] = item;
        else memory.claimEvidenceItems.push(item);
        return item;
      },
      async get(id) {
        return memory.claimEvidenceItems.find((i) => i.id === id);
      },
      async listForClaim(claimPreparationId) {
        return memory.claimEvidenceItems
          .filter((i) => i.claimPreparationId === claimPreparationId)
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      },
      async delete(id) {
        memory.claimEvidenceItems = memory.claimEvidenceItems.filter(
          (i) => i.id !== id,
        );
      },
    },
    audits: {
      async append(event) {
        memory.audits.push(event);
      },
      async listForRequest(requestId) {
        return memory.audits
          .filter((a) => a.commercialRequestId === requestId)
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      },
      async listForUser(userId) {
        return memory.audits
          .filter((a) => a.userId === userId)
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      },
    },
    async resetForTests() {
      memory.users = [];
      memory.verificationTokens = [];
      memory.intents = [];
      memory.requests = [];
      memory.contacts = [...COMMERCIAL_CONTACTS];
      memory.messages = [];
      memory.attachments = [];
      memory.quotes = [];
      memory.selections = [];
      memory.proceedRequests = [];
      memory.confirmations = [];
      memory.bookings = [];
      memory.acceptedSnapshots = [];
      memory.documentRequirements = [];
      memory.bookingDocuments = [];
      memory.documentValidations = [];
      memory.handoffs = [];
      memory.shipmentExecutions = [];
      memory.shipmentMilestones = [];
      memory.shipmentVesselAssociations = [];
      memory.shipmentObservations = [];
      memory.shipmentMilestoneCandidates = [];
      memory.operationalExceptions = [];
      memory.claimPreparations = [];
      memory.claimEvidenceItems = [];
      memory.audits = [];
    },
  };
}

export function newId(prefix: string): string {
  return `${prefix}_${randomBytes(10).toString("hex")}`;
}
