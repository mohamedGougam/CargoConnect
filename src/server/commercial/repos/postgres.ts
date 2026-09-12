import { and, desc, eq, gte, inArray, isNull, sql } from "drizzle-orm";
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
import { getDb } from "@/server/db/client";
import {
  acceptedCommercialSnapshots,
  auditEvents,
  bookingDocumentRequirements,
  bookingDocuments,
  bookings,
  claimEvidenceItems,
  claimPreparations,
  commercialConfirmations,
  commercialContacts,
  commercialIntents,
  commercialMessageAttachments,
  commercialMessages,
  commercialProceedRequests,
  commercialQuoteSelections,
  commercialQuotes,
  commercialRequests,
  documentValidationResults,
  emailVerificationTokens,
  operationalExceptions,
  operationalHandoffs,
  shipmentExecutions,
  shipmentMilestoneCandidates,
  shipmentMilestones,
  shipmentObservations,
  shipmentVesselAssociations,
  users,
} from "@/server/db/schema";
import type {
  AuditEvent,
  CommercialMessage,
  CommercialMessageAttachment,
  CommercialRepositories,
  EmailVerificationTokenRecord,
  StoredUser,
} from "./types";

function toIso(d: Date | string | null | undefined): string | undefined {
  if (!d) return undefined;
  return d instanceof Date ? d.toISOString() : d;
}

function requestToRow(request: CommercialRequest) {
  return {
    id: request.id,
    userId: request.userId,
    type: request.type,
    status: request.status,
    payload: request as unknown as Record<string, unknown>,
    recipientContactId: request.recipient?.contactId ?? null,
    subject: request.aiDraft?.subject ?? null,
    messageBody: request.aiDraft?.body ?? null,
    createdAt: new Date(request.createdAt),
    updatedAt: new Date(request.updatedAt),
    sentAt: request.sentAt ? new Date(request.sentAt) : null,
  };
}

function rowToRequest(row: typeof commercialRequests.$inferSelect): CommercialRequest {
  const payload = row.payload as CommercialRequest;
  return {
    ...payload,
    id: row.id,
    userId: row.userId,
    type: row.type as CommercialRequest["type"],
    status: row.status as CommercialRequest["status"],
    createdAt: toIso(row.createdAt) ?? payload.createdAt,
    updatedAt: toIso(row.updatedAt) ?? payload.updatedAt,
    sentAt: toIso(row.sentAt) ?? payload.sentAt ?? null,
  };
}

function rowToUser(row: typeof users.$inferSelect): StoredUser {
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.passwordHash,
    fullName: row.fullName,
    companyName: row.companyName ?? undefined,
    phone: row.phone ?? undefined,
    emailVerifiedAt: toIso(row.emailVerifiedAt) ?? null,
    createdAt: toIso(row.createdAt)!,
    updatedAt: toIso(row.updatedAt)!,
  };
}

function rowToContact(row: typeof commercialContacts.$inferSelect): CommercialContact {
  return {
    id: row.id,
    organizationName: row.organizationName,
    contactType: row.contactType as CommercialContact["contactType"],
    portId: row.portId,
    portName: row.portName,
    email: row.email ?? undefined,
    phone: row.phone ?? undefined,
    website: row.website ?? undefined,
    sourceUrl: row.sourceUrl,
    verifiedAt: row.verifiedAt,
    notes: row.notes ?? undefined,
  };
}

function rowToMessage(row: typeof commercialMessages.$inferSelect): CommercialMessage {
  return {
    id: row.id,
    commercialRequestId: row.commercialRequestId,
    direction: row.direction as CommercialMessage["direction"],
    provider: row.provider,
    providerMessageId: row.providerMessageId,
    internetMessageId: row.internetMessageId,
    inReplyTo: row.inReplyTo,
    referencesHeader: row.referencesHeader,
    fromAddress: row.fromAddress,
    fromName: row.fromName,
    replyTo: row.replyTo,
    toAddress: row.toAddress,
    ccAddresses: row.ccAddresses,
    subject: row.subject,
    bodySnapshot: row.bodySnapshot,
    htmlSnapshot: row.htmlSnapshot,
    deliveryStatus: row.deliveryStatus as CommercialMessage["deliveryStatus"],
    errorMessage: row.errorMessage,
    senderTrust: row.senderTrust as CommercialMessage["senderTrust"],
    correlationMethod:
      row.correlationMethod as CommercialMessage["correlationMethod"],
    responseClassification:
      row.responseClassification as CommercialMessage["responseClassification"],
    rawMetadata: (row.rawMetadata as Record<string, unknown>) ?? null,
    messageKind: (row.messageKind as CommercialMessage["messageKind"]) ?? null,
    createdAt: toIso(row.createdAt)!,
    sentAt: toIso(row.sentAt) ?? null,
    receivedAt: toIso(row.receivedAt) ?? null,
  };
}

function rowToAttachment(
  row: typeof commercialMessageAttachments.$inferSelect,
): CommercialMessageAttachment {
  return {
    id: row.id,
    commercialMessageId: row.commercialMessageId,
    filename: row.filename,
    contentType: row.contentType,
    sizeBytes: Number(row.sizeBytes) || 0,
    providerAttachmentId: row.providerAttachmentId,
    storageReference: row.storageReference,
    createdAt: toIso(row.createdAt)!,
  };
}

function rowToQuote(row: typeof commercialQuotes.$inferSelect): CommercialQuote {
  const payload = row.payload as CommercialQuote;
  return {
    ...payload,
    id: row.id,
    commercialRequestId: row.commercialRequestId,
    inboundMessageId: row.inboundMessageId,
    createdAt: toIso(row.createdAt) ?? payload.createdAt,
    updatedAt: toIso(row.updatedAt) ?? payload.updatedAt,
  };
}

function rowToSelection(
  row: typeof commercialQuoteSelections.$inferSelect,
): SelectedCommercialQuote {
  const payload = (row.payload as SelectedCommercialQuote | null) ?? null;
  return {
    id: row.id,
    commercialRequestId: row.commercialRequestId,
    commercialQuoteId: row.commercialQuoteId,
    userId: row.userId,
    selectedAt: toIso(row.selectedAt) ?? payload?.selectedAt ?? new Date().toISOString(),
    selectionReason: row.selectionReason ?? payload?.selectionReason ?? null,
    preferenceSnapshot:
      row.preferenceSnapshot ?? payload?.preferenceSnapshot ?? null,
    active: row.active === "true",
    lockedAt: toIso(row.lockedAt) ?? payload?.lockedAt ?? null,
  };
}

function rowToProceed(
  row: typeof commercialProceedRequests.$inferSelect,
): CommercialProceedRequest {
  const payload = row.payload as CommercialProceedRequest;
  return {
    ...payload,
    id: row.id,
    commercialRequestId: row.commercialRequestId,
    selectionId: row.selectionId,
    commercialQuoteId: row.commercialQuoteId,
    userId: row.userId,
    status: row.status as CommercialProceedRequest["status"],
    createdAt: toIso(row.createdAt) ?? payload.createdAt,
    updatedAt: toIso(row.updatedAt) ?? payload.updatedAt,
    sentAt: toIso(row.sentAt) ?? payload.sentAt ?? null,
  };
}

function rowToConfirmation(
  row: typeof commercialConfirmations.$inferSelect,
): CommercialConfirmation {
  const payload = row.payload as CommercialConfirmation;
  return {
    ...payload,
    id: row.id,
    commercialRequestId: row.commercialRequestId,
    proceedRequestId: row.proceedRequestId,
    inboundMessageId: row.inboundMessageId,
    userId: row.userId,
    classification: row.classification as CommercialConfirmation["classification"],
    reviewStatus: row.reviewStatus as CommercialConfirmation["reviewStatus"],
    createdAt: toIso(row.createdAt) ?? payload.createdAt,
    updatedAt: toIso(row.updatedAt) ?? payload.updatedAt,
  };
}

function rowToBooking(row: typeof bookings.$inferSelect): Booking {
  const payload = row.payload as Booking;
  return {
    ...payload,
    id: row.id,
    bookingReference: row.bookingReference,
    commercialRequestId: row.commercialRequestId,
    confirmationId: row.confirmationId,
    userId: row.userId,
    status: row.status as Booking["status"],
    createdAt: toIso(row.createdAt) ?? payload.createdAt,
    confirmedAt: toIso(row.confirmedAt) ?? payload.confirmedAt,
    updatedAt: toIso(row.updatedAt) ?? payload.updatedAt,
  };
}

export function createPostgresRepositories(): CommercialRepositories {
  return {
    users: {
      async findByEmail(email) {
        const db = getDb();
        const rows = await db
          .select()
          .from(users)
          .where(eq(users.email, email.trim().toLowerCase()))
          .limit(1);
        return rows[0] ? rowToUser(rows[0]) : undefined;
      },
      async findById(id) {
        const db = getDb();
        const rows = await db.select().from(users).where(eq(users.id, id)).limit(1);
        return rows[0] ? rowToUser(rows[0]) : undefined;
      },
      async create(user) {
        const db = getDb();
        await db.insert(users).values({
          id: user.id,
          email: user.email.trim().toLowerCase(),
          passwordHash: user.passwordHash,
          fullName: user.fullName,
          companyName: user.companyName ?? null,
          phone: user.phone ?? null,
          emailVerifiedAt: user.emailVerifiedAt
            ? new Date(user.emailVerifiedAt)
            : null,
          createdAt: new Date(user.createdAt),
          updatedAt: new Date(user.updatedAt),
        });
        return user;
      },
      async markEmailVerified(userId, verifiedAt) {
        const db = getDb();
        const rows = await db
          .update(users)
          .set({
            emailVerifiedAt: new Date(verifiedAt),
            updatedAt: new Date(verifiedAt),
          })
          .where(eq(users.id, userId))
          .returning();
        return rows[0] ? rowToUser(rows[0]) : undefined;
      },
    },
    verificationTokens: {
      async create(token) {
        const db = getDb();
        await db.insert(emailVerificationTokens).values({
          id: token.id,
          userId: token.userId,
          tokenHash: token.tokenHash,
          expiresAt: new Date(token.expiresAt),
          usedAt: token.usedAt ? new Date(token.usedAt) : null,
          createdAt: new Date(token.createdAt),
        });
      },
      async findValidByHash(tokenHash) {
        const db = getDb();
        const rows = await db
          .select()
          .from(emailVerificationTokens)
          .where(
            and(
              eq(emailVerificationTokens.tokenHash, tokenHash),
              isNull(emailVerificationTokens.usedAt),
              gte(emailVerificationTokens.expiresAt, new Date()),
            ),
          )
          .limit(1);
        if (!rows[0]) return undefined;
        const row = rows[0];
        const record: EmailVerificationTokenRecord = {
          id: row.id,
          userId: row.userId,
          tokenHash: row.tokenHash,
          expiresAt: toIso(row.expiresAt)!,
          usedAt: toIso(row.usedAt) ?? null,
          createdAt: toIso(row.createdAt)!,
        };
        return record;
      },
      async markUsed(id, usedAt) {
        const db = getDb();
        await db
          .update(emailVerificationTokens)
          .set({ usedAt: new Date(usedAt) })
          .where(eq(emailVerificationTokens.id, id));
      },
      async invalidateActiveForUser(userId) {
        const db = getDb();
        await db
          .update(emailVerificationTokens)
          .set({ usedAt: new Date() })
          .where(
            and(
              eq(emailVerificationTokens.userId, userId),
              isNull(emailVerificationTokens.usedAt),
            ),
          );
      },
      async countRecentForUser(userId, sinceIso) {
        const db = getDb();
        const rows = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(emailVerificationTokens)
          .where(
            and(
              eq(emailVerificationTokens.userId, userId),
              gte(emailVerificationTokens.createdAt, new Date(sinceIso)),
            ),
          );
        return Number(rows[0]?.count ?? 0);
      },
    },
    intents: {
      async save(intent) {
        const db = getDb();
        const expires = new Date(Date.now() + 1000 * 60 * 60 * 24);
        await db
          .insert(commercialIntents)
          .values({
            id: intent.id,
            userId: null,
            workflow: intent.workflow,
            payload: intent as unknown as Record<string, unknown>,
            createdAt: new Date(intent.createdAt),
            expiresAt: expires,
          })
          .onConflictDoUpdate({
            target: commercialIntents.id,
            set: {
              workflow: intent.workflow,
              payload: intent as unknown as Record<string, unknown>,
            },
          });
      },
      async get(id) {
        const db = getDb();
        const rows = await db
          .select()
          .from(commercialIntents)
          .where(eq(commercialIntents.id, id))
          .limit(1);
        if (!rows[0]) return undefined;
        return rows[0].payload as PendingCommercialIntent;
      },
      async delete(id) {
        const db = getDb();
        await db.delete(commercialIntents).where(eq(commercialIntents.id, id));
      },
    },
    requests: {
      async save(request) {
        const db = getDb();
        const row = requestToRow(request);
        await db
          .insert(commercialRequests)
          .values(row)
          .onConflictDoUpdate({
            target: commercialRequests.id,
            set: {
              status: row.status,
              payload: row.payload,
              recipientContactId: row.recipientContactId,
              subject: row.subject,
              messageBody: row.messageBody,
              updatedAt: row.updatedAt,
              sentAt: row.sentAt,
              type: row.type,
            },
          });
        return request;
      },
      async get(id) {
        const db = getDb();
        const rows = await db
          .select()
          .from(commercialRequests)
          .where(eq(commercialRequests.id, id))
          .limit(1);
        return rows[0] ? rowToRequest(rows[0]) : undefined;
      },
      async listForUser(userId) {
        const db = getDb();
        const rows = await db
          .select()
          .from(commercialRequests)
          .where(eq(commercialRequests.userId, userId))
          .orderBy(desc(commercialRequests.createdAt));
        return rows.map(rowToRequest);
      },
      async findByReplyToken(token) {
        const db = getDb();
        const rows = await db
          .select()
          .from(commercialRequests)
          .where(sql`${commercialRequests.payload}->>'replyToken' = ${token}`)
          .limit(1);
        return rows[0] ? rowToRequest(rows[0]) : undefined;
      },
      async claimForSend(id, userId) {
        const db = getDb();
        const updated = await db
          .update(commercialRequests)
          .set({
            status: "SENDING",
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(commercialRequests.id, id),
              eq(commercialRequests.userId, userId),
              inArray(commercialRequests.status, ["READY_TO_SEND", "SEND_FAILED"]),
            ),
          )
          .returning();
        if (!updated[0]) return null;
        const payload = updated[0].payload as CommercialRequest;
        const next: CommercialRequest = {
          ...payload,
          status: "SENDING",
          updatedAt: new Date().toISOString(),
        };
        // Keep payload in sync
        await db
          .update(commercialRequests)
          .set({ payload: next as unknown as Record<string, unknown> })
          .where(eq(commercialRequests.id, id));
        return next;
      },
    },
    contacts: {
      async listAll() {
        const db = getDb();
        const rows = await db.select().from(commercialContacts);
        return rows.map(rowToContact);
      },
      async getById(id) {
        const db = getDb();
        const rows = await db
          .select()
          .from(commercialContacts)
          .where(eq(commercialContacts.id, id))
          .limit(1);
        return rows[0] ? rowToContact(rows[0]) : undefined;
      },
      async listForPort(portId) {
        const db = getDb();
        const rows = await db
          .select()
          .from(commercialContacts)
          .where(eq(commercialContacts.portId, portId));
        return rows.map(rowToContact);
      },
      async upsertMany(contacts) {
        const db = getDb();
        const now = new Date();
        for (const c of contacts) {
          await db
            .insert(commercialContacts)
            .values({
              id: c.id,
              organizationName: c.organizationName,
              contactType: c.contactType,
              portId: c.portId,
              portName: c.portName,
              email: c.email ?? null,
              phone: c.phone ?? null,
              website: c.website ?? null,
              sourceUrl: c.sourceUrl,
              verifiedAt: c.verifiedAt,
              notes: c.notes ?? null,
              createdAt: now,
              updatedAt: now,
            })
            .onConflictDoUpdate({
              target: commercialContacts.id,
              set: {
                organizationName: c.organizationName,
                contactType: c.contactType,
                portId: c.portId,
                portName: c.portName,
                email: c.email ?? null,
                phone: c.phone ?? null,
                website: c.website ?? null,
                sourceUrl: c.sourceUrl,
                verifiedAt: c.verifiedAt,
                notes: c.notes ?? null,
                updatedAt: now,
              },
            });
        }
      },
    },
    messages: {
      async create(message) {
        const db = getDb();
        await db.insert(commercialMessages).values({
          id: message.id,
          commercialRequestId: message.commercialRequestId,
          direction: message.direction,
          provider: message.provider,
          providerMessageId: message.providerMessageId ?? null,
          internetMessageId: message.internetMessageId ?? null,
          inReplyTo: message.inReplyTo ?? null,
          referencesHeader: message.referencesHeader ?? null,
          fromAddress: message.fromAddress,
          fromName: message.fromName ?? null,
          replyTo: message.replyTo,
          toAddress: message.toAddress,
          ccAddresses: message.ccAddresses ?? null,
          subject: message.subject,
          bodySnapshot: message.bodySnapshot,
          htmlSnapshot: message.htmlSnapshot ?? null,
          deliveryStatus: message.deliveryStatus,
          errorMessage: message.errorMessage ?? null,
          senderTrust: message.senderTrust ?? null,
          correlationMethod: message.correlationMethod ?? null,
          responseClassification: message.responseClassification ?? null,
          rawMetadata: message.rawMetadata ?? null,
          messageKind: message.messageKind ?? null,
          createdAt: new Date(message.createdAt),
          sentAt: message.sentAt ? new Date(message.sentAt) : null,
          receivedAt: message.receivedAt ? new Date(message.receivedAt) : null,
        });
        return message;
      },
      async get(id) {
        const db = getDb();
        const rows = await db
          .select()
          .from(commercialMessages)
          .where(eq(commercialMessages.id, id))
          .limit(1);
        return rows[0] ? rowToMessage(rows[0]) : undefined;
      },
      async listForRequest(requestId) {
        const db = getDb();
        const rows = await db
          .select()
          .from(commercialMessages)
          .where(eq(commercialMessages.commercialRequestId, requestId))
          .orderBy(commercialMessages.createdAt);
        return rows.map(rowToMessage);
      },
      async findByProviderMessageId(provider, providerMessageId) {
        const db = getDb();
        const rows = await db
          .select()
          .from(commercialMessages)
          .where(
            and(
              eq(commercialMessages.provider, provider),
              eq(commercialMessages.providerMessageId, providerMessageId),
            ),
          )
          .limit(1);
        return rows[0] ? rowToMessage(rows[0]) : undefined;
      },
      async findByInternetMessageId(internetMessageId) {
        const db = getDb();
        const rows = await db
          .select()
          .from(commercialMessages)
          .where(eq(commercialMessages.internetMessageId, internetMessageId))
          .limit(1);
        return rows[0] ? rowToMessage(rows[0]) : undefined;
      },
      async countSuccessfulOutbound(requestId) {
        const db = getDb();
        const rows = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(commercialMessages)
          .where(
            and(
              eq(commercialMessages.commercialRequestId, requestId),
              eq(commercialMessages.direction, "OUTBOUND"),
              inArray(commercialMessages.deliveryStatus, ["SENT", "SIMULATED"]),
            ),
          );
        return Number(rows[0]?.count ?? 0);
      },
    },
    attachments: {
      async createMany(attachments) {
        if (attachments.length === 0) return;
        const db = getDb();
        await db.insert(commercialMessageAttachments).values(
          attachments.map((a) => ({
            id: a.id,
            commercialMessageId: a.commercialMessageId,
            filename: a.filename,
            contentType: a.contentType,
            sizeBytes: String(a.sizeBytes),
            providerAttachmentId: a.providerAttachmentId ?? null,
            storageReference: a.storageReference ?? null,
            createdAt: new Date(a.createdAt),
          })),
        );
      },
      async listForMessage(messageId) {
        const db = getDb();
        const rows = await db
          .select()
          .from(commercialMessageAttachments)
          .where(eq(commercialMessageAttachments.commercialMessageId, messageId));
        return rows.map(rowToAttachment);
      },
      async listForRequest(requestId) {
        const db = getDb();
        const msgs = await db
          .select({ id: commercialMessages.id })
          .from(commercialMessages)
          .where(eq(commercialMessages.commercialRequestId, requestId));
        if (msgs.length === 0) return [];
        const ids = msgs.map((m) => m.id);
        const rows = await db
          .select()
          .from(commercialMessageAttachments)
          .where(inArray(commercialMessageAttachments.commercialMessageId, ids));
        return rows.map(rowToAttachment);
      },
    },
    quotes: {
      async create(quote) {
        const db = getDb();
        await db.insert(commercialQuotes).values({
          id: quote.id,
          commercialRequestId: quote.commercialRequestId,
          inboundMessageId: quote.inboundMessageId,
          payload: quote as unknown as Record<string, unknown>,
          createdAt: new Date(quote.createdAt),
          updatedAt: new Date(quote.updatedAt),
        });
        return quote;
      },
      async get(id) {
        const db = getDb();
        const rows = await db
          .select()
          .from(commercialQuotes)
          .where(eq(commercialQuotes.id, id))
          .limit(1);
        return rows[0] ? rowToQuote(rows[0]) : undefined;
      },
      async update(quote) {
        const db = getDb();
        await db
          .update(commercialQuotes)
          .set({
            payload: quote as unknown as Record<string, unknown>,
            updatedAt: new Date(quote.updatedAt),
          })
          .where(eq(commercialQuotes.id, quote.id));
        return quote;
      },
      async listForRequest(requestId) {
        const db = getDb();
        const rows = await db
          .select()
          .from(commercialQuotes)
          .where(eq(commercialQuotes.commercialRequestId, requestId))
          .orderBy(commercialQuotes.createdAt);
        return rows.map(rowToQuote);
      },
    },
    selections: {
      async create(selection) {
        const db = getDb();
        await db.insert(commercialQuoteSelections).values({
          id: selection.id,
          commercialRequestId: selection.commercialRequestId,
          commercialQuoteId: selection.commercialQuoteId,
          userId: selection.userId,
          selectedAt: new Date(selection.selectedAt),
          selectionReason: selection.selectionReason ?? null,
          preferenceSnapshot: selection.preferenceSnapshot ?? null,
          active: selection.active ? "true" : "false",
          lockedAt: selection.lockedAt ? new Date(selection.lockedAt) : null,
          payload: selection as unknown as Record<string, unknown>,
        });
        return selection;
      },
      async update(selection) {
        const db = getDb();
        await db
          .update(commercialQuoteSelections)
          .set({
            commercialQuoteId: selection.commercialQuoteId,
            selectionReason: selection.selectionReason ?? null,
            preferenceSnapshot: selection.preferenceSnapshot ?? null,
            active: selection.active ? "true" : "false",
            lockedAt: selection.lockedAt ? new Date(selection.lockedAt) : null,
            payload: selection as unknown as Record<string, unknown>,
          })
          .where(eq(commercialQuoteSelections.id, selection.id));
        return selection;
      },
      async get(id) {
        const db = getDb();
        const rows = await db
          .select()
          .from(commercialQuoteSelections)
          .where(eq(commercialQuoteSelections.id, id))
          .limit(1);
        return rows[0] ? rowToSelection(rows[0]) : undefined;
      },
      async getActiveForRequest(requestId) {
        const db = getDb();
        const rows = await db
          .select()
          .from(commercialQuoteSelections)
          .where(
            and(
              eq(commercialQuoteSelections.commercialRequestId, requestId),
              eq(commercialQuoteSelections.active, "true"),
            ),
          )
          .limit(1);
        return rows[0] ? rowToSelection(rows[0]) : undefined;
      },
      async listForRequest(requestId) {
        const db = getDb();
        const rows = await db
          .select()
          .from(commercialQuoteSelections)
          .where(eq(commercialQuoteSelections.commercialRequestId, requestId))
          .orderBy(commercialQuoteSelections.selectedAt);
        return rows.map(rowToSelection);
      },
      async deactivateAllForRequest(requestId) {
        const db = getDb();
        await db
          .update(commercialQuoteSelections)
          .set({ active: "false" })
          .where(
            and(
              eq(commercialQuoteSelections.commercialRequestId, requestId),
              eq(commercialQuoteSelections.active, "true"),
            ),
          );
      },
    },
    proceedRequests: {
      async create(proceed) {
        const db = getDb();
        await db.insert(commercialProceedRequests).values({
          id: proceed.id,
          commercialRequestId: proceed.commercialRequestId,
          selectionId: proceed.selectionId,
          commercialQuoteId: proceed.commercialQuoteId,
          userId: proceed.userId,
          status: proceed.status,
          payload: proceed as unknown as Record<string, unknown>,
          createdAt: new Date(proceed.createdAt),
          updatedAt: new Date(proceed.updatedAt),
          sentAt: proceed.sentAt ? new Date(proceed.sentAt) : null,
        });
        return proceed;
      },
      async update(proceed) {
        const db = getDb();
        await db
          .update(commercialProceedRequests)
          .set({
            status: proceed.status,
            payload: proceed as unknown as Record<string, unknown>,
            updatedAt: new Date(proceed.updatedAt),
            sentAt: proceed.sentAt ? new Date(proceed.sentAt) : null,
          })
          .where(eq(commercialProceedRequests.id, proceed.id));
        return proceed;
      },
      async get(id) {
        const db = getDb();
        const rows = await db
          .select()
          .from(commercialProceedRequests)
          .where(eq(commercialProceedRequests.id, id))
          .limit(1);
        return rows[0] ? rowToProceed(rows[0]) : undefined;
      },
      async getLatestForRequest(requestId) {
        const db = getDb();
        const rows = await db
          .select()
          .from(commercialProceedRequests)
          .where(eq(commercialProceedRequests.commercialRequestId, requestId))
          .orderBy(desc(commercialProceedRequests.createdAt))
          .limit(1);
        return rows[0] ? rowToProceed(rows[0]) : undefined;
      },
      async claimForSend(id, userId) {
        const db = getDb();
        const updated = await db
          .update(commercialProceedRequests)
          .set({ status: "SENDING", updatedAt: new Date() })
          .where(
            and(
              eq(commercialProceedRequests.id, id),
              eq(commercialProceedRequests.userId, userId),
              inArray(commercialProceedRequests.status, [
                "READY_TO_SEND",
                "SEND_FAILED",
              ]),
            ),
          )
          .returning();
        if (!updated[0]) return null;
        const payload = updated[0].payload as CommercialProceedRequest;
        const next: CommercialProceedRequest = {
          ...payload,
          status: "SENDING",
          updatedAt: new Date().toISOString(),
        };
        await db
          .update(commercialProceedRequests)
          .set({ payload: next as unknown as Record<string, unknown> })
          .where(eq(commercialProceedRequests.id, id));
        return next;
      },
    },
    confirmations: {
      async create(confirmation) {
        const db = getDb();
        await db.insert(commercialConfirmations).values({
          id: confirmation.id,
          commercialRequestId: confirmation.commercialRequestId,
          proceedRequestId: confirmation.proceedRequestId,
          inboundMessageId: confirmation.inboundMessageId,
          userId: confirmation.userId,
          classification: confirmation.classification,
          reviewStatus: confirmation.reviewStatus,
          payload: confirmation as unknown as Record<string, unknown>,
          createdAt: new Date(confirmation.createdAt),
          updatedAt: new Date(confirmation.updatedAt),
        });
        return confirmation;
      },
      async update(confirmation) {
        const db = getDb();
        await db
          .update(commercialConfirmations)
          .set({
            classification: confirmation.classification,
            reviewStatus: confirmation.reviewStatus,
            payload: confirmation as unknown as Record<string, unknown>,
            updatedAt: new Date(confirmation.updatedAt),
          })
          .where(eq(commercialConfirmations.id, confirmation.id));
        return confirmation;
      },
      async get(id) {
        const db = getDb();
        const rows = await db
          .select()
          .from(commercialConfirmations)
          .where(eq(commercialConfirmations.id, id))
          .limit(1);
        return rows[0] ? rowToConfirmation(rows[0]) : undefined;
      },
      async getLatestForRequest(requestId) {
        const db = getDb();
        const rows = await db
          .select()
          .from(commercialConfirmations)
          .where(eq(commercialConfirmations.commercialRequestId, requestId))
          .orderBy(desc(commercialConfirmations.createdAt))
          .limit(1);
        return rows[0] ? rowToConfirmation(rows[0]) : undefined;
      },
      async listForRequest(requestId) {
        const db = getDb();
        const rows = await db
          .select()
          .from(commercialConfirmations)
          .where(eq(commercialConfirmations.commercialRequestId, requestId))
          .orderBy(commercialConfirmations.createdAt);
        return rows.map(rowToConfirmation);
      },
      async claimForAcknowledge(id, userId) {
        const db = getDb();
        const updated = await db
          .update(commercialConfirmations)
          .set({
            reviewStatus: "ACKNOWLEDGED",
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(commercialConfirmations.id, id),
              eq(commercialConfirmations.userId, userId),
              eq(commercialConfirmations.reviewStatus, "PENDING_REVIEW"),
              eq(commercialConfirmations.classification, "PROCEED_CONFIRMED"),
            ),
          )
          .returning();
        if (!updated[0]) return null;
        const payload = updated[0].payload as CommercialConfirmation;
        if (payload.termsChanged) {
          // roll back claim — material changes cannot be acknowledged as clean
          await db
            .update(commercialConfirmations)
            .set({
              reviewStatus: "PENDING_REVIEW",
              payload: payload as unknown as Record<string, unknown>,
              updatedAt: new Date(),
            })
            .where(eq(commercialConfirmations.id, id));
          return null;
        }
        const now = new Date().toISOString();
        const next: CommercialConfirmation = {
          ...payload,
          reviewStatus: "ACKNOWLEDGED",
          reviewedAt: now,
          updatedAt: now,
        };
        await db
          .update(commercialConfirmations)
          .set({ payload: next as unknown as Record<string, unknown> })
          .where(eq(commercialConfirmations.id, id));
        return next;
      },
    },
    bookings: {
      async create(booking) {
        const db = getDb();
        await db.insert(bookings).values({
          id: booking.id,
          bookingReference: booking.bookingReference,
          commercialRequestId: booking.commercialRequestId,
          confirmationId: booking.confirmationId,
          userId: booking.userId,
          status: booking.status,
          payload: booking as unknown as Record<string, unknown>,
          createdAt: new Date(booking.createdAt),
          confirmedAt: new Date(booking.confirmedAt),
          updatedAt: new Date(booking.updatedAt),
        });
        return booking;
      },
      async update(booking) {
        const db = getDb();
        await db
          .update(bookings)
          .set({
            status: booking.status,
            payload: booking as unknown as Record<string, unknown>,
            updatedAt: new Date(booking.updatedAt),
          })
          .where(eq(bookings.id, booking.id));
        return booking;
      },
      async get(id) {
        const db = getDb();
        const rows = await db
          .select()
          .from(bookings)
          .where(eq(bookings.id, id))
          .limit(1);
        return rows[0] ? rowToBooking(rows[0]) : undefined;
      },
      async getByReference(reference) {
        const db = getDb();
        const rows = await db
          .select()
          .from(bookings)
          .where(eq(bookings.bookingReference, reference))
          .limit(1);
        return rows[0] ? rowToBooking(rows[0]) : undefined;
      },
      async getForRequest(requestId) {
        const db = getDb();
        const rows = await db
          .select()
          .from(bookings)
          .where(eq(bookings.commercialRequestId, requestId))
          .limit(1);
        return rows[0] ? rowToBooking(rows[0]) : undefined;
      },
      async listForUser(userId) {
        const db = getDb();
        const rows = await db
          .select()
          .from(bookings)
          .where(eq(bookings.userId, userId))
          .orderBy(desc(bookings.confirmedAt));
        return rows.map(rowToBooking);
      },
      async countForYear(year) {
        const db = getDb();
        const prefix = `CC-${year}-`;
        const rows = await db
          .select({ bookingReference: bookings.bookingReference })
          .from(bookings);
        return rows.filter((r) => r.bookingReference.startsWith(prefix)).length;
      },
    },
    acceptedSnapshots: {
      async create(snapshot) {
        const db = getDb();
        await db.insert(acceptedCommercialSnapshots).values({
          id: snapshot.id,
          commercialRequestId: snapshot.commercialRequestId,
          confirmationId: snapshot.confirmationId,
          proceedRequestId: snapshot.proceedRequestId,
          acceptedByUserId: snapshot.acceptedByUserId,
          acceptedAt: new Date(snapshot.acceptedAt),
          bookingId: snapshot.bookingId ?? null,
          payload: snapshot as unknown as Record<string, unknown>,
        });
        return snapshot;
      },
      async get(id) {
        const db = getDb();
        const rows = await db
          .select()
          .from(acceptedCommercialSnapshots)
          .where(eq(acceptedCommercialSnapshots.id, id))
          .limit(1);
        return rows[0]
          ? (rows[0].payload as AcceptedCommercialSnapshot)
          : undefined;
      },
      async getForConfirmation(confirmationId) {
        const db = getDb();
        const rows = await db
          .select()
          .from(acceptedCommercialSnapshots)
          .where(eq(acceptedCommercialSnapshots.confirmationId, confirmationId))
          .limit(1);
        return rows[0]
          ? (rows[0].payload as AcceptedCommercialSnapshot)
          : undefined;
      },
    },
    documentRequirements: {
      async createMany(requirements) {
        if (!requirements.length) return requirements;
        const db = getDb();
        await db.insert(bookingDocumentRequirements).values(
          requirements.map((r) => ({
            id: r.id,
            bookingId: r.bookingId,
            documentType: r.documentType,
            required: r.required ? "true" : "false",
            source: r.source,
            status: r.status,
            payload: r as unknown as Record<string, unknown>,
            createdAt: new Date(r.createdAt),
            updatedAt: new Date(r.updatedAt),
          })),
        );
        return requirements;
      },
      async update(requirement) {
        const db = getDb();
        await db
          .update(bookingDocumentRequirements)
          .set({
            status: requirement.status,
            required: requirement.required ? "true" : "false",
            payload: requirement as unknown as Record<string, unknown>,
            updatedAt: new Date(requirement.updatedAt),
          })
          .where(eq(bookingDocumentRequirements.id, requirement.id));
        return requirement;
      },
      async get(id) {
        const db = getDb();
        const rows = await db
          .select()
          .from(bookingDocumentRequirements)
          .where(eq(bookingDocumentRequirements.id, id))
          .limit(1);
        return rows[0]
          ? (rows[0].payload as BookingDocumentRequirement)
          : undefined;
      },
      async listForBooking(bookingId) {
        const db = getDb();
        const rows = await db
          .select()
          .from(bookingDocumentRequirements)
          .where(eq(bookingDocumentRequirements.bookingId, bookingId));
        return rows.map((r) => r.payload as BookingDocumentRequirement);
      },
    },
    bookingDocuments: {
      async create(doc) {
        const db = getDb();
        await db.insert(bookingDocuments).values({
          id: doc.id,
          bookingId: doc.bookingId,
          requirementId: doc.requirementId ?? null,
          documentType: doc.documentType,
          storageKey: doc.storageKey,
          uploadedByUserId: doc.uploadedByUserId,
          uploadedAt: new Date(doc.uploadedAt),
          validationStatus: doc.validationStatus,
          version: String(doc.version),
          isCurrent: doc.isCurrent ? "true" : "false",
          payload: doc as unknown as Record<string, unknown>,
        });
        return doc;
      },
      async update(doc) {
        const db = getDb();
        await db
          .update(bookingDocuments)
          .set({
            validationStatus: doc.validationStatus,
            version: String(doc.version),
            isCurrent: doc.isCurrent ? "true" : "false",
            payload: doc as unknown as Record<string, unknown>,
          })
          .where(eq(bookingDocuments.id, doc.id));
        return doc;
      },
      async get(id) {
        const db = getDb();
        const rows = await db
          .select()
          .from(bookingDocuments)
          .where(eq(bookingDocuments.id, id))
          .limit(1);
        return rows[0] ? (rows[0].payload as BookingDocument) : undefined;
      },
      async listForBooking(bookingId) {
        const db = getDb();
        const rows = await db
          .select()
          .from(bookingDocuments)
          .where(eq(bookingDocuments.bookingId, bookingId))
          .orderBy(bookingDocuments.uploadedAt);
        return rows.map((r) => r.payload as BookingDocument);
      },
      async listCurrentForBooking(bookingId) {
        const db = getDb();
        const rows = await db
          .select()
          .from(bookingDocuments)
          .where(
            and(
              eq(bookingDocuments.bookingId, bookingId),
              eq(bookingDocuments.isCurrent, "true"),
            ),
          );
        return rows.map((r) => r.payload as BookingDocument);
      },
    },
    documentValidations: {
      async create(result) {
        const db = getDb();
        await db.insert(documentValidationResults).values({
          id: result.id,
          documentId: result.documentId,
          bookingId: result.bookingId,
          status: result.status,
          payload: result as unknown as Record<string, unknown>,
          validatedAt: new Date(result.validatedAt),
        });
        return result;
      },
      async getLatestForDocument(documentId) {
        const db = getDb();
        const rows = await db
          .select()
          .from(documentValidationResults)
          .where(eq(documentValidationResults.documentId, documentId))
          .orderBy(desc(documentValidationResults.validatedAt))
          .limit(1);
        return rows[0]
          ? (rows[0].payload as DocumentValidationResult)
          : undefined;
      },
      async listForBooking(bookingId) {
        const db = getDb();
        const rows = await db
          .select()
          .from(documentValidationResults)
          .where(eq(documentValidationResults.bookingId, bookingId));
        return rows.map((r) => r.payload as DocumentValidationResult);
      },
    },
    handoffs: {
      async create(handoff) {
        const db = getDb();
        await db.insert(operationalHandoffs).values({
          id: handoff.id,
          handoffReference: handoff.handoffReference,
          bookingId: handoff.bookingId,
          userId: handoff.userId,
          status: handoff.status,
          version: String(handoff.version),
          supersedesHandoffId: handoff.supersedesHandoffId ?? null,
          finalizedAt: handoff.finalizedAt
            ? new Date(handoff.finalizedAt)
            : null,
          payload: handoff as unknown as Record<string, unknown>,
          generatedAt: new Date(handoff.generatedAt),
          updatedAt: new Date(handoff.updatedAt),
        });
        return handoff;
      },
      async update(handoff) {
        const db = getDb();
        await db
          .update(operationalHandoffs)
          .set({
            status: handoff.status,
            supersedesHandoffId: handoff.supersedesHandoffId ?? null,
            finalizedAt: handoff.finalizedAt
              ? new Date(handoff.finalizedAt)
              : null,
            payload: handoff as unknown as Record<string, unknown>,
            updatedAt: new Date(handoff.updatedAt),
          })
          .where(eq(operationalHandoffs.id, handoff.id));
        return handoff;
      },
      async get(id) {
        const db = getDb();
        const rows = await db
          .select()
          .from(operationalHandoffs)
          .where(eq(operationalHandoffs.id, id))
          .limit(1);
        return rows[0] ? (rows[0].payload as OperationalHandoff) : undefined;
      },
      async getByReference(reference) {
        const db = getDb();
        const rows = await db
          .select()
          .from(operationalHandoffs)
          .where(eq(operationalHandoffs.handoffReference, reference))
          .limit(1);
        return rows[0] ? (rows[0].payload as OperationalHandoff) : undefined;
      },
      async listForBooking(bookingId) {
        const db = getDb();
        const rows = await db
          .select()
          .from(operationalHandoffs)
          .where(eq(operationalHandoffs.bookingId, bookingId));
        return rows
          .map((r) => r.payload as OperationalHandoff)
          .sort((a, b) => b.version - a.version);
      },
      async getLatestForBooking(bookingId) {
        const list = await this.listForBooking(bookingId);
        return list[0];
      },
    },
    shipmentExecutions: {
      async create(execution) {
        const db = getDb();
        await db.insert(shipmentExecutions).values({
          id: execution.id,
          bookingId: execution.bookingId,
          userId: execution.userId,
          status: execution.status,
          vesselMmsi: execution.vesselMmsi ?? null,
          originPortId: execution.originPortId ?? null,
          destinationPortId: execution.destinationPortId ?? null,
          payload: execution as unknown as Record<string, unknown>,
          createdAt: new Date(execution.createdAt),
          updatedAt: new Date(execution.updatedAt),
        });
        return execution;
      },
      async update(execution) {
        const db = getDb();
        await db
          .update(shipmentExecutions)
          .set({
            status: execution.status,
            vesselMmsi: execution.vesselMmsi ?? null,
            originPortId: execution.originPortId ?? null,
            destinationPortId: execution.destinationPortId ?? null,
            payload: execution as unknown as Record<string, unknown>,
            updatedAt: new Date(execution.updatedAt),
          })
          .where(eq(shipmentExecutions.id, execution.id));
        return execution;
      },
      async get(id) {
        const db = getDb();
        const rows = await db
          .select()
          .from(shipmentExecutions)
          .where(eq(shipmentExecutions.id, id))
          .limit(1);
        return rows[0] ? (rows[0].payload as ShipmentExecution) : undefined;
      },
      async getForBooking(bookingId) {
        const db = getDb();
        const rows = await db
          .select()
          .from(shipmentExecutions)
          .where(eq(shipmentExecutions.bookingId, bookingId))
          .limit(1);
        return rows[0] ? (rows[0].payload as ShipmentExecution) : undefined;
      },
      async listForUser(userId) {
        const db = getDb();
        const rows = await db
          .select()
          .from(shipmentExecutions)
          .where(eq(shipmentExecutions.userId, userId));
        return rows
          .map((r) => r.payload as ShipmentExecution)
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      },
      async listActiveForWatcher() {
        const db = getDb();
        const rows = await db.select().from(shipmentExecutions);
        return rows
          .map((r) => r.payload as ShipmentExecution)
          .filter(
            (e) =>
              e.status !== "COMPLETED" && Boolean(e.vesselMmsi || e.vesselImo),
          );
      },
    },
    shipmentMilestones: {
      async create(milestone) {
        const db = getDb();
        await db.insert(shipmentMilestones).values({
          id: milestone.id,
          shipmentExecutionId: milestone.shipmentExecutionId,
          type: milestone.type,
          status: milestone.status,
          source: milestone.source,
          occurredAt: milestone.occurredAt
            ? new Date(milestone.occurredAt)
            : null,
          payload: milestone as unknown as Record<string, unknown>,
          createdAt: new Date(milestone.createdAt),
        });
        return milestone;
      },
      async update(milestone) {
        const db = getDb();
        await db
          .update(shipmentMilestones)
          .set({
            status: milestone.status,
            occurredAt: milestone.occurredAt
              ? new Date(milestone.occurredAt)
              : null,
            payload: milestone as unknown as Record<string, unknown>,
          })
          .where(eq(shipmentMilestones.id, milestone.id));
        return milestone;
      },
      async get(id) {
        const db = getDb();
        const rows = await db
          .select()
          .from(shipmentMilestones)
          .where(eq(shipmentMilestones.id, id))
          .limit(1);
        return rows[0] ? (rows[0].payload as ShipmentMilestone) : undefined;
      },
      async listForExecution(executionId) {
        const db = getDb();
        const rows = await db
          .select()
          .from(shipmentMilestones)
          .where(eq(shipmentMilestones.shipmentExecutionId, executionId))
          .orderBy(shipmentMilestones.createdAt);
        return rows.map((r) => r.payload as ShipmentMilestone);
      },
      async getLatestConfirmed(executionId, type) {
        const list = await this.listForExecution(executionId);
        return list
          .filter((m) => m.type === type && m.status === "CONFIRMED")
          .sort((a, b) =>
            (b.occurredAt ?? b.createdAt).localeCompare(
              a.occurredAt ?? a.createdAt,
            ),
          )[0];
      },
    },
    shipmentVesselAssociations: {
      async create(association) {
        const db = getDb();
        await db.insert(shipmentVesselAssociations).values({
          id: association.id,
          shipmentExecutionId: association.shipmentExecutionId,
          vesselMmsi: association.vesselMmsi ?? null,
          active: association.active ? "true" : "false",
          payload: association as unknown as Record<string, unknown>,
          createdAt: new Date(association.createdAt),
        });
        return association;
      },
      async update(association) {
        const db = getDb();
        await db
          .update(shipmentVesselAssociations)
          .set({
            vesselMmsi: association.vesselMmsi ?? null,
            active: association.active ? "true" : "false",
            payload: association as unknown as Record<string, unknown>,
          })
          .where(eq(shipmentVesselAssociations.id, association.id));
        return association;
      },
      async listForExecution(executionId) {
        const db = getDb();
        const rows = await db
          .select()
          .from(shipmentVesselAssociations)
          .where(
            eq(shipmentVesselAssociations.shipmentExecutionId, executionId),
          )
          .orderBy(shipmentVesselAssociations.createdAt);
        return rows.map((r) => r.payload as ShipmentVesselAssociation);
      },
      async getActive(executionId) {
        const list = await this.listForExecution(executionId);
        return list.find((a) => a.active);
      },
    },
    shipmentObservations: {
      async create(observation) {
        const db = getDb();
        await db.insert(shipmentObservations).values({
          id: observation.id,
          shipmentExecutionId: observation.shipmentExecutionId,
          kind: observation.kind,
          observedAt: new Date(observation.observedAt),
          payload: observation as unknown as Record<string, unknown>,
          createdAt: new Date(observation.createdAt),
        });
        return observation;
      },
      async listForExecution(executionId, limit = 100) {
        const db = getDb();
        const rows = await db
          .select()
          .from(shipmentObservations)
          .where(eq(shipmentObservations.shipmentExecutionId, executionId))
          .orderBy(desc(shipmentObservations.observedAt))
          .limit(limit);
        return rows.map((r) => r.payload as ShipmentObservation);
      },
      async getLatest(executionId) {
        const list = await this.listForExecution(executionId, 1);
        return list[0];
      },
      async countForExecution(executionId) {
        const db = getDb();
        const rows = await db
          .select({ id: shipmentObservations.id })
          .from(shipmentObservations)
          .where(eq(shipmentObservations.shipmentExecutionId, executionId));
        return rows.length;
      },
      async deleteOldest(executionId, keepNewest) {
        const all = await this.listForExecution(executionId, 10_000);
        const drop = all.slice(keepNewest);
        if (!drop.length) return 0;
        const db = getDb();
        for (const obs of drop) {
          await db
            .delete(shipmentObservations)
            .where(eq(shipmentObservations.id, obs.id));
        }
        return drop.length;
      },
    },
    shipmentMilestoneCandidates: {
      async create(candidate) {
        const db = getDb();
        await db.insert(shipmentMilestoneCandidates).values({
          id: candidate.id,
          shipmentExecutionId: candidate.shipmentExecutionId,
          proposedType: candidate.proposedType,
          source: candidate.source,
          status: candidate.status,
          inboundMessageId: candidate.inboundMessageId ?? null,
          payload: candidate as unknown as Record<string, unknown>,
          createdAt: new Date(candidate.createdAt),
        });
        return candidate;
      },
      async update(candidate) {
        const db = getDb();
        await db
          .update(shipmentMilestoneCandidates)
          .set({
            status: candidate.status,
            inboundMessageId: candidate.inboundMessageId ?? null,
            payload: candidate as unknown as Record<string, unknown>,
          })
          .where(eq(shipmentMilestoneCandidates.id, candidate.id));
        return candidate;
      },
      async get(id) {
        const db = getDb();
        const rows = await db
          .select()
          .from(shipmentMilestoneCandidates)
          .where(eq(shipmentMilestoneCandidates.id, id))
          .limit(1);
        return rows[0]
          ? (rows[0].payload as ShipmentMilestoneCandidate)
          : undefined;
      },
      async listForExecution(executionId) {
        const db = getDb();
        const rows = await db
          .select()
          .from(shipmentMilestoneCandidates)
          .where(
            eq(shipmentMilestoneCandidates.shipmentExecutionId, executionId),
          );
        return rows
          .map((r) => r.payload as ShipmentMilestoneCandidate)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      },
      async listPendingForExecution(executionId) {
        const list = await this.listForExecution(executionId);
        return list.filter((c) => c.status === "PENDING");
      },
    },
    operationalExceptions: {
      async create(exception) {
        const db = getDb();
        await db.insert(operationalExceptions).values({
          id: exception.id,
          shipmentExecutionId: exception.shipmentExecutionId,
          bookingId: exception.bookingId,
          type: exception.type,
          severity: exception.severity,
          status: exception.status,
          logicalKey: exception.logicalKey,
          ruleVersion: exception.ruleVersion,
          detectedAt: new Date(exception.detectedAt),
          lastSeenAt: new Date(exception.lastSeenAt),
          acknowledgedAt: exception.acknowledgedAt
            ? new Date(exception.acknowledgedAt)
            : null,
          resolvedAt: exception.resolvedAt
            ? new Date(exception.resolvedAt)
            : null,
          dismissedAt: exception.dismissedAt
            ? new Date(exception.dismissedAt)
            : null,
          payload: exception as unknown as Record<string, unknown>,
          createdAt: new Date(exception.createdAt),
          updatedAt: new Date(exception.updatedAt),
        });
        return exception;
      },
      async update(exception) {
        const db = getDb();
        await db
          .update(operationalExceptions)
          .set({
            type: exception.type,
            severity: exception.severity,
            status: exception.status,
            logicalKey: exception.logicalKey,
            ruleVersion: exception.ruleVersion,
            detectedAt: new Date(exception.detectedAt),
            lastSeenAt: new Date(exception.lastSeenAt),
            acknowledgedAt: exception.acknowledgedAt
              ? new Date(exception.acknowledgedAt)
              : null,
            resolvedAt: exception.resolvedAt
              ? new Date(exception.resolvedAt)
              : null,
            dismissedAt: exception.dismissedAt
              ? new Date(exception.dismissedAt)
              : null,
            payload: exception as unknown as Record<string, unknown>,
            updatedAt: new Date(exception.updatedAt),
          })
          .where(eq(operationalExceptions.id, exception.id));
        return exception;
      },
      async get(id) {
        const db = getDb();
        const rows = await db
          .select()
          .from(operationalExceptions)
          .where(eq(operationalExceptions.id, id))
          .limit(1);
        return rows[0]
          ? (rows[0].payload as OperationalException)
          : undefined;
      },
      async listForExecution(executionId) {
        const db = getDb();
        const rows = await db
          .select()
          .from(operationalExceptions)
          .where(eq(operationalExceptions.shipmentExecutionId, executionId));
        return rows
          .map((r) => r.payload as OperationalException)
          .sort((a, b) => b.detectedAt.localeCompare(a.detectedAt));
      },
      async listOpenForExecution(executionId) {
        const list = await this.listForExecution(executionId);
        return list.filter(
          (e) => e.status === "OPEN" || e.status === "ACKNOWLEDGED",
        );
      },
      async findActiveByLogicalKey(logicalKey) {
        const db = getDb();
        const rows = await db
          .select()
          .from(operationalExceptions)
          .where(eq(operationalExceptions.logicalKey, logicalKey));
        return rows
          .map((r) => r.payload as OperationalException)
          .find((e) => e.status === "OPEN" || e.status === "ACKNOWLEDGED");
      },
    },
    claimPreparations: {
      async create(claim) {
        const db = getDb();
        await db.insert(claimPreparations).values({
          id: claim.id,
          bookingId: claim.bookingId,
          shipmentExecutionId: claim.shipmentExecutionId ?? null,
          userId: claim.userId,
          reference: claim.reference,
          status: claim.status,
          claimType: claim.claimType,
          version: claim.version,
          supersedesClaimPreparationId:
            claim.supersedesClaimPreparationId ?? null,
          finalizedAt: claim.finalizedAt
            ? new Date(claim.finalizedAt)
            : null,
          payload: claim as unknown as Record<string, unknown>,
          createdAt: new Date(claim.createdAt),
          updatedAt: new Date(claim.updatedAt),
        });
        return claim;
      },
      async update(claim) {
        const db = getDb();
        await db
          .update(claimPreparations)
          .set({
            shipmentExecutionId: claim.shipmentExecutionId ?? null,
            reference: claim.reference,
            status: claim.status,
            claimType: claim.claimType,
            version: claim.version,
            supersedesClaimPreparationId:
              claim.supersedesClaimPreparationId ?? null,
            finalizedAt: claim.finalizedAt
              ? new Date(claim.finalizedAt)
              : null,
            payload: claim as unknown as Record<string, unknown>,
            updatedAt: new Date(claim.updatedAt),
          })
          .where(eq(claimPreparations.id, claim.id));
        return claim;
      },
      async get(id) {
        const db = getDb();
        const rows = await db
          .select()
          .from(claimPreparations)
          .where(eq(claimPreparations.id, id))
          .limit(1);
        return rows[0] ? (rows[0].payload as ClaimPreparation) : undefined;
      },
      async getByReference(reference) {
        const db = getDb();
        const rows = await db
          .select()
          .from(claimPreparations)
          .where(eq(claimPreparations.reference, reference))
          .limit(1);
        return rows[0] ? (rows[0].payload as ClaimPreparation) : undefined;
      },
      async listForUser(userId) {
        const db = getDb();
        const rows = await db
          .select()
          .from(claimPreparations)
          .where(eq(claimPreparations.userId, userId));
        return rows
          .map((r) => r.payload as ClaimPreparation)
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      },
      async listForBooking(bookingId) {
        const db = getDb();
        const rows = await db
          .select()
          .from(claimPreparations)
          .where(eq(claimPreparations.bookingId, bookingId));
        return rows
          .map((r) => r.payload as ClaimPreparation)
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      },
      async countForBooking(bookingId) {
        const list = await this.listForBooking(bookingId);
        return list.length;
      },
    },
    claimEvidenceItems: {
      async create(item) {
        const db = getDb();
        await db.insert(claimEvidenceItems).values({
          id: item.id,
          claimPreparationId: item.claimPreparationId,
          type: item.type,
          sourceId: item.sourceId ?? null,
          included: item.included,
          occurredAt: item.occurredAt ? new Date(item.occurredAt) : null,
          payload: item as unknown as Record<string, unknown>,
          createdAt: new Date(item.createdAt),
        });
        return item;
      },
      async update(item) {
        const db = getDb();
        await db
          .update(claimEvidenceItems)
          .set({
            type: item.type,
            sourceId: item.sourceId ?? null,
            included: item.included,
            occurredAt: item.occurredAt ? new Date(item.occurredAt) : null,
            payload: item as unknown as Record<string, unknown>,
          })
          .where(eq(claimEvidenceItems.id, item.id));
        return item;
      },
      async get(id) {
        const db = getDb();
        const rows = await db
          .select()
          .from(claimEvidenceItems)
          .where(eq(claimEvidenceItems.id, id))
          .limit(1);
        return rows[0] ? (rows[0].payload as ClaimEvidenceItem) : undefined;
      },
      async listForClaim(claimPreparationId) {
        const db = getDb();
        const rows = await db
          .select()
          .from(claimEvidenceItems)
          .where(eq(claimEvidenceItems.claimPreparationId, claimPreparationId));
        return rows
          .map((r) => r.payload as ClaimEvidenceItem)
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      },
      async delete(id) {
        const db = getDb();
        await db.delete(claimEvidenceItems).where(eq(claimEvidenceItems.id, id));
      },
    },
    audits: {
      async append(event) {
        const db = getDb();
        await db.insert(auditEvents).values({
          id: event.id,
          commercialRequestId: event.commercialRequestId,
          userId: event.userId ?? null,
          eventType: event.eventType,
          metadata: event.metadata ?? null,
          createdAt: new Date(event.createdAt),
        });
      },
      async listForRequest(requestId) {
        const db = getDb();
        const rows = await db
          .select()
          .from(auditEvents)
          .where(eq(auditEvents.commercialRequestId, requestId))
          .orderBy(auditEvents.createdAt);
        return rows.map(
          (r): AuditEvent => ({
            id: r.id,
            commercialRequestId: r.commercialRequestId,
            userId: r.userId,
            eventType: r.eventType as AuditEvent["eventType"],
            metadata: (r.metadata as Record<string, unknown>) ?? undefined,
            createdAt: toIso(r.createdAt)!,
          }),
        );
      },
      async listForUser(userId) {
        const db = getDb();
        const rows = await db
          .select()
          .from(auditEvents)
          .where(eq(auditEvents.userId, userId))
          .orderBy(auditEvents.createdAt);
        return rows.map(
          (r): AuditEvent => ({
            id: r.id,
            commercialRequestId: r.commercialRequestId,
            userId: r.userId,
            eventType: r.eventType as AuditEvent["eventType"],
            metadata: (r.metadata as Record<string, unknown>) ?? undefined,
            createdAt: toIso(r.createdAt)!,
          }),
        );
      },
    },
  };
}
