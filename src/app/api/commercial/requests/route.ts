import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import type {
  CommercialRequest,
  CommercialRequestStatus,
  CommercialRequestType,
} from "@/domain/commercial/types";
import { NO_VERIFIED_RATE_NOTE } from "@/domain/commercial/types";
import { generateCommercialMessageDraft } from "@/lib/commercial/generateMessage";
import { buildCommercialRequestDraft } from "@/lib/commercial/buildDraft";
import { readSessionUser } from "@/server/commercial/auth";
import { getIntent, getRequest, saveRequest } from "@/server/commercial/store";
import { getRepositories } from "@/server/commercial/repos";
import { appendAudit } from "@/server/commercial/sendRequest";
import type { RouteSearchState } from "@/domain/search/types";
import type { Port, Vessel } from "@/domain/models";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function requireAuthResponse() {
  return NextResponse.json({ error: "Authentication required" }, { status: 401 });
}

export async function GET(request: Request) {
  const user = await readSessionUser();
  if (!user) return requireAuthResponse();

  const id = new URL(request.url).searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }
  const req = await getRequest(id);
  if (!req || req.userId !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ request: req });
}

export async function POST(request: Request) {
  const user = await readSessionUser();
  if (!user) return requireAuthResponse();

  let body: {
    action?: string;
    intentId?: string;
    type?: CommercialRequestType;
    search?: RouteSearchState;
    selectedVessel?: Vessel | null;
    selectedPort?: Port | null;
    requestId?: string;
    patch?: Partial<CommercialRequest>;
    markReady?: boolean;
  };

  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (body.action === "create_from_intent" || body.action === "create") {
    let search = body.search;
    let selectedVessel = body.selectedVessel ?? null;
    let selectedPort = body.selectedPort ?? null;
    let type: CommercialRequestType =
      body.type ?? (body.action === "create_from_intent" ? "QUOTE" : "QUOTE");

    if (body.intentId) {
      const intent = await getIntent(body.intentId);
      if (!intent) {
        return NextResponse.json({ error: "Intent not found" }, { status: 404 });
      }
      search = intent.search;
      selectedVessel = intent.selectedVessel ?? null;
      selectedPort = intent.selectedPort ?? null;
      if (intent.workflow === "reservation") type = "RESERVATION";
      else if (intent.workflow === "quote" || intent.workflow === "price") type = "QUOTE";
    }

    if (!search) {
      return NextResponse.json({ error: "search context required" }, { status: 400 });
    }

    const draft = buildCommercialRequestDraft({
      type,
      search,
      selectedVessel,
      selectedPort,
    });

    const now = new Date().toISOString();
    const record: CommercialRequest = {
      id: `req_${randomBytes(10).toString("hex")}`,
      type: draft.type,
      userId: user.id,
      status: "DRAFT",
      searchContext: draft.searchContext,
      origin: draft.origin,
      destination: draft.destination,
      selectedVessel: draft.selectedVessel,
      selectedPort: draft.selectedPort,
      cargo: draft.cargo,
      preferredVesselType: draft.preferredVesselType,
      contactName: user.fullName,
      companyName: user.companyName,
      contactEmail: user.email,
      contactPhone: user.phone,
      verifiedFreightRateAvailable: false,
      freightRateNote: NO_VERIFIED_RATE_NOTE,
      createdAt: now,
      updatedAt: now,
    };

    await saveRequest(record);
    await appendAudit({
      commercialRequestId: record.id,
      userId: user.id,
      eventType: "REQUEST_CREATED",
      metadata: { type: record.type },
    });
    return NextResponse.json({ request: record, draft });
  }

  if (body.action === "update") {
    if (!body.requestId) {
      return NextResponse.json({ error: "requestId required" }, { status: 400 });
    }
    const existing = await getRequest(body.requestId);
    if (!existing || existing.userId !== user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (
      existing.status === "SENT" ||
      existing.status === "DELIVERY_SIMULATED" ||
      existing.status === "SENDING"
    ) {
      return NextResponse.json(
        { error: "Request can no longer be edited", request: existing },
        { status: 409 },
      );
    }

    const patch = body.patch ?? {};
    let nextStatus: CommercialRequestStatus = existing.status;
    if (body.markReady === true) {
      nextStatus = "READY_TO_SEND";
    } else if (patch.status === "DRAFT" || patch.status === "READY_TO_SEND") {
      nextStatus = patch.status;
    }

    let recipient = existing.recipient;
    if (patch.recipient?.contactId) {
      const contact = await getRepositories().contacts.getById(
        patch.recipient.contactId,
      );
      if (!contact) {
        return NextResponse.json({ error: "Invalid recipient contact" }, { status: 400 });
      }
      recipient = {
        contactId: contact.id,
        organizationName: contact.organizationName,
        contactType: contact.contactType,
        portId: contact.portId,
        portName: contact.portName,
        email: contact.email,
        sourceUrl: contact.sourceUrl,
      };
    }

    const merged: CommercialRequest = {
      ...existing,
      cargo: { ...existing.cargo, ...patch.cargo },
      preferredVesselType: patch.preferredVesselType ?? existing.preferredVesselType,
      requestedDeparture: patch.requestedDeparture ?? existing.requestedDeparture,
      requestedArrival: patch.requestedArrival ?? existing.requestedArrival,
      dangerousGoods: patch.dangerousGoods ?? existing.dangerousGoods,
      oversizedProjectCargo:
        patch.oversizedProjectCargo ?? existing.oversizedProjectCargo,
      handlingRequirements: patch.handlingRequirements ?? existing.handlingRequirements,
      additionalNotes: patch.additionalNotes ?? existing.additionalNotes,
      contactName: sanitizeText(patch.contactName ?? existing.contactName),
      companyName: sanitizeText(patch.companyName ?? existing.companyName),
      contactEmail: sanitizeText(patch.contactEmail ?? existing.contactEmail),
      contactPhone: sanitizeText(patch.contactPhone ?? existing.contactPhone),
      selectedVessel:
        patch.selectedVessel === null
          ? null
          : (patch.selectedVessel ?? existing.selectedVessel),
      recipient,
      verifiedFreightRateAvailable: false,
      freightRateNote: NO_VERIFIED_RATE_NOTE,
      status: nextStatus,
      updatedAt: new Date().toISOString(),
    };

    if (patch.aiDraft?.subject && patch.aiDraft?.body) {
      merged.aiDraft = {
        subject: sanitizeText(patch.aiDraft.subject) ?? "",
        body: sanitizeMultiline(patch.aiDraft.body) ?? "",
        generator: "deterministic_template",
        generatedAt: patch.aiDraft.generatedAt ?? new Date().toISOString(),
      };
    } else {
      merged.aiDraft = generateCommercialMessageDraft({
        type: merged.type,
        contactName: merged.contactName ?? user.fullName,
        companyName: merged.companyName,
        originName: merged.origin?.name,
        destinationName: merged.destination?.name,
        cargoDescription: merged.cargo.description,
        cargoType: merged.cargo.type,
        weightTons: merged.cargo.weightTons,
        volumeCbm: merged.cargo.volumeCbm,
        unitsPackages: merged.cargo.unitsPackages,
        requestedDeparture: merged.requestedDeparture,
        preferredVesselType: merged.preferredVesselType,
        selectedVesselName: merged.selectedVessel?.name,
        additionalNotes: merged.additionalNotes,
        recipientOrganization: merged.recipient?.organizationName,
        dangerousGoods: merged.dangerousGoods,
        oversizedProjectCargo: merged.oversizedProjectCargo,
        handlingRequirements: merged.handlingRequirements,
      });
    }

    if (body.markReady && !merged.recipient) {
      return NextResponse.json(
        { error: "Select a commercial recipient before marking ready" },
        { status: 400 },
      );
    }

    await saveRequest(merged);
    await appendAudit({
      commercialRequestId: merged.id,
      userId: user.id,
      eventType:
        nextStatus === "READY_TO_SEND" && existing.status !== "READY_TO_SEND"
          ? "REQUEST_READY_TO_SEND"
          : "REQUEST_UPDATED",
      metadata: { status: nextStatus },
    });
    return NextResponse.json({ request: merged });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

function sanitizeText(value?: string): string | undefined {
  if (value == null) return undefined;
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim().slice(0, 500);
}

function sanitizeMultiline(value?: string): string | undefined {
  if (value == null) return undefined;
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").slice(0, 12000);
}
