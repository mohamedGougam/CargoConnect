import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { OperationalHandoff } from "@/domain/commercial/types";
import { getRepositories } from "@/server/commercial/repos";
import { newId } from "@/server/commercial/repos/memory";

const FOOTER =
  "CargoConnect operational summary. Source commercial and transport documents remain authoritative.";

function line(
  page: ReturnType<PDFDocument["addPage"]>,
  font: Awaited<ReturnType<PDFDocument["embedFont"]>>,
  text: string,
  x: number,
  y: number,
  size = 10,
  color = rgb(0.12, 0.14, 0.18),
) {
  page.drawText(text.slice(0, 110), {
    x,
    y,
    size,
    font,
    color,
  });
}

/**
 * Server-side deterministic PDF. No private storage keys or internal IDs.
 */
export async function generateHandoffPdf(input: {
  handoff: OperationalHandoff;
  userId: string;
  audit?: boolean;
}): Promise<{ bytes: Uint8Array; filename: string }> {
  const h = input.handoff;
  if (h.userId !== input.userId) {
    throw new Error("Forbidden");
  }

  const doc = await PDFDocument.create();
  doc.setTitle(`CargoConnect Handoff ${h.handoffReference}`);
  doc.setSubject(
    `${h.bookingSnapshot.bookingReference} · ${h.commercialSnapshot.currency ?? ""} ${h.commercialSnapshot.rate ?? ""}`.trim(),
  );
  doc.setProducer("CargoConnect");
  doc.setCreator("CargoConnect Operational Handoff");
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  let page = doc.addPage([612, 792]);
  let y = 752;
  const margin = 48;

  const ensureSpace = (need: number) => {
    if (y < need) {
      page = doc.addPage([612, 792]);
      y = 752;
    }
  };

  const heading = (title: string) => {
    ensureSpace(40);
    y -= 8;
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
    ensureSpace(28);
    page.drawText(label, {
      x: margin,
      y,
      size: 9,
      font: bold,
      color: rgb(0.35, 0.38, 0.42),
    });
    page.drawText((value || "—").slice(0, 90), {
      x: margin + 140,
      y,
      size: 10,
      font,
      color: rgb(0.12, 0.14, 0.18),
    });
    y -= 14;
  };

  page.drawText("CargoConnect", {
    x: margin,
    y,
    size: 16,
    font: bold,
    color: rgb(0.05, 0.35, 0.38),
  });
  y -= 20;
  page.drawText("Operational Handoff Summary", {
    x: margin,
    y,
    size: 13,
    font: bold,
    color: rgb(0.12, 0.14, 0.18),
  });
  y -= 22;

  row("Handoff", h.handoffReference);
  row("Booking", h.bookingSnapshot.bookingReference);
  row("Status", h.status);
  row(
    "Generated",
    new Date(h.generatedAt).toLocaleString("en-GB", { timeZone: "UTC" }) +
      " UTC",
  );
  if (h.finalizedAt) {
    row(
      "Finalized",
      new Date(h.finalizedAt).toLocaleString("en-GB", { timeZone: "UTC" }) +
        " UTC",
    );
  }

  if (h.operationalSummary) {
    heading("Summary");
    ensureSpace(40);
    const words = h.operationalSummary.split(/\s+/);
    let buf = "";
    for (const w of words) {
      const next = buf ? `${buf} ${w}` : w;
      if (next.length > 95) {
        line(page, font, buf, margin, y, 10);
        y -= 13;
        ensureSpace(28);
        buf = w;
      } else {
        buf = next;
      }
    }
    if (buf) {
      line(page, font, buf, margin, y, 10);
      y -= 14;
    }
  }

  heading("1. Shipment");
  row("Cargo", h.shipmentSnapshot.cargoDescription ?? "—");
  row(
    "Quantity",
    h.shipmentSnapshot.quantityTons != null
      ? `${h.shipmentSnapshot.quantityTons.toLocaleString("en-US")} ${h.shipmentSnapshot.unit}`
      : "—",
  );
  row(
    "Dangerous goods",
    h.shipmentSnapshot.dangerousGoods ? "Yes" : "No / not indicated",
  );

  heading("2. Route");
  row("Origin", h.shipmentSnapshot.origin ?? "—");
  row("Destination", h.shipmentSnapshot.destination ?? "—");

  heading("3. Commercial Terms");
  const c = h.commercialSnapshot;
  row(
    "Rate",
    c.rate != null
      ? `${c.currency ?? ""} ${c.rate}${c.rateUnit ? ` / ${c.rateUnit}` : ""}`.trim()
      : "—",
  );
  row(
    "Est. freight",
    c.estimatedFreight != null
      ? `${c.currency ?? ""} ${c.estimatedFreight.toLocaleString("en-US")}`
      : "—",
  );
  row("Laycan", c.departure ?? "—");
  row("Transit", c.transit ?? "—");
  row("Broker / carrier", c.organization);
  row("Inclusions", c.includedCharges ?? "—");
  row("Exclusions", c.excludedCharges ?? "—");
  row("Payment terms", c.paymentTerms ?? "—");
  row("Source", c.sourceLabel);

  heading("4. Vessel");
  row("Name", h.vesselSnapshot.vesselName ?? "—");
  row("IMO", h.vesselSnapshot.vesselImo ?? "—");
  row("MMSI", h.vesselSnapshot.vesselMmsi ?? "—");
  row("Type", h.vesselSnapshot.vesselType ?? "—");

  heading("5. Contacts");
  row("Requester", h.contactsSnapshot.requesterName ?? "—");
  row("Requester email", h.contactsSnapshot.requesterEmail ?? "—");
  row("Broker", h.contactsSnapshot.brokerOrganization ?? "—");
  row("Broker email", h.contactsSnapshot.brokerEmail ?? "—");
  row("Ops contact", h.operationsContactName ?? "—");
  row("Ops email", h.operationsContactEmail ?? "—");
  row("Ops phone", h.operationsContactPhone ?? "—");

  heading("6. Documents");
  for (const d of h.documentManifest) {
    ensureSpace(36);
    const mark = d.uploaded ? "[x]" : "[ ]";
    page.drawText(
      `${mark} ${d.label}${d.required ? "" : " (optional)"}`.slice(0, 80),
      {
        x: margin,
        y,
        size: 10,
        font: bold,
        color: rgb(0.12, 0.14, 0.18),
      },
    );
    y -= 12;
    page.drawText(
      (d.uploaded
        ? `${d.filename ?? "file"} · v${d.version} · ${d.validationLabel}`
        : d.validationLabel
      ).slice(0, 95),
      {
        x: margin + 14,
        y,
        size: 9,
        font,
        color: rgb(0.35, 0.38, 0.42),
      },
    );
    y -= 14;
  }

  heading("7. Outstanding Information");
  if (h.missingInformation.length === 0) {
    row("Status", "None listed");
  } else {
    for (const m of h.missingInformation) {
      ensureSpace(24);
      line(page, font, `• ${m.message}`, margin, y, 10);
      y -= 13;
    }
  }

  heading("8. Notes / Warnings");
  if (h.operationalNotes) {
    ensureSpace(28);
    page.drawText("User operational notes:", {
      x: margin,
      y,
      size: 9,
      font: bold,
      color: rgb(0.35, 0.38, 0.42),
    });
    y -= 12;
    line(page, font, h.operationalNotes, margin, y, 10);
    y -= 14;
  }
  for (const w of h.warnings) {
    ensureSpace(24);
    line(page, font, `[${w.severity}] ${w.message}`, margin, y, 9);
    y -= 12;
  }

  ensureSpace(40);
  y -= 10;
  page.drawText(FOOTER, {
    x: margin,
    y: Math.max(36, y),
    size: 8,
    font,
    color: rgb(0.45, 0.48, 0.52),
  });

  const bytes = await doc.save({ useObjectStreams: false });
  const filename = `CargoConnect-Handoff-${h.bookingSnapshot.bookingReference}-v${h.version}.pdf`;

  if (input.audit !== false) {
    const booking = await getRepositories().bookings.get(h.bookingId);
    await getRepositories().audits.append({
      id: newId("audit"),
      commercialRequestId: booking?.commercialRequestId ?? null,
      userId: input.userId,
      eventType: "HANDOFF_PDF_GENERATED",
      metadata: {
        handoffId: h.id,
        handoffReference: h.handoffReference,
        filename,
      },
      createdAt: new Date().toISOString(),
    });
  }

  return { bytes, filename };
}
