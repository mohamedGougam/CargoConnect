import type {
  ConfirmationDiff,
  ConfirmationDiffSeverity,
  ProceedSnapshot,
} from "@/domain/commercial/types";
import type { ExtractedConfirmationFields } from "./extractConfirmation";

export interface ConfirmationCompareResult {
  diffs: ConfirmationDiff[];
  termsChanged: boolean;
  hasMaterialChange: boolean;
  hasCriticalChange: boolean;
  matchedFields: string[];
}

/**
 * Compare extracted confirmation fields against immutable ProceedSnapshot.
 * Missing confirmation fields do not invent a change.
 */
export function compareConfirmationToSnapshot(input: {
  snapshot: ProceedSnapshot;
  extracted: ExtractedConfirmationFields;
  requestOrigin?: string | null;
  requestDestination?: string | null;
  requestQuantityTons?: number | null;
}): ConfirmationCompareResult {
  const diffs: ConfirmationDiff[] = [];
  const matchedFields: string[] = [];
  const snap = input.snapshot;
  const ex = input.extracted;

  compareNumeric({
    field: "rate",
    previous: snap.rate ?? null,
    confirmed: ex.confirmedRate,
    diffs,
    matchedFields,
    severityIfChanged: "CRITICAL_CHANGE",
    tolerance: 0.0001,
  });

  compareString({
    field: "currency",
    previous: snap.currency ?? null,
    confirmed: ex.currency,
    diffs,
    matchedFields,
    severityIfChanged: "CRITICAL_CHANGE",
    normalize: (v) => v.toUpperCase(),
  });

  compareString({
    field: "rateUnit",
    previous: snap.rateUnit ?? null,
    confirmed: ex.rateUnit,
    diffs,
    matchedFields,
    severityIfChanged: "MATERIAL_CHANGE",
    normalize: (v) => v.toUpperCase(),
  });

  compareString({
    field: "departure",
    previous: snap.departure ?? null,
    confirmed: ex.departureText,
    diffs,
    matchedFields,
    severityIfChanged: "MATERIAL_CHANGE",
    normalize: normalizeLaycan,
  });

  compareString({
    field: "vesselName",
    previous: snap.vesselName ?? null,
    confirmed: ex.vesselName,
    diffs,
    matchedFields,
    // New vessel when none selected is INFO addition, not a change of prior term
    severityIfChanged: snap.vesselName ? "MATERIAL_CHANGE" : "INFO",
    normalize: (v) => v.toLowerCase(),
    treatConfirmedOnlyAs: snap.vesselName ? undefined : "INFO",
  });

  compareString({
    field: "excludedCharges",
    previous: snap.excludedCharges ?? null,
    confirmed: ex.excludedCharges[0] ?? null,
    diffs,
    matchedFields,
    severityIfChanged: "MATERIAL_CHANGE",
    normalize: (v) => v.toLowerCase(),
  });

  compareString({
    field: "paymentTerms",
    previous: snap.paymentTerms ?? null,
    confirmed: ex.paymentTerms,
    diffs,
    matchedFields,
    severityIfChanged: "MATERIAL_CHANGE",
    normalize: (v) => v.toLowerCase(),
  });

  compareString({
    field: "origin",
    previous: input.requestOrigin ?? null,
    confirmed: ex.origin,
    diffs,
    matchedFields,
    severityIfChanged: "CRITICAL_CHANGE",
    normalize: (v) => v.toLowerCase(),
  });

  compareString({
    field: "destination",
    previous: input.requestDestination ?? null,
    confirmed: ex.destination,
    diffs,
    matchedFields,
    severityIfChanged: "CRITICAL_CHANGE",
    normalize: (v) => v.toLowerCase(),
  });

  compareNumeric({
    field: "cargoQuantity",
    previous: input.requestQuantityTons ?? null,
    confirmed: ex.cargoQuantity,
    diffs,
    matchedFields,
    severityIfChanged: "MATERIAL_CHANGE",
    tolerance: 0.5,
  });

  // Rate present on snapshot but different → already handled.
  // Freight estimate: only if both present and diverge > 1%
  if (
    snap.estimatedFreight != null &&
    ex.confirmedFreightAmount != null &&
    Math.abs(snap.estimatedFreight - ex.confirmedFreightAmount) >
      Math.max(1, snap.estimatedFreight * 0.01)
  ) {
    diffs.push({
      field: "estimatedFreight",
      previousValue: String(snap.estimatedFreight),
      confirmedValue: String(ex.confirmedFreightAmount),
      severity: "MATERIAL_CHANGE",
    });
  } else if (
    snap.estimatedFreight != null &&
    ex.confirmedFreightAmount != null
  ) {
    matchedFields.push("estimatedFreight");
  }

  if (snap.rate != null && ex.confirmedRate != null && approxEq(snap.rate, ex.confirmedRate)) {
    if (!matchedFields.includes("rate")) matchedFields.push("rate");
  }
  if (snap.departure && ex.departureText && normalizeLaycan(snap.departure) === normalizeLaycan(ex.departureText)) {
    if (!matchedFields.includes("departure")) matchedFields.push("departure");
  }

  const hasCriticalChange = diffs.some((d) => d.severity === "CRITICAL_CHANGE");
  const hasMaterialChange = diffs.some(
    (d) => d.severity === "MATERIAL_CHANGE" || d.severity === "CRITICAL_CHANGE",
  );

  return {
    diffs,
    termsChanged: hasMaterialChange,
    hasMaterialChange,
    hasCriticalChange,
    matchedFields: Array.from(new Set(matchedFields)),
  };
}

function compareNumeric(input: {
  field: string;
  previous: number | null;
  confirmed: number | null;
  diffs: ConfirmationDiff[];
  matchedFields: string[];
  severityIfChanged: ConfirmationDiffSeverity;
  tolerance: number;
}) {
  if (input.previous == null || input.confirmed == null) return;
  if (approxEq(input.previous, input.confirmed, input.tolerance)) {
    input.matchedFields.push(input.field);
    return;
  }
  input.diffs.push({
    field: input.field,
    previousValue: String(input.previous),
    confirmedValue: String(input.confirmed),
    severity: input.severityIfChanged,
  });
}

function compareString(input: {
  field: string;
  previous: string | null;
  confirmed: string | null;
  diffs: ConfirmationDiff[];
  matchedFields: string[];
  severityIfChanged: ConfirmationDiffSeverity;
  normalize: (v: string) => string;
  treatConfirmedOnlyAs?: ConfirmationDiffSeverity;
}) {
  if (!input.confirmed?.trim()) return;
  if (!input.previous?.trim()) {
    if (input.treatConfirmedOnlyAs === "INFO") {
      input.diffs.push({
        field: input.field,
        previousValue: null,
        confirmedValue: input.confirmed,
        severity: "INFO",
      });
    }
    // Confirmed-only addition is not a material change of selected terms
    return;
  }
  if (input.normalize(input.previous) === input.normalize(input.confirmed)) {
    input.matchedFields.push(input.field);
    return;
  }
  input.diffs.push({
    field: input.field,
    previousValue: input.previous,
    confirmedValue: input.confirmed,
    severity: input.severityIfChanged,
  });
}

function approxEq(a: number, b: number, tolerance = 0.0001): boolean {
  return Math.abs(a - b) <= tolerance;
}

function normalizeLaycan(value: string): string {
  return value
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[–—]/g, "-")
    .replace(/september/g, "sep")
    .trim();
}
