import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { ClaimPreparation } from "@/domain/commercial/types";
import { getRepositories } from "@/server/commercial/repos";
import { newId } from "@/server/commercial/repos/memory";

const FOOTER =
  "CargoConnect evidence-preparation document. It does not determine contractual or legal liability.";

/**
 * Server-side deterministic claim dossier PDF.
 * No private storage keys.
 */
export async function generateClaimPdf(input: {
  claimId: string;
  userId: string;
}): Promise<{ bytes: Uint8Array; filename: string }> {
  const repos = getRepositories();
  const claim =
    (await repos.claimPreparations.get(input.claimId)) ??
    (await repos.claimPreparations.getByReference(input.claimId));
  if (!claim || claim.userId !== input.userId) {
    throw new Error("Forbidden");
  }
  const booking = await repos.bookings.get(claim.bookingId);
  if (!booking || booking.userId !== input.userId) {
    throw new Error("Forbidden");
  }

  const evidence =
    claim.evidenceSnapshot ??
    (await repos.claimEvidenceItems.listForClaim(claim.id)).filter(
      (e) => e.included,
    );

  const doc = await PDFDocument.create();
  doc.setTitle(`CargoConnect Claim ${claim.reference}`);
  doc.setProducer("CargoConnect");
  doc.setCreator("CargoConnect Claim Preparation");
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  let page = doc.addPage([612, 792]);
  let y = 752;
  const margin = 48;

  const ensureSpace = (need: number) => {
    if (y < need) {
      page.drawText(FOOTER, {
        x: margin,
        y: 28,
        size: 7,
        font,
        color: rgb(0.45, 0.45, 0.48),
      });
      page = doc.addPage([612, 792]);
      y = 752;
    }
  };

  const heading = (title: string) => {
    ensureSpace(36);
    y -= 6;
    page.drawText(title, {
      x: margin,
      y,
      size: 12,
      font: bold,
      color: rgb(0.05, 0.25, 0.28),
    });
    y -= 16;
  };

  const row = (label: string, value: string) => {
    ensureSpace(26);
    const safeLabel = label
      .replace(/→/g, "->")
      .replace(/[^\x20-\x7E]/g, "?")
      .slice(0, 40);
    page.drawText(safeLabel, {
      x: margin,
      y,
      size: 9,
      font: bold,
      color: rgb(0.35, 0.38, 0.42),
    });
    y -= 12;
    const lines = wrap(value, 95);
    for (const ln of lines) {
      ensureSpace(16);
      page.drawText(ln, {
        x: margin,
        y,
        size: 9,
        font,
        color: rgb(0.12, 0.14, 0.18),
      });
      y -= 12;
    }
    y -= 4;
  };

  page.drawText("CargoConnect Claim Preparation Dossier", {
    x: margin,
    y,
    size: 16,
    font: bold,
    color: rgb(0.05, 0.2, 0.22),
  });
  y -= 22;
  row("Reference", `${claim.reference} · v${claim.version}`);
  row("Status", claim.status);
  row("Type", claim.claimType.replace(/_/g, " "));
  row("Title", claim.title);

  heading("1. Claim Preparation Summary");
  row("Description", claim.description || "—");
  if (claim.finalizedAt) {
    row("Finalized", claim.finalizedAt);
  }

  heading("2. Shipment and Booking");
  row("Booking", booking.bookingReference);
  row("Route", `${booking.origin ?? "—"} → ${booking.destination ?? "—"}`);
  row(
    "Cargo",
    [
      booking.cargoSnapshot?.description,
      booking.cargoSnapshot?.weightTons != null
        ? `${booking.cargoSnapshot.weightTons} MT`
        : null,
    ]
      .filter(Boolean)
      .join(" · ") || "—",
  );
  row("Vessel", booking.vesselSnapshot?.vesselName ?? "—");

  heading("3. Commercial Context");
  const cs = booking.commercialSnapshot;
  row(
    "Terms",
    [
      cs?.currency,
      cs?.rate != null ? String(cs.rate) : null,
      cs?.rateUnit,
      cs?.departure,
      cs?.vesselName,
    ]
      .filter(Boolean)
      .join(" · ") || "—",
  );

  heading("4. Factual Timeline");
  for (const t of claim.timelineSnapshot) {
    row(
      t.occurredAt,
      `${t.title} — ${t.factualSummary} (${t.sourceLabel})`,
    );
  }

  heading("5. Evidence Register");
  for (const e of evidence) {
    row(
      e.registerCode ?? e.id.slice(0, 8),
      `${e.title} · ${e.occurredAt ?? "—"} · ${e.sourceLabel}`,
    );
  }

  heading("6. Observed Timing Differences");
  if (!claim.durationFacts.length) {
    row("Durations", "No elapsed-time calculations available from known timestamps.");
  } else {
    for (const d of claim.durationFacts) {
      row(
        d.displayLabel,
        `${d.elapsedLabel} (${d.startAt} → ${d.endAt})${d.note ? ` — ${d.note}` : ""}`,
      );
    }
  }

  heading("7. Missing Evidence");
  if (!claim.missingEvidence.length) {
    row("Checklist", "No missing-evidence items flagged.");
  } else {
    for (const m of claim.missingEvidence) {
      row(m.label, m.reason);
    }
  }

  heading("8. User-Supplied Potential Amount");
  if (claim.claimedAmount != null) {
    row(
      "Potential Claim Amount",
      `${claim.claimedCurrency ?? ""} ${claim.claimedAmount}`.trim(),
    );
    row(
      "Source",
      claim.claimedAmountSource === "USER_SUPPLIED"
        ? "Entered by user (not calculated by CargoConnect)"
        : claim.claimedAmountSource ?? "—",
    );
    if (claim.claimedAmountNote) {
      row("User basis / note", claim.claimedAmountNote);
    }
  } else {
    row("Potential Claim Amount", "Not entered");
  }
  if (claim.userNotes) {
    row("User-provided note", claim.userNotes);
  }

  heading("9. Warnings and Limitations");
  for (const w of claim.warnings) {
    row("•", w);
  }

  ensureSpace(40);
  page.drawText(FOOTER, {
    x: margin,
    y: 28,
    size: 7,
    font,
    color: rgb(0.45, 0.45, 0.48),
  });

  const bytes = await doc.save({ useObjectStreams: false });
  const filename = `CargoConnect-Claim-${claim.reference}-v${claim.version}.pdf`;

  await repos.audits.append({
    id: newId("audit"),
    commercialRequestId: booking.commercialRequestId,
    userId: input.userId,
    eventType: "CLAIM_PDF_GENERATED",
    metadata: {
      claimId: claim.id,
      reference: claim.reference,
      version: claim.version,
    },
    createdAt: new Date().toISOString(),
  });

  return { bytes, filename };
}

function wrap(text: string, width: number): string[] {
  const safe = text
    .replace(/→/g, "->")
    .replace(/←/g, "<-")
    .replace(/—/g, "-")
    .replace(/–/g, "-")
    .replace(/[^\x20-\x7E\n]/g, "?");
  const words = safe.replace(/\s+/g, " ").trim().split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (next.length > width) {
      if (cur) lines.push(cur);
      cur = w;
    } else {
      cur = next;
    }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : ["-"];
}

// keep type import used for documentation
export type { ClaimPreparation };
