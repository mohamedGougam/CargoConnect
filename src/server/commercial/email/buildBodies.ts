import type { CommercialRequest } from "@/domain/commercial/types";
import type { SessionUser } from "@/server/commercial/auth";

/**
 * Professional plain + HTML email for commercial RFQ / reservation requests.
 * Uses the user-reviewed draft body; does not invent commercial facts.
 */
export function buildCommercialEmailBodies(input: {
  request: CommercialRequest;
  requester: SessionUser;
  recipientOrganization: string;
  /** When true, replies are captured by CargoConnect — keep requester contact visible. */
  repliesCapturedByCargoConnect?: boolean;
}): { text: string; html: string } {
  const { request, requester, recipientOrganization } = input;
  const subjectBody = request.aiDraft?.body ?? "";
  const origin = request.origin?.name ?? "—";
  const destination = request.destination?.name ?? "—";
  const typeLabel =
    request.type === "QUOTE" ? "Freight quotation request" : "Reservation request";

  const cargoBits = [
    request.cargo.description ? `Cargo: ${request.cargo.description}` : null,
    request.cargo.type ? `Type: ${request.cargo.type}` : null,
    request.cargo.weightTons != null
      ? `Weight: ${request.cargo.weightTons.toLocaleString("en-US")} tons`
      : null,
    request.cargo.volumeCbm != null ? `Volume: ${request.cargo.volumeCbm} m³` : null,
    request.cargo.unitsPackages
      ? `Units: ${request.cargo.unitsPackages}`
      : null,
    request.requestedDeparture
      ? `Desired departure: ${request.requestedDeparture}`
      : null,
    request.preferredVesselType
      ? `Vessel preference: ${request.preferredVesselType}`
      : null,
  ].filter(Boolean) as string[];

  const replyNote = input.repliesCapturedByCargoConnect
    ? [
        "Please reply to this email so CargoConnect can relay your response to the requester.",
        "Requester contact details are included above for identification.",
      ]
    : [];

  const text = [
    `CargoConnect — ${typeLabel}`,
    "",
    `To: ${recipientOrganization}`,
    "",
    "Requester",
    `- Name: ${requester.fullName}`,
    `- Company: ${requester.companyName ?? request.companyName ?? "—"}`,
    `- Email: ${requester.email}`,
    `- Phone: ${requester.phone ?? request.contactPhone ?? "—"}`,
    "",
    "Shipment",
    `- Origin: ${origin}`,
    `- Destination: ${destination}`,
    ...cargoBits.map((l) => `- ${l}`),
    "",
    "Message",
    subjectBody,
    "",
    ...replyNote,
    replyNote.length ? "" : null,
    "—",
    "This request was sent via CargoConnect on behalf of the requester.",
    "This is a commercial inquiry only — not a confirmed booking or quoted rate.",
  ]
    .filter((l) => l !== null)
    .join("\n");

  const htmlReplyNote = input.repliesCapturedByCargoConnect
    ? `<p style="margin:16px 0 0;font-size:13px;color:#475569;line-height:1.5;">
         Please reply to this email so CargoConnect can relay your response to the requester.
         Requester contact details are included above for identification.
       </p>`
    : "";

  const html = `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f4f6f8;font-family:Segoe UI,Helvetica,Arial,sans-serif;color:#0f172a;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" style="max-width:640px;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
        <tr><td style="padding:20px 24px;border-bottom:1px solid #e2e8f0;background:#0b1520;color:#e2e8f0;">
          <div style="font-size:13px;letter-spacing:0.12em;text-transform:uppercase;color:#5eead4;">CargoConnect</div>
          <div style="margin-top:6px;font-size:20px;font-weight:600;">${escapeHtml(typeLabel)}</div>
        </td></tr>
        <tr><td style="padding:20px 24px;">
          <p style="margin:0 0 16px;font-size:14px;color:#475569;">Prepared for <strong>${escapeHtml(recipientOrganization)}</strong></p>
          <h2 style="margin:0 0 8px;font-size:13px;letter-spacing:0.08em;text-transform:uppercase;color:#0f766e;">Requester</h2>
          <p style="margin:0 0 16px;font-size:14px;line-height:1.5;">
            ${escapeHtml(requester.fullName)}<br/>
            ${escapeHtml(requester.companyName ?? request.companyName ?? "—")}<br/>
            ${escapeHtml(requester.email)}<br/>
            ${escapeHtml(requester.phone ?? request.contactPhone ?? "—")}
          </p>
          <h2 style="margin:0 0 8px;font-size:13px;letter-spacing:0.08em;text-transform:uppercase;color:#0f766e;">Shipment</h2>
          <p style="margin:0 0 16px;font-size:14px;line-height:1.5;">
            <strong>${escapeHtml(origin)}</strong> → <strong>${escapeHtml(destination)}</strong><br/>
            ${cargoBits.map((l) => escapeHtml(l)).join("<br/>")}
          </p>
          <h2 style="margin:0 0 8px;font-size:13px;letter-spacing:0.08em;text-transform:uppercase;color:#0f766e;">Message</h2>
          <pre style="margin:0;white-space:pre-wrap;font-family:Segoe UI,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.55;color:#0f172a;">${escapeHtml(subjectBody)}</pre>
          ${htmlReplyNote}
        </td></tr>
        <tr><td style="padding:16px 24px;border-top:1px solid #e2e8f0;font-size:12px;color:#64748b;line-height:1.5;">
          This request was sent via CargoConnect on behalf of the requester.<br/>
          This is a commercial inquiry only — not a confirmed booking or quoted rate.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  return { text, html };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
