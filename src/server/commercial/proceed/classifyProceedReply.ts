import type { ProceedConfirmationStatus } from "@/domain/commercial/types";

export interface ProceedClassificationResult {
  classification: ProceedConfirmationStatus;
  reasons: string[];
}

/**
 * Deterministic proceed-reply classification.
 * Does NOT create bookings or mark commercial confirmation.
 */
export function classifyProceedReply(
  body: string,
  subject = "",
): ProceedConfirmationStatus {
  return classifyProceedReplyDetailed(body, subject).classification;
}

export function classifyProceedReplyDetailed(
  body: string,
  subject = "",
): ProceedClassificationResult {
  const text = `${subject}\n${body}`;
  const lower = text.toLowerCase();
  const reasons: string[] = [];

  const rejection =
    /\b(reject(ed)?|declin(e|ed)|cannot proceed|unable to proceed|no longer available|withdrawn|unfortunately .{0,40}(unavailable|cannot))\b/.test(
      lower,
    );
  if (rejection) {
    reasons.push("Rejection / unavailability language");
    return { classification: "PROCEED_REJECTED", reasons };
  }

  const moreInfo =
    /\b(please (provide|send|clarify|advise)|need(ed)? (more )?info|additional (info|information)|package dimensions|cargo dimensions|before we confirm|kindly advise)\b/.test(
      lower,
    ) &&
    !/\b(confirmed as per|booking reference)\b/.test(lower);
  if (moreInfo) {
    reasons.push("Broker asked for additional information");
    return { classification: "MORE_INFORMATION_REQUIRED", reasons };
  }

  const termsChangedLanguage =
    /\b(however|but|revised|final rate is|rate is now|updated (rate|terms|quote)|price (is )?now|we can proceed[, ]+however)\b/.test(
      lower,
    ) &&
    /\b(rate|usd|eur|gbp|\$|price|terms|laycan|departure)\b/.test(lower);

  const confirmationLanguage =
    /\b(confirm(ed|ation)?|we (can|will) proceed|accepted|as per your request|booking reference|nominated)\b/.test(
      lower,
    );

  if (termsChangedLanguage && confirmationLanguage) {
    reasons.push("Proceed language with changed commercial terms");
    return { classification: "TERMS_CHANGED", reasons };
  }
  if (termsChangedLanguage) {
    reasons.push("Changed commercial terms language");
    return { classification: "TERMS_CHANGED", reasons };
  }
  if (confirmationLanguage) {
    reasons.push("Confirmation / proceed acceptance language");
    return { classification: "PROCEED_CONFIRMED", reasons };
  }

  if (lower.trim().length > 0) {
    reasons.push("Non-empty reply without clear confirmation cues");
    return { classification: "GENERAL_REPLY", reasons };
  }
  reasons.push("Empty body");
  return { classification: "UNKNOWN", reasons };
}
