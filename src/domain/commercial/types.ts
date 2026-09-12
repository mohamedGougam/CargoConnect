import type { Port, Vessel, VesselType } from "@/domain/models";
import type { MaritimeCorridor, RouteSearchState, SearchCargoInfo } from "@/domain/search/types";

export type CommercialContactType =
  | "BROKER"
  | "SHIPPING_AGENT"
  | "CARRIER"
  | "PORT_COMMERCIAL"
  | "OTHER";

/**
 * Curated commercial directory entry — separate from core Port model.
 * Email may be absent when a legitimate public address could not be verified.
 */
export interface CommercialContact {
  id: string;
  organizationName: string;
  contactType: CommercialContactType;
  portId: string;
  portName: string;
  email?: string;
  phone?: string;
  website?: string;
  sourceUrl: string;
  verifiedAt: string;
  notes?: string;
}

export type CommercialRequestType = "QUOTE" | "RESERVATION";

export type CommercialRequestStatus =
  | "DRAFT"
  | "READY_TO_SEND"
  | "SENDING"
  | "SENT"
  | "SEND_FAILED"
  | "DELIVERY_SIMULATED"
  | "RESPONSE_RECEIVED"
  | "QUOTE_SELECTED"
  | "PROCEED_READY_TO_SEND"
  | "PROCEED_SENDING"
  | "AWAITING_CONFIRMATION"
  | "PROCEED_SEND_FAILED"
  | "CONFIRMATION_RECEIVED"
  | "CONFIRMATION_REVIEW_REQUIRED"
  | "COMMERCIALLY_CONFIRMED"
  | "CONFIRMATION_REJECTED"
  | "MORE_INFORMATION_REQUIRED"
  | "TERMS_CHANGED"
  | "CLOSED";

export type CommercialMessageKind =
  | "RFQ"
  | "RESERVATION_REQUEST"
  | "PROCEED_REQUEST"
  | "EMAIL_VERIFICATION"
  | "GENERAL";

export type ProceedConfirmationStatus =
  | "NONE"
  | "AWAITING"
  | "PROCEED_CONFIRMED"
  | "PROCEED_REJECTED"
  | "MORE_INFORMATION_REQUIRED"
  | "TERMS_CHANGED"
  | "GENERAL_REPLY"
  | "UNKNOWN";

/** Immutable commercial terms captured at proceed-send time. */
export interface ProceedSnapshot {
  quoteId: string;
  quoteVersion: number;
  organization: string;
  contactId?: string | null;
  currency?: string | null;
  rate?: number | null;
  rateUnit?: string | null;
  estimatedFreight?: number | null;
  totalPrice?: number | null;
  departure?: string | null;
  transit?: string | null;
  validity?: string | null;
  vesselName?: string | null;
  vesselType?: string | null;
  includedCharges?: string | null;
  excludedCharges?: string | null;
  paymentTerms?: string | null;
  inboundMessageId: string;
  capturedAt: string;
}

export interface SelectedCommercialQuote {
  id: string;
  commercialRequestId: string;
  commercialQuoteId: string;
  userId: string;
  selectedAt: string;
  selectionReason?: string | null;
  preferenceSnapshot?: string | null;
  /** Only one active selection per request until proceed is sent. */
  active: boolean;
  lockedAt?: string | null;
}

export type ProceedRequestStatus =
  | "DRAFT"
  | "READY_TO_SEND"
  | "SENDING"
  | "SENT"
  | "DELIVERY_SIMULATED"
  | "SEND_FAILED";

export interface CommercialProceedRequest {
  id: string;
  commercialRequestId: string;
  selectionId: string;
  commercialQuoteId: string;
  userId: string;
  status: ProceedRequestStatus;
  snapshot: ProceedSnapshot;
  subject: string;
  body: string;
  recipientEmail: string;
  recipientOrganization: string;
  recipientContactId?: string | null;
  recipientFromInbound?: boolean;
  inboundSenderTrust?: string | null;
  outboundMessageId?: string | null;
  createdAt: string;
  updatedAt: string;
  sentAt?: string | null;
  lastSendError?: string | null;
}
export interface CommercialCargoDetails {
  description?: string;
  type?: string;
  weightTons?: number;
  volumeCbm?: number;
  unitsPackages?: string;
}

export interface CommercialRecipientSnapshot {
  contactId: string;
  organizationName: string;
  contactType: CommercialContactType;
  portId: string;
  portName: string;
  email?: string;
  sourceUrl: string;
}

export interface CommercialAiDraft {
  subject: string;
  body: string;
  generator: "deterministic_template" | "llm";
  generatedAt: string;
}

export interface CommercialRequest {
  id: string;
  type: CommercialRequestType;
  userId: string;
  status: CommercialRequestStatus;

  /** Snapshot of route search at handoff — never re-parsed from scratch. */
  searchContext: RouteSearchState;
  origin?: Port;
  destination?: Port;
  selectedVessel?: Vessel | null;
  selectedPort?: Port | null;

  cargo: CommercialCargoDetails;
  preferredVesselType?: VesselType;
  requestedDeparture?: string;
  requestedArrival?: string;

  dangerousGoods?: boolean;
  oversizedProjectCargo?: boolean;
  handlingRequirements?: string;
  additionalNotes?: string;

  contactName?: string;
  companyName?: string;
  contactEmail?: string;
  contactPhone?: string;

  recipient?: CommercialRecipientSnapshot;
  aiDraft?: CommercialAiDraft;

  /**
   * Non-guessable reply correlation token (base64url).
   * Used in Reply-To: request+{token}@{inbound-domain}
   */
  replyToken?: string;

  /** Transparent commercial price status — never a fabricated rate. */
  verifiedFreightRateAvailable: false;
  freightRateNote: string;

  createdAt: string;
  updatedAt: string;
  sentAt?: string | null;
  lastSendError?: string | null;
  /** Active quote selection id when present. */
  selectedQuoteSelectionId?: string | null;
  /** Latest proceed-reply classification (not a booking). */
  confirmationStatus?: ProceedConfirmationStatus | null;
  /** Active commercial confirmation id awaiting / used for acknowledgement. */
  activeConfirmationId?: string | null;
  /** Booking id once commercially confirmed. */
  bookingId?: string | null;
}

export type ConfirmationDiffSeverity =
  | "INFO"
  | "MATERIAL_CHANGE"
  | "CRITICAL_CHANGE";

export interface ConfirmationDiff {
  field: string;
  previousValue: string | null;
  confirmedValue: string | null;
  severity: ConfirmationDiffSeverity;
}

export type CommercialConfirmationReviewStatus =
  | "PENDING_REVIEW"
  | "ACKNOWLEDGED"
  | "REJECTED_BY_USER"
  | "SUPERSEDED";

/** Structured extraction from a broker/carrier proceed reply — not a booking. */
export interface CommercialConfirmation {
  id: string;
  commercialRequestId: string;
  proceedRequestId: string;
  inboundMessageId: string;
  userId: string;

  classification: ProceedConfirmationStatus;
  reviewStatus: CommercialConfirmationReviewStatus;

  confirmedByOrganization?: string | null;
  confirmedByEmail?: string | null;
  senderTrust?: InboundSenderTrust | null;

  bookingReference?: string | null;
  carrierReference?: string | null;
  brokerReference?: string | null;

  vesselName?: string | null;
  vesselImo?: string | null;
  vesselMmsi?: string | null;

  confirmedRate?: number | null;
  currency?: string | null;
  rateUnit?: string | null;
  confirmedFreightAmount?: number | null;

  laycanStart?: string | null;
  laycanEnd?: string | null;
  departureDate?: string | null;
  eta?: string | null;
  /** Raw departure / laycan text when dates not split. */
  departureText?: string | null;

  origin?: string | null;
  destination?: string | null;

  cargoDescription?: string | null;
  cargoQuantity?: number | null;

  includedCharges?: string[];
  excludedCharges?: string[];

  paymentTerms?: string | null;
  requiredDocuments?: string[];
  nextSteps?: string[];

  termsChanged: boolean;
  diffs: ConfirmationDiff[];
  extractionConfidence: number;
  confidenceLabel: "High" | "Medium" | "Low";
  classificationReasons: string[];

  createdAt: string;
  updatedAt: string;
  reviewedAt?: string | null;
}

export type BookingStatus =
  | "COMMERCIALLY_CONFIRMED"
  | "DOCUMENTS_PENDING"
  | "READY_FOR_OPERATIONS"
  | "PAYMENT_PENDING"
  | "READY_FOR_EXECUTION"
  | "IN_EXECUTION"
  | "COMPLETED"
  | "CANCELLED";

/** Immutable commercial arrangement after user acknowledgement — not payment/execution. */
export interface Booking {
  id: string;
  /** User-facing CargoConnect reference, e.g. CC-2026-000123 */
  bookingReference: string;
  commercialRequestId: string;
  selectedQuoteId: string;
  proceedRequestId: string;
  confirmationId: string;
  userId: string;
  status: BookingStatus;

  origin?: string | null;
  destination?: string | null;
  cargoSnapshot: CommercialCargoDetails;
  /** Final accepted commercial terms (original proceed or revised after changed-terms). */
  commercialSnapshot: ProceedSnapshot;
  confirmationSnapshot: CommercialConfirmation;
  /** Present when booking was created from accepted changed terms. */
  acceptedCommercialSnapshotId?: string | null;
  vesselSnapshot?: {
    vesselName?: string | null;
    vesselImo?: string | null;
    vesselMmsi?: string | null;
  } | null;

  externalBookingReference?: string | null;
  brokerReference?: string | null;
  carrierReference?: string | null;
  brokerOrganization?: string | null;

  documentsReadyAt?: string | null;
  createdAt: string;
  confirmedAt: string;
  updatedAt: string;
}

/** Immutable record when user explicitly accepts broker-changed terms. */
export interface AcceptedCommercialSnapshot {
  id: string;
  commercialRequestId: string;
  confirmationId: string;
  proceedRequestId: string;
  previousProceedSnapshot: ProceedSnapshot;
  acceptedTerms: ProceedSnapshot;
  diffsAccepted: ConfirmationDiff[];
  acceptedByUserId: string;
  acceptedAt: string;
  bookingId?: string | null;
}

export type BookingDocumentType =
  | "COMMERCIAL_INVOICE"
  | "PACKING_LIST"
  | "CARGO_MANIFEST"
  | "BILL_OF_LADING_INSTRUCTIONS"
  | "CERTIFICATE_OF_ORIGIN"
  | "DANGEROUS_GOODS_DECLARATION"
  | "CARGO_DIMENSIONS"
  | "INSURANCE_CERTIFICATE"
  | "EXPORT_DOCUMENTATION"
  | "CUSTOMS_DOCUMENTATION"
  | "MSDS"
  | "LETTER_OF_AUTHORIZATION"
  | "OTHER";

export type DocumentRequirementSource = "SYSTEM" | "BROKER_REQUEST" | "USER_ADDED";

export type DocumentRequirementStatus =
  | "MISSING"
  | "UPLOADED"
  | "REVIEW_REQUIRED"
  | "ACCEPTED"
  | "REJECTED"
  | "NOT_REQUIRED";

export interface BookingDocumentRequirement {
  id: string;
  bookingId: string;
  documentType: BookingDocumentType;
  label: string;
  description?: string | null;
  required: boolean;
  source: DocumentRequirementSource;
  status: DocumentRequirementStatus;
  sourceInboundMessageId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export type DocumentValidationStatus =
  | "PENDING"
  | "PASS"
  | "WARNING"
  | "REVIEW_REQUIRED"
  | "FAIL";

/** Malware / content scan lifecycle — independent of business validation. */
export type DocumentScanStatus =
  | "PENDING_SCAN"
  | "CLEAN"
  | "INFECTED"
  | "SCAN_FAILED";

export interface BookingDocument {
  id: string;
  bookingId: string;
  requirementId?: string | null;
  documentType: BookingDocumentType;
  filename: string;
  storageKey: string;
  contentType: string;
  sizeBytes: number;
  uploadedByUserId: string;
  uploadedAt: string;
  validationStatus: DocumentValidationStatus;
  /** Malware scan state. Missing on legacy docs → treated as CLEAN in non-prod only. */
  scanStatus?: DocumentScanStatus;
  scanProvider?: string | null;
  scannedAt?: string | null;
  scanDetails?: string | null;
  quarantined?: boolean;
  extractedMetadata?: Record<string, unknown> | null;
  notes?: string | null;
  version: number;
  supersedesDocumentId?: string | null;
  isCurrent: boolean;
  reviewedAt?: string | null;
  reviewedByUserId?: string | null;
}

export type DocumentCheckSeverity = "INFO" | "WARNING" | "CRITICAL";

export interface DocumentValidationCheck {
  code: string;
  message: string;
  severity: DocumentCheckSeverity;
  passed: boolean;
}

export interface DocumentValidationResult {
  id: string;
  documentId: string;
  bookingId: string;
  status: DocumentValidationStatus;
  checks: DocumentValidationCheck[];
  extractedFields: Record<string, unknown>;
  mismatches: string[];
  validatedAt: string;
}

/** Operational handoff — CargoConnect summary, not a carrier/customs document. */
export type OperationalHandoffStatus =
  | "DRAFT"
  | "READY_FOR_REVIEW"
  | "FINALIZED";

export type HandoffWarningSeverity = "INFO" | "WARNING" | "CRITICAL";

export interface HandoffFieldProvenance {
  field: string;
  displayValue: string;
  source: string;
}

export interface HandoffWarning {
  code: string;
  message: string;
  severity: HandoffWarningSeverity;
}

export interface HandoffMissingItem {
  code: string;
  message: string;
}

export interface HandoffDocumentManifestEntry {
  documentType: BookingDocumentType;
  label: string;
  required: boolean;
  uploaded: boolean;
  filename?: string | null;
  version?: number | null;
  validationLabel: string;
  source: string;
  /** Document id of current version when uploaded — never a storage key. */
  documentId?: string | null;
}

export interface OperationalHandoff {
  id: string;
  /** User-facing reference, e.g. HO-CC-2026-000123-V1 */
  handoffReference: string;
  bookingId: string;
  userId: string;
  status: OperationalHandoffStatus;
  version: number;
  supersedesHandoffId?: string | null;

  bookingSnapshot: {
    bookingReference: string;
    status: BookingStatus;
    externalBookingReference?: string | null;
    brokerReference?: string | null;
    carrierReference?: string | null;
    brokerOrganization?: string | null;
    confirmedAt: string;
    documentsReadyAt?: string | null;
  };
  commercialSnapshot: ProceedSnapshot & {
    sourceLabel: string;
  };
  shipmentSnapshot: {
    origin?: string | null;
    destination?: string | null;
    cargoDescription?: string | null;
    quantityTons?: number | null;
    unit: string;
    volumeCbm?: number | null;
    unitsPackages?: string | null;
    dangerousGoods?: boolean | null;
  };
  vesselSnapshot: {
    vesselName?: string | null;
    vesselImo?: string | null;
    vesselMmsi?: string | null;
    vesselType?: string | null;
  };
  contactsSnapshot: {
    requesterName?: string | null;
    requesterEmail?: string | null;
    brokerOrganization?: string | null;
    brokerEmail?: string | null;
    brokerPhone?: string | null;
  };
  documentManifest: HandoffDocumentManifestEntry[];
  warnings: HandoffWarning[];
  missingInformation: HandoffMissingItem[];
  provenance: HandoffFieldProvenance[];

  operationsContactName?: string | null;
  operationsContactEmail?: string | null;
  operationsContactPhone?: string | null;
  /** User-entered notes — never AI-invented instructions. */
  operationalNotes?: string | null;
  /** Deterministic short summary from structured facts only. */
  operationalSummary?: string | null;

  generatedAt: string;
  reviewedAt?: string | null;
  finalizedAt?: string | null;
  finalizedByUserId?: string | null;
  updatedAt: string;
}

/** Primary operational workflow status — never set from AIS alone past observations. */
export type ShipmentExecutionStatus =
  | "READY_FOR_OPERATIONS"
  | "LOADING_PLANNED"
  | "LOADED"
  | "IN_TRANSIT"
  | "ARRIVED"
  | "DISCHARGED"
  | "DELIVERED"
  | "COMPLETED";

export type ShipmentMilestoneType =
  | "LOADING_PLANNED"
  | "LOADED"
  | "DEPARTED"
  | "IN_TRANSIT"
  | "ARRIVED"
  | "DISCHARGED"
  | "DELIVERED"
  | "COMPLETED"
  | "VESSEL_AT_ORIGIN"
  | "VESSEL_LEFT_ORIGIN_AREA"
  | "VESSEL_UNDERWAY"
  | "VESSEL_NEAR_DESTINATION"
  | "VESSEL_AT_DESTINATION"
  | "AIS_SIGNAL_STALE";

export type ShipmentMilestoneStatus = "PLANNED" | "CONFIRMED" | "CANCELLED";

export type ShipmentMilestoneSource =
  | "USER"
  | "BROKER_EMAIL"
  | "AIS_OBSERVATION"
  | "SYSTEM";

export type MilestoneCandidateStatus = "PENDING" | "CONFIRMED" | "DISMISSED";

export interface ShipmentMilestoneCandidate {
  id: string;
  shipmentExecutionId: string;
  proposedType: ShipmentMilestoneType;
  source: "BROKER_EMAIL" | "AIS_OBSERVATION" | "SYSTEM";
  sourceReference?: string | null;
  /** Inbound message id when source is BROKER_EMAIL */
  inboundMessageId?: string | null;
  proposedOccurredAt?: string | null;
  confidence: number;
  evidenceText?: string | null;
  senderTrust?: string | null;
  fromAddress?: string | null;
  status: MilestoneCandidateStatus;
  conflictWarning?: string | null;
  corroborationNote?: string | null;
  createdAt: string;
  reviewedAt?: string | null;
  reviewedByUserId?: string | null;
}

export interface ShipmentExecution {
  id: string;
  bookingId: string;
  userId: string;
  status: ShipmentExecutionStatus;
  originPortId?: string | null;
  destinationPortId?: string | null;
  vesselId?: string | null;
  vesselMmsi?: string | null;
  vesselImo?: string | null;
  vesselName?: string | null;
  plannedLoadStart?: string | null;
  plannedLoadEnd?: string | null;
  actualLoadedAt?: string | null;
  actualDepartedAt?: string | null;
  actualArrivedAt?: string | null;
  actualDischargedAt?: string | null;
  actualDeliveredAt?: string | null;
  completedAt?: string | null;
  completedByUserId?: string | null;
  plannedEta?: string | null;
  latestObservedEta?: string | null;
  handoffId?: string | null;
  closeoutSummary?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ShipmentMilestone {
  id: string;
  shipmentExecutionId: string;
  type: ShipmentMilestoneType;
  status: ShipmentMilestoneStatus;
  occurredAt?: string | null;
  expectedAt?: string | null;
  source: ShipmentMilestoneSource;
  sourceReference?: string | null;
  notes?: string | null;
  /** Supporting AIS observation context — not proof of cargo events. */
  observationContext?: Record<string, unknown> | null;
  /** Correction metadata — originals preserved. */
  correction?: {
    originalOccurredAt?: string | null;
    correctedOccurredAt: string;
    correctedByUserId: string;
    correctedAt: string;
    reason?: string | null;
  } | null;
  createdAt: string;
}

export interface ShipmentVesselAssociation {
  id: string;
  shipmentExecutionId: string;
  vesselId?: string | null;
  vesselMmsi?: string | null;
  vesselImo?: string | null;
  vesselName?: string | null;
  associationMethod: "MMSI" | "IMO" | "NAME_CONFIRMED" | "HANDOFF_SNAPSHOT";
  active: boolean;
  confirmedByUserId?: string | null;
  confirmedAt?: string | null;
  supersededAt?: string | null;
  notes?: string | null;
  createdAt: string;
}

export type ShipmentObservationKind =
  | "NEAR_ORIGIN"
  | "LEFT_ORIGIN_AREA"
  | "UNDERWAY"
  | "NEAR_DESTINATION"
  | "AT_DESTINATION"
  | "PERIODIC_TRACK"
  | "STALE"
  | "POSITION";

export interface ShipmentObservation {
  id: string;
  shipmentExecutionId: string;
  kind: ShipmentObservationKind;
  latitude: number;
  longitude: number;
  sog?: number | null;
  cog?: number | null;
  heading?: number | null;
  navStatus?: string | null;
  aisDestination?: string | null;
  aisEta?: string | null;
  observedAt: string;
  source: string;
  freshnessLabel: "live" | "recent" | "delayed" | "stale";
  createdAt: string;
}

/** Attention item — not an incident-management system. */
export type OperationalExceptionType =
  | "AIS_STALE"
  | "ETA_SLIPPAGE"
  | "ROUTE_DEVIATION"
  | "VESSEL_SUBSTITUTION"
  | "SOURCE_CONFLICT"
  | "ORIGIN_DWELL"
  | "DESTINATION_DWELL"
  | "DOCUMENT_REGRESSION"
  | "MILESTONE_OVERDUE";

export type OperationalExceptionSeverity = "INFO" | "WARNING" | "HIGH";

export type OperationalExceptionStatus =
  | "OPEN"
  | "ACKNOWLEDGED"
  | "RESOLVED"
  | "DISMISSED";

export type OperationalExceptionSource =
  | "AIS"
  | "EMAIL"
  | "DOCUMENT"
  | "SYSTEM";

export interface OperationalExceptionEvidence {
  label: string;
  value: string;
  reference?: string | null;
}

export interface OperationalExceptionAction {
  id: string;
  label: string;
}

export interface OperationalException {
  id: string;
  shipmentExecutionId: string;
  bookingId: string;
  type: OperationalExceptionType;
  severity: OperationalExceptionSeverity;
  status: OperationalExceptionStatus;
  /** Deduplication key: executionId + type + context */
  logicalKey: string;
  title: string;
  explanation: string;
  evidence: OperationalExceptionEvidence[];
  recommendedActions: OperationalExceptionAction[];
  source: OperationalExceptionSource;
  ruleVersion: string;
  detectedAt: string;
  lastSeenAt: string;
  acknowledgedAt?: string | null;
  acknowledgedByUserId?: string | null;
  resolvedAt?: string | null;
  resolvedByUserId?: string | null;
  resolutionNote?: string | null;
  dismissedAt?: string | null;
  dismissedByUserId?: string | null;
  dismissalNote?: string | null;
  autoResolved?: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Evidence-preparation dossier — not a liability determination. */
export type ClaimPreparationStatus =
  | "DRAFT"
  | "READY_FOR_REVIEW"
  | "FINALIZED"
  | "CLOSED";

export type ClaimType =
  | "DELAY"
  | "DEMURRAGE_PREPARATION"
  | "VESSEL_SUBSTITUTION"
  | "MILESTONE_DISPUTE"
  | "DOCUMENT_DISPUTE"
  | "DELIVERY_DELAY"
  | "OTHER";

export type ClaimEvidenceType =
  | "EMAIL"
  | "DOCUMENT"
  | "AIS_OBSERVATION"
  | "MILESTONE"
  | "BOOKING_SNAPSHOT"
  | "COMMERCIAL_SNAPSHOT"
  | "EXCEPTION"
  | "HANDOFF"
  | "USER_NOTE";

export interface ClaimTimelineEntry {
  id: string;
  occurredAt: string;
  title: string;
  factualSummary: string;
  sourceLabel: string;
  evidenceItemId?: string | null;
  conflictGroupId?: string | null;
}

export interface ClaimDurationFact {
  id: string;
  label: string;
  /** Neutral label e.g. "Observed arrival difference" */
  displayLabel: string;
  startAt: string;
  endAt: string;
  elapsedMs: number;
  elapsedLabel: string;
  note?: string | null;
}

export interface ClaimMissingEvidence {
  id: string;
  label: string;
  reason: string;
}

export interface ClaimEvidenceItem {
  id: string;
  claimPreparationId: string;
  type: ClaimEvidenceType;
  sourceId?: string | null;
  title: string;
  occurredAt?: string | null;
  sourceLabel: string;
  factualSummary?: string | null;
  included: boolean;
  /** Compact register code e.g. E1 */
  registerCode?: string | null;
  createdAt: string;
}

export interface ClaimPreparation {
  id: string;
  bookingId: string;
  shipmentExecutionId?: string | null;
  userId: string;
  reference: string;
  status: ClaimPreparationStatus;
  claimType: ClaimType;
  title: string;
  description?: string | null;
  relatedExceptionIds: string[];
  issueStartedAt?: string | null;
  issueEndedAt?: string | null;
  claimedCurrency?: string | null;
  claimedAmount?: number | null;
  claimedAmountSource?: string | null;
  claimedAmountNote?: string | null;
  userNotes?: string | null;
  timelineSnapshot: ClaimTimelineEntry[];
  durationFacts: ClaimDurationFact[];
  missingEvidence: ClaimMissingEvidence[];
  warnings: string[];
  evidenceSnapshot?: ClaimEvidenceItem[] | null;
  version: number;
  supersedesClaimPreparationId?: string | null;
  createdAt: string;
  updatedAt: string;
  finalizedAt?: string | null;
  finalizedByUserId?: string | null;
  closedAt?: string | null;
  closedByUserId?: string | null;
}

export type InboundSenderTrust =
  | "EXPECTED_SENDER"
  | "OTHER_SENDER"
  | "UNKNOWN";

export type CommercialResponseClassification =
  | "QUOTE"
  | "AVAILABILITY_RESPONSE"
  | "RESERVATION_RESPONSE"
  | "INFORMATION_REQUEST"
  | "GENERAL_REPLY"
  | "UNKNOWN";

/** Structured quote extracted from an inbound broker reply — not authoritative. */
export type CommercialQuoteStatus =
  | "RECEIVED"
  | "PARSED"
  | "REVIEWED"
  | "SUPERSEDED"
  | "EXPIRED";

export interface QuoteFieldCorrection {
  field: string;
  originalValue: unknown;
  correctedValue: unknown;
  correctedByUserId: string;
  correctedAt: string;
}

export interface CommercialQuote {
  id: string;
  commercialRequestId: string;
  inboundMessageId: string;
  /** Snapshot of responding organization when known. */
  organizationName?: string | null;
  contactId?: string | null;
  currency?: string | null;
  totalPrice?: number | null;
  priceBasis?: string | null;
  freightRate?: number | null;
  rateUnit?: string | null;
  quantityTons?: number | null;
  origin?: string | null;
  destination?: string | null;
  vesselName?: string | null;
  vesselType?: string | null;
  estimatedDeparture?: string | null;
  estimatedArrival?: string | null;
  transitTime?: string | null;
  validityUntil?: string | null;
  freeTime?: string | null;
  demurrage?: string | null;
  detention?: string | null;
  includedCharges?: string | null;
  excludedCharges?: string | null;
  paymentTerms?: string | null;
  commercialTerms?: string | null;
  notes?: string | null;
  /** 0–1 heuristic confidence for deterministic/LLM extraction. */
  extractionConfidence: number;
  extractionMethod: "deterministic" | "llm" | "hybrid" | "manual";
  responseClassification: CommercialResponseClassification;
  quoteStatus?: CommercialQuoteStatus;
  version?: number;
  supersedesQuoteId?: string | null;
  isLatest?: boolean;
  /** Manual field corrections — originals preserved. */
  corrections?: QuoteFieldCorrection[];
  createdAt: string;
  updatedAt: string;
}

export type QuoteComparisonPreference =
  | "best_overall"
  | "lowest_cost"
  | "fastest_transit"
  | "earliest_departure"
  | "custom";

export interface QuoteComparisonWeights {
  cost: number;
  departure: number;
  transit: number;
  completeness: number;
}

export type QuoteExpiryState = "valid" | "expiring_soon" | "expired" | "unknown";

export type NormalizedRateUnit =
  | "MT"
  | "M3"
  | "LUMP_SUM"
  | "TEU"
  | "OTHER"
  | "UNKNOWN";

/** Derived comparison view — never mutates the stored CommercialQuote. */
export interface NormalizedCommercialQuote {
  quoteId: string;
  requestId: string;
  inboundMessageId: string;
  organization: string;
  contactId?: string | null;
  currency: string | null;
  quotedAmount: number | null;
  rate: number | null;
  rateUnit: NormalizedRateUnit;
  /** Estimated freight amount in original currency when calculable. */
  estimatedFreightAmount: number | null;
  estimatedFreightLabel: string;
  normalizedTotal: number | null;
  normalizedCurrency: string | null;
  fxApplied: boolean;
  fxRate: number | null;
  fxSource: string | null;
  fxTimestamp: string | null;
  estimatedDeparture: string | null;
  departureWindowStart: string | null;
  departureWindowEnd: string | null;
  departureSortKey: number | null;
  transitDaysMin: number | null;
  transitDaysMax: number | null;
  estimatedArrival: string | null;
  validityUntil: string | null;
  expiryState: QuoteExpiryState;
  vesselName: string | null;
  vesselType: string | null;
  includedCharges: string[];
  excludedCharges: string[];
  paymentTerms: string | null;
  commercialTerms: string[];
  completenessScore: number;
  extractionConfidence: number;
  confidenceLabel: "High" | "Medium" | "Low";
  priceComparable: boolean;
  isLatest: boolean;
  version: number;
  supersedesQuoteId: string | null;
  quoteStatus: CommercialQuoteStatus;
  warnings: string[];
  hasManualCorrections: boolean;
}

/** Client/server handoff payload before auth completes. */
export interface PendingCommercialIntent {
  id: string;
  workflow: "price" | "quote" | "reservation";
  search: RouteSearchState;
  selectedVessel?: Vessel | null;
  selectedPort?: Port | null;
  createdAt: string;
}

/** Deterministic draft used to seed forms from RouteSearchState. */
export interface CommercialRequestDraft {
  type: CommercialRequestType;
  searchContext: RouteSearchState;
  origin?: Port;
  destination?: Port;
  selectedVessel?: Vessel | null;
  selectedPort?: Port | null;
  cargo: CommercialCargoDetails;
  preferredVesselType?: VesselType;
  corridor?: MaritimeCorridor;
  relevantVesselIds: string[];
  originalQuery: string;
  verifiedFreightRateAvailable: false;
  freightRateNote: string;
  suggestedRecipientPortId?: string;
}

export const NO_VERIFIED_RATE_NOTE =
  "Not available from connected data sources. CargoConnect does not invent live freight rates.";

export function createEmptyCargo(
  from?: SearchCargoInfo,
): CommercialCargoDetails {
  return {
    description: from?.description,
    weightTons: from?.quantityTons,
  };
}
