import type {
  OperationalException,
  OperationalExceptionAction,
  OperationalExceptionEvidence,
  OperationalExceptionSeverity,
  OperationalExceptionSource,
  OperationalExceptionType,
} from "@/domain/commercial/types";
import { getRepositories } from "@/server/commercial/repos";
import { newId } from "@/server/commercial/repos/memory";
import { EXCEPTION_RULE_VERSION } from "@/server/exceptions/thresholds";
import { recommendedActionsFor } from "@/server/exceptions/recommendedActions";

export interface ExceptionDraft {
  type: OperationalExceptionType;
  logicalKey: string;
  severity: OperationalExceptionSeverity;
  title: string;
  explanation: string;
  evidence: OperationalExceptionEvidence[];
  source: OperationalExceptionSource;
  recommendedActions?: OperationalExceptionAction[];
  active: boolean;
}

const AUTO_RESOLVE_TYPES = new Set<OperationalExceptionType>([
  "AIS_STALE",
  "ETA_SLIPPAGE",
  "ROUTE_DEVIATION",
  "ORIGIN_DWELL",
  "DESTINATION_DWELL",
  "MILESTONE_OVERDUE",
]);

export function canAutoResolve(type: OperationalExceptionType): boolean {
  return AUTO_RESOLVE_TYPES.has(type);
}

/**
 * Upsert OPEN/ACKNOWLEDGED by logical key, or auto-resolve when condition clears.
 */
export async function applyExceptionDraft(input: {
  shipmentExecutionId: string;
  bookingId: string;
  commercialRequestId?: string | null;
  draft: ExceptionDraft;
}): Promise<{
  created?: OperationalException;
  updated?: OperationalException;
  autoResolved?: OperationalException;
}> {
  const repos = getRepositories();
  const now = new Date().toISOString();
  const existing = await repos.operationalExceptions.findActiveByLogicalKey(
    input.draft.logicalKey,
  );

  if (input.draft.active) {
    if (existing) {
      const updated: OperationalException = {
        ...existing,
        severity: input.draft.severity,
        title: input.draft.title,
        explanation: input.draft.explanation,
        evidence: input.draft.evidence,
        recommendedActions:
          input.draft.recommendedActions ?? recommendedActionsFor(input.draft.type),
        lastSeenAt: now,
        updatedAt: now,
        ruleVersion: EXCEPTION_RULE_VERSION,
      };
      await repos.operationalExceptions.update(updated);
      await repos.audits.append({
        id: newId("audit"),
        commercialRequestId: input.commercialRequestId ?? null,
        eventType: "OPERATIONAL_EXCEPTION_UPDATED",
        metadata: {
          exceptionId: updated.id,
          type: updated.type,
          logicalKey: updated.logicalKey,
        },
        createdAt: now,
      });
      return { updated };
    }

    const created: OperationalException = {
      id: newId("opex"),
      shipmentExecutionId: input.shipmentExecutionId,
      bookingId: input.bookingId,
      type: input.draft.type,
      severity: input.draft.severity,
      status: "OPEN",
      logicalKey: input.draft.logicalKey,
      title: input.draft.title,
      explanation: input.draft.explanation,
      evidence: input.draft.evidence,
      recommendedActions:
        input.draft.recommendedActions ?? recommendedActionsFor(input.draft.type),
      source: input.draft.source,
      ruleVersion: EXCEPTION_RULE_VERSION,
      detectedAt: now,
      lastSeenAt: now,
      createdAt: now,
      updatedAt: now,
    };
    await repos.operationalExceptions.create(created);
    await repos.audits.append({
      id: newId("audit"),
      commercialRequestId: input.commercialRequestId ?? null,
      eventType: "OPERATIONAL_EXCEPTION_CREATED",
      metadata: {
        exceptionId: created.id,
        type: created.type,
        severity: created.severity,
        logicalKey: created.logicalKey,
      },
      createdAt: now,
    });
    return { created };
  }

  // Condition inactive — auto-resolve if allowed
  if (existing && canAutoResolve(input.draft.type)) {
    const resolved: OperationalException = {
      ...existing,
      status: "RESOLVED",
      resolvedAt: now,
      autoResolved: true,
      resolutionNote: "Condition no longer detected",
      updatedAt: now,
    };
    await repos.operationalExceptions.update(resolved);
    await repos.audits.append({
      id: newId("audit"),
      commercialRequestId: input.commercialRequestId ?? null,
      eventType: "OPERATIONAL_EXCEPTION_AUTO_RESOLVED",
      metadata: {
        exceptionId: resolved.id,
        type: resolved.type,
        logicalKey: resolved.logicalKey,
      },
      createdAt: now,
    });
    return { autoResolved: resolved };
  }

  return {};
}
