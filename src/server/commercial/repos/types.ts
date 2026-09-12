import type {
  AcceptedCommercialSnapshot,
  Booking,
  BookingDocument,
  BookingDocumentRequirement,
  CommercialAiDraft,
  CommercialCargoDetails,
  CommercialConfirmation,
  CommercialContact,
  CommercialProceedRequest,
  CommercialQuote,
  CommercialRecipientSnapshot,
  CommercialRequest,
  CommercialResponseClassification,
  DocumentValidationResult,
  InboundSenderTrust,
  OperationalHandoff,
  PendingCommercialIntent,
  SelectedCommercialQuote,
  ShipmentExecution,
  ShipmentMilestone,
  ShipmentMilestoneCandidate,
  ShipmentObservation,
  ShipmentVesselAssociation,
} from "@/domain/commercial/types";

export type {
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
} from "@/domain/commercial/types";

/** Auth user record — passwordHash never exposed to clients. */
export interface StoredUser {
  id: string;
  email: string;
  passwordHash: string;
  fullName: string;
  companyName?: string;
  phone?: string;
  /** ISO timestamp when email was verified; null/undefined = unverified. */
  emailVerifiedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EmailVerificationTokenRecord {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: string;
  usedAt?: string | null;
  createdAt: string;
}

export type AuditEventType =
  | "INTENT_CREATED"
  | "REQUEST_CREATED"
  | "REQUEST_UPDATED"
  | "REQUEST_READY_TO_SEND"
  | "SEND_STARTED"
  | "EMAIL_SENT"
  | "EMAIL_SEND_FAILED"
  | "DELIVERY_SIMULATED"
  | "USER_EMAIL_VERIFICATION_SENT"
  | "USER_EMAIL_VERIFIED"
  | "USER_EMAIL_VERIFICATION_FAILED"
  | "INBOUND_EMAIL_RECEIVED"
  | "INBOUND_EMAIL_CORRELATED"
  | "INBOUND_EMAIL_UNMATCHED"
  | "COMMERCIAL_RESPONSE_RECEIVED"
  | "QUOTE_EXTRACTION_STARTED"
  | "QUOTE_EXTRACTED"
  | "QUOTE_EXTRACTION_FAILED"
  | "QUOTE_NORMALIZED"
  | "QUOTE_CORRECTED"
  | "QUOTE_SUPERSEDED"
  | "QUOTE_COMPARISON_VIEWED"
  | "QUOTE_SELECTED"
  | "QUOTE_SELECTION_CHANGED"
  | "QUOTE_DESELECTED"
  | "PROCEED_REQUEST_CREATED"
  | "PROCEED_REQUEST_READY"
  | "PROCEED_SEND_STARTED"
  | "PROCEED_SENT"
  | "PROCEED_SEND_FAILED"
  | "PROCEED_CONFIRMATION_RECEIVED"
  | "PROCEED_CONFIRMATION_CLASSIFIED"
  | "CONFIRMATION_TERMS_COMPARED"
  | "CONFIRMATION_REVIEWED"
  | "COMMERCIAL_AGREEMENT_CONFIRMED"
  | "BOOKING_CREATED"
  | "PROCEED_REJECTED"
  | "PROCEED_MORE_INFO_REQUIRED"
  | "PROCEED_TERMS_CHANGED"
  | "CHANGED_TERMS_ACCEPTED"
  | "DOCUMENT_REQUIREMENTS_CREATED"
  | "DOCUMENT_UPLOADED"
  | "DOCUMENT_REPLACED"
  | "DOCUMENT_VALIDATED"
  | "DOCUMENT_WARNING_CREATED"
  | "DOCUMENT_REVIEWED"
  | "DOCUMENT_PACKAGE_READY"
  | "DOCUMENT_SCAN_STARTED"
  | "DOCUMENT_SCAN_CLEAN"
  | "DOCUMENT_SCAN_INFECTED"
  | "DOCUMENT_SCAN_FAILED"
  | "DOCUMENT_QUARANTINED"
  | "HANDOFF_CREATED"
  | "HANDOFF_REGENERATED"
  | "HANDOFF_REVIEWED"
  | "HANDOFF_FINALIZED"
  | "HANDOFF_PDF_GENERATED"
  | "HANDOFF_PACKAGE_DOWNLOADED"
  | "SHIPMENT_EXECUTION_CREATED"
  | "VESSEL_ASSOCIATED"
  | "VESSEL_ASSOCIATION_CHANGED"
  | "AIS_OBSERVATION_RECORDED"
  | "AIS_SIGNAL_STALE"
  | "MILESTONE_CANDIDATE_CREATED"
  | "MILESTONE_CONFIRMED"
  | "LOADING_CONFIRMED"
  | "DEPARTURE_CONFIRMED"
  | "ARRIVAL_CONFIRMED"
  | "LIVE_AIS_OBSERVATION_INGESTED"
  | "MILESTONE_CANDIDATE_FROM_EMAIL"
  | "MILESTONE_CANDIDATE_DISMISSED"
  | "MILESTONE_EVIDENCE_CORROBORATED"
  | "MILESTONE_SOURCE_CONFLICT"
  | "DISCHARGE_CONFIRMED"
  | "DELIVERY_CONFIRMED"
  | "SHIPMENT_COMPLETED"
  | "MILESTONE_CORRECTED"
  | "OPERATIONAL_EXCEPTION_CREATED"
  | "OPERATIONAL_EXCEPTION_UPDATED"
  | "OPERATIONAL_EXCEPTION_ACKNOWLEDGED"
  | "OPERATIONAL_EXCEPTION_DISMISSED"
  | "OPERATIONAL_EXCEPTION_RESOLVED"
  | "OPERATIONAL_EXCEPTION_AUTO_RESOLVED"
  | "CLAIM_PREPARATION_CREATED"
  | "CLAIM_EVIDENCE_ADDED"
  | "CLAIM_EVIDENCE_REMOVED"
  | "CLAIM_NOTE_UPDATED"
  | "CLAIM_AMOUNT_UPDATED"
  | "CLAIM_REVIEWED"
  | "CLAIM_FINALIZED"
  | "CLAIM_VERSION_CREATED"
  | "CLAIM_PDF_GENERATED"
  | "CLAIM_CLOSED";

export interface AuditEvent {
  id: string;
  /** Null for user-level events (e.g. email verification). */
  commercialRequestId: string | null;
  userId?: string | null;
  eventType: AuditEventType;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export type MessageDeliveryStatus =
  | "QUEUED"
  | "SENT"
  | "FAILED"
  | "SIMULATED"
  | "RECEIVED";

export type MessageDirection = "OUTBOUND" | "INBOUND";

export type InboundCorrelationMethod =
  | "reply_token"
  | "in_reply_to"
  | "references"
  | "unmatched";

export interface CommercialMessage {
  id: string;
  /** Null when inbound could not be safely correlated. */
  commercialRequestId: string | null;
  direction: MessageDirection;
  /** Distinguishes RFQ vs proceed vs other outbound kinds. */
  messageKind?: import("@/domain/commercial/types").CommercialMessageKind | null;
  provider: string;
  providerMessageId?: string | null;
  internetMessageId?: string | null;
  inReplyTo?: string | null;
  referencesHeader?: string | null;
  fromAddress: string;
  fromName?: string | null;
  replyTo: string;
  toAddress: string;
  ccAddresses?: string | null;
  subject: string;
  bodySnapshot: string;
  htmlSnapshot?: string | null;
  deliveryStatus: MessageDeliveryStatus;
  errorMessage?: string | null;
  senderTrust?: InboundSenderTrust | null;
  correlationMethod?: InboundCorrelationMethod | null;
  responseClassification?: CommercialResponseClassification | null;
  rawMetadata?: Record<string, unknown> | null;
  createdAt: string;
  sentAt?: string | null;
  receivedAt?: string | null;
}

export interface CommercialMessageAttachment {
  id: string;
  commercialMessageId: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  providerAttachmentId?: string | null;
  storageReference?: string | null;
  createdAt: string;
}

export interface UserRepository {
  findByEmail(email: string): Promise<StoredUser | undefined>;
  findById(id: string): Promise<StoredUser | undefined>;
  create(user: StoredUser): Promise<StoredUser>;
  markEmailVerified(userId: string, verifiedAt: string): Promise<StoredUser | undefined>;
}

export interface EmailVerificationTokenRepository {
  create(token: EmailVerificationTokenRecord): Promise<void>;
  findValidByHash(tokenHash: string): Promise<EmailVerificationTokenRecord | undefined>;
  markUsed(id: string, usedAt: string): Promise<void>;
  invalidateActiveForUser(userId: string): Promise<void>;
  countRecentForUser(userId: string, sinceIso: string): Promise<number>;
}

export interface IntentRepository {
  save(intent: PendingCommercialIntent): Promise<void>;
  get(id: string): Promise<PendingCommercialIntent | undefined>;
  delete(id: string): Promise<void>;
}

export interface RequestRepository {
  save(request: CommercialRequest): Promise<CommercialRequest>;
  get(id: string): Promise<CommercialRequest | undefined>;
  listForUser(userId: string): Promise<CommercialRequest[]>;
  findByReplyToken(token: string): Promise<CommercialRequest | undefined>;
  /**
   * Atomically claim READY_TO_SEND | SEND_FAILED → SENDING.
   * Returns null if claim failed (already sending/sent/wrong owner).
   */
  claimForSend(
    id: string,
    userId: string,
  ): Promise<CommercialRequest | null>;
}

export interface ContactRepository {
  listAll(): Promise<CommercialContact[]>;
  getById(id: string): Promise<CommercialContact | undefined>;
  listForPort(portId: string): Promise<CommercialContact[]>;
  upsertMany(contacts: CommercialContact[]): Promise<void>;
}

export interface MessageRepository {
  create(message: CommercialMessage): Promise<CommercialMessage>;
  get(id: string): Promise<CommercialMessage | undefined>;
  listForRequest(requestId: string): Promise<CommercialMessage[]>;
  findByProviderMessageId(
    provider: string,
    providerMessageId: string,
  ): Promise<CommercialMessage | undefined>;
  findByInternetMessageId(
    internetMessageId: string,
  ): Promise<CommercialMessage | undefined>;
  countSuccessfulOutbound(requestId: string): Promise<number>;
}

export interface AttachmentRepository {
  createMany(attachments: CommercialMessageAttachment[]): Promise<void>;
  listForMessage(messageId: string): Promise<CommercialMessageAttachment[]>;
  listForRequest(requestId: string): Promise<CommercialMessageAttachment[]>;
}

export interface QuoteRepository {
  create(quote: CommercialQuote): Promise<CommercialQuote>;
  get(id: string): Promise<CommercialQuote | undefined>;
  update(quote: CommercialQuote): Promise<CommercialQuote>;
  listForRequest(requestId: string): Promise<CommercialQuote[]>;
}

export interface SelectionRepository {
  create(selection: SelectedCommercialQuote): Promise<SelectedCommercialQuote>;
  update(selection: SelectedCommercialQuote): Promise<SelectedCommercialQuote>;
  get(id: string): Promise<SelectedCommercialQuote | undefined>;
  getActiveForRequest(
    requestId: string,
  ): Promise<SelectedCommercialQuote | undefined>;
  listForRequest(requestId: string): Promise<SelectedCommercialQuote[]>;
  deactivateAllForRequest(requestId: string): Promise<void>;
}

export interface ProceedRequestRepository {
  create(proceed: CommercialProceedRequest): Promise<CommercialProceedRequest>;
  update(proceed: CommercialProceedRequest): Promise<CommercialProceedRequest>;
  get(id: string): Promise<CommercialProceedRequest | undefined>;
  getLatestForRequest(
    requestId: string,
  ): Promise<CommercialProceedRequest | undefined>;
  claimForSend(
    id: string,
    userId: string,
  ): Promise<CommercialProceedRequest | null>;
}

export interface ConfirmationRepository {
  create(confirmation: CommercialConfirmation): Promise<CommercialConfirmation>;
  update(confirmation: CommercialConfirmation): Promise<CommercialConfirmation>;
  get(id: string): Promise<CommercialConfirmation | undefined>;
  getLatestForRequest(
    requestId: string,
  ): Promise<CommercialConfirmation | undefined>;
  listForRequest(requestId: string): Promise<CommercialConfirmation[]>;
  claimForAcknowledge(
    id: string,
    userId: string,
  ): Promise<CommercialConfirmation | null>;
}

export interface BookingRepository {
  create(booking: Booking): Promise<Booking>;
  update(booking: Booking): Promise<Booking>;
  get(id: string): Promise<Booking | undefined>;
  getByReference(reference: string): Promise<Booking | undefined>;
  getForRequest(requestId: string): Promise<Booking | undefined>;
  listForUser(userId: string): Promise<Booking[]>;
  countForYear(year: number): Promise<number>;
}

export interface AcceptedSnapshotRepository {
  create(
    snapshot: AcceptedCommercialSnapshot,
  ): Promise<AcceptedCommercialSnapshot>;
  get(id: string): Promise<AcceptedCommercialSnapshot | undefined>;
  getForConfirmation(
    confirmationId: string,
  ): Promise<AcceptedCommercialSnapshot | undefined>;
}

export interface DocumentRequirementRepository {
  createMany(
    requirements: BookingDocumentRequirement[],
  ): Promise<BookingDocumentRequirement[]>;
  update(
    requirement: BookingDocumentRequirement,
  ): Promise<BookingDocumentRequirement>;
  get(id: string): Promise<BookingDocumentRequirement | undefined>;
  listForBooking(bookingId: string): Promise<BookingDocumentRequirement[]>;
}

export interface BookingDocumentRepository {
  create(doc: BookingDocument): Promise<BookingDocument>;
  update(doc: BookingDocument): Promise<BookingDocument>;
  get(id: string): Promise<BookingDocument | undefined>;
  listForBooking(bookingId: string): Promise<BookingDocument[]>;
  listCurrentForBooking(bookingId: string): Promise<BookingDocument[]>;
}

export interface DocumentValidationRepository {
  create(result: DocumentValidationResult): Promise<DocumentValidationResult>;
  getLatestForDocument(
    documentId: string,
  ): Promise<DocumentValidationResult | undefined>;
  listForBooking(bookingId: string): Promise<DocumentValidationResult[]>;
}

export interface OperationalHandoffRepository {
  create(handoff: OperationalHandoff): Promise<OperationalHandoff>;
  update(handoff: OperationalHandoff): Promise<OperationalHandoff>;
  get(id: string): Promise<OperationalHandoff | undefined>;
  getByReference(reference: string): Promise<OperationalHandoff | undefined>;
  listForBooking(bookingId: string): Promise<OperationalHandoff[]>;
  getLatestForBooking(
    bookingId: string,
  ): Promise<OperationalHandoff | undefined>;
}

export interface ShipmentExecutionRepository {
  create(execution: ShipmentExecution): Promise<ShipmentExecution>;
  update(execution: ShipmentExecution): Promise<ShipmentExecution>;
  get(id: string): Promise<ShipmentExecution | undefined>;
  getForBooking(bookingId: string): Promise<ShipmentExecution | undefined>;
  listForUser(userId: string): Promise<ShipmentExecution[]>;
  /** Non-COMPLETED executions with vessel association for watcher. */
  listActiveForWatcher(): Promise<ShipmentExecution[]>;
}

export interface ShipmentMilestoneRepository {
  create(milestone: ShipmentMilestone): Promise<ShipmentMilestone>;
  update(milestone: ShipmentMilestone): Promise<ShipmentMilestone>;
  get(id: string): Promise<ShipmentMilestone | undefined>;
  listForExecution(executionId: string): Promise<ShipmentMilestone[]>;
  getLatestConfirmed(
    executionId: string,
    type: import("@/domain/commercial/types").ShipmentMilestoneType,
  ): Promise<ShipmentMilestone | undefined>;
}

export interface ShipmentVesselAssociationRepository {
  create(
    association: ShipmentVesselAssociation,
  ): Promise<ShipmentVesselAssociation>;
  update(
    association: ShipmentVesselAssociation,
  ): Promise<ShipmentVesselAssociation>;
  listForExecution(
    executionId: string,
  ): Promise<ShipmentVesselAssociation[]>;
  getActive(
    executionId: string,
  ): Promise<ShipmentVesselAssociation | undefined>;
}

export interface ShipmentObservationRepository {
  create(observation: ShipmentObservation): Promise<ShipmentObservation>;
  listForExecution(
    executionId: string,
    limit?: number,
  ): Promise<ShipmentObservation[]>;
  getLatest(executionId: string): Promise<ShipmentObservation | undefined>;
  countForExecution(executionId: string): Promise<number>;
  deleteOldest(executionId: string, keepNewest: number): Promise<number>;
}

export interface ShipmentMilestoneCandidateRepository {
  create(
    candidate: ShipmentMilestoneCandidate,
  ): Promise<ShipmentMilestoneCandidate>;
  update(
    candidate: ShipmentMilestoneCandidate,
  ): Promise<ShipmentMilestoneCandidate>;
  get(id: string): Promise<ShipmentMilestoneCandidate | undefined>;
  listForExecution(
    executionId: string,
  ): Promise<ShipmentMilestoneCandidate[]>;
  listPendingForExecution(
    executionId: string,
  ): Promise<ShipmentMilestoneCandidate[]>;
}

export interface OperationalExceptionRepository {
  create(
    exception: import("@/domain/commercial/types").OperationalException,
  ): Promise<import("@/domain/commercial/types").OperationalException>;
  update(
    exception: import("@/domain/commercial/types").OperationalException,
  ): Promise<import("@/domain/commercial/types").OperationalException>;
  get(
    id: string,
  ): Promise<
    import("@/domain/commercial/types").OperationalException | undefined
  >;
  listForExecution(
    executionId: string,
  ): Promise<import("@/domain/commercial/types").OperationalException[]>;
  listOpenForExecution(
    executionId: string,
  ): Promise<import("@/domain/commercial/types").OperationalException[]>;
  findActiveByLogicalKey(
    logicalKey: string,
  ): Promise<
    import("@/domain/commercial/types").OperationalException | undefined
  >;
}

export interface ClaimPreparationRepository {
  create(
    claim: import("@/domain/commercial/types").ClaimPreparation,
  ): Promise<import("@/domain/commercial/types").ClaimPreparation>;
  update(
    claim: import("@/domain/commercial/types").ClaimPreparation,
  ): Promise<import("@/domain/commercial/types").ClaimPreparation>;
  get(
    id: string,
  ): Promise<
    import("@/domain/commercial/types").ClaimPreparation | undefined
  >;
  getByReference(
    reference: string,
  ): Promise<
    import("@/domain/commercial/types").ClaimPreparation | undefined
  >;
  listForUser(
    userId: string,
  ): Promise<import("@/domain/commercial/types").ClaimPreparation[]>;
  listForBooking(
    bookingId: string,
  ): Promise<import("@/domain/commercial/types").ClaimPreparation[]>;
  countForBooking(bookingId: string): Promise<number>;
}

export interface ClaimEvidenceItemRepository {
  create(
    item: import("@/domain/commercial/types").ClaimEvidenceItem,
  ): Promise<import("@/domain/commercial/types").ClaimEvidenceItem>;
  update(
    item: import("@/domain/commercial/types").ClaimEvidenceItem,
  ): Promise<import("@/domain/commercial/types").ClaimEvidenceItem>;
  get(
    id: string,
  ): Promise<
    import("@/domain/commercial/types").ClaimEvidenceItem | undefined
  >;
  listForClaim(
    claimPreparationId: string,
  ): Promise<import("@/domain/commercial/types").ClaimEvidenceItem[]>;
  delete(id: string): Promise<void>;
}

export interface AuditRepository {
  append(event: AuditEvent): Promise<void>;
  listForRequest(requestId: string): Promise<AuditEvent[]>;
  listForUser(userId: string): Promise<AuditEvent[]>;
}

export interface CommercialRepositories {
  users: UserRepository;
  verificationTokens: EmailVerificationTokenRepository;
  intents: IntentRepository;
  requests: RequestRepository;
  contacts: ContactRepository;
  messages: MessageRepository;
  attachments: AttachmentRepository;
  quotes: QuoteRepository;
  selections: SelectionRepository;
  proceedRequests: ProceedRequestRepository;
  confirmations: ConfirmationRepository;
  bookings: BookingRepository;
  acceptedSnapshots: AcceptedSnapshotRepository;
  documentRequirements: DocumentRequirementRepository;
  bookingDocuments: BookingDocumentRepository;
  documentValidations: DocumentValidationRepository;
  handoffs: OperationalHandoffRepository;
  shipmentExecutions: ShipmentExecutionRepository;
  shipmentMilestones: ShipmentMilestoneRepository;
  shipmentVesselAssociations: ShipmentVesselAssociationRepository;
  shipmentObservations: ShipmentObservationRepository;
  shipmentMilestoneCandidates: ShipmentMilestoneCandidateRepository;
  operationalExceptions: OperationalExceptionRepository;
  claimPreparations: ClaimPreparationRepository;
  claimEvidenceItems: ClaimEvidenceItemRepository;
  audits: AuditRepository;
  /** Reset in-memory / test stores only. */
  resetForTests?(): Promise<void>;
}

export type {
  CommercialAiDraft,
  CommercialCargoDetails,
  CommercialRecipientSnapshot,
  CommercialResponseClassification,
  InboundSenderTrust,
};
