import { beforeEach, describe, expect, it } from "vitest";
import {
  createUser,
  resetCommercialStoreForTests,
  saveRequest,
} from "@/server/commercial/store";
import { hashPassword } from "@/server/commercial/auth";
import {
  resetSendRateLimitsForTests,
  sendCommercialRequest,
} from "@/server/commercial/sendRequest";
import { getRepositories } from "@/server/commercial/repos";
import { NO_VERIFIED_RATE_NOTE, type CommercialRequest } from "@/domain/commercial/types";
import { createIdleSearchState } from "@/domain/search/types";
import { runMaritimeRouteSearch } from "@/lib/search/runSearch";

beforeEach(async () => {
  process.env.COMMERCIAL_STORE = "memory";
  process.env.EMAIL_DELIVERY_MODE = "log";
  process.env.EMAIL_FROM_ADDRESS = "requests@test.cargoconnect.local";
  process.env.EMAIL_FROM_NAME = "CargoConnect";
  await resetCommercialStoreForTests();
  resetSendRateLimitsForTests();
});

async function makeUser() {
  return createUser({
    id: "user_send_1",
    email: "shipper@example.com",
    passwordHash: await hashPassword("securepass1"),
    fullName: "Shipper Ada",
    companyName: "Ada Shipping",
    phone: "+10000000000",
    emailVerifiedAt: null,
  });
}

function sessionOf(user: Awaited<ReturnType<typeof makeUser>>) {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    companyName: user.companyName,
    phone: user.phone,
    emailVerifiedAt: user.emailVerifiedAt ?? null,
  };
}

function baseRequest(
  userId: string,
  overrides: Partial<CommercialRequest> = {},
): CommercialRequest {
  const search = runMaritimeRouteSearch({
    query: "2,000 tons of steel from Rotterdam to Alexandria",
    vessels: [],
  });
  const now = new Date().toISOString();
  return {
    id: "req_send_1",
    type: "QUOTE",
    userId,
    status: "READY_TO_SEND",
    searchContext: search.status === "active" ? search : createIdleSearchState(),
    origin: search.origin,
    destination: search.destination,
    cargo: { description: "steel", weightTons: 2000 },
    recipient: {
      contactId: "cc-alexandria-falcon",
      organizationName: "Falcon Freight Group",
      contactType: "BROKER",
      portId: "port-alexandria",
      portName: "Alexandria",
      email: "info@falconfg.com",
      sourceUrl: "https://www.falconfg.com/",
    },
    aiDraft: {
      subject: "Freight quotation request — Rotterdam to Alexandria",
      body: "Dear Falcon Freight Group,\n\nWe would like a quote.",
      generator: "deterministic_template",
      generatedAt: now,
    },
    contactName: "Shipper Ada",
    contactEmail: "shipper@example.com",
    verifiedFreightRateAvailable: false,
    freightRateNote: NO_VERIFIED_RATE_NOTE,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe("commercial email send", () => {
  it("sends READY_TO_SEND in log mode as DELIVERY_SIMULATED", async () => {
    const user = await makeUser();
    await saveRequest(baseRequest(user.id));

    const result = await sendCommercialRequest({
      requestId: "req_send_1",
      user: sessionOf(user),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.simulated).toBe(true);
    expect(result.request.status).toBe("DELIVERY_SIMULATED");
    expect(result.request.sentAt).toBeTruthy();

    const messages = await getRepositories().messages.listForRequest("req_send_1");
    expect(messages).toHaveLength(1);
    expect(messages[0].deliveryStatus).toBe("SIMULATED");
    expect(messages[0].replyTo).toBe("shipper@example.com");
    expect(messages[0].providerMessageId).toBeTruthy();
    expect(messages[0].toAddress).toBe("info@falconfg.com");

    const audits = await getRepositories().audits.listForRequest("req_send_1");
    expect(audits.some((a) => a.eventType === "SEND_STARTED")).toBe(true);
    expect(audits.some((a) => a.eventType === "DELIVERY_SIMULATED")).toBe(true);
  });

  it("rejects DRAFT status", async () => {
    const user = await makeUser();
    await saveRequest(baseRequest(user.id, { status: "DRAFT" }));
    const result = await sendCommercialRequest({
      requestId: "req_send_1",
      user: sessionOf(user),
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("invalid_status");
  });

  it("does not resend after simulated delivery", async () => {
    const user = await makeUser();
    await saveRequest(baseRequest(user.id));
    const session = sessionOf(user);
    const first = await sendCommercialRequest({ requestId: "req_send_1", user: session });
    expect(first.ok).toBe(true);
    const second = await sendCommercialRequest({ requestId: "req_send_1", user: session });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.alreadySent).toBe(true);
    const messages = await getRepositories().messages.listForRequest("req_send_1");
    expect(messages).toHaveLength(1);
  });

  it("rejects arbitrary recipient injection", async () => {
    const user = await makeUser();
    await saveRequest(
      baseRequest(user.id, {
        recipient: {
          contactId: "not-a-real-contact",
          organizationName: "Evil Co",
          contactType: "OTHER",
          portId: "port-alexandria",
          portName: "Alexandria",
          email: "attacker@evil.example",
          sourceUrl: "https://evil.example",
        },
      }),
    );
    const result = await sendCommercialRequest({
      requestId: "req_send_1",
      user: sessionOf(user),
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("invalid_recipient");
  });

  it("rejects contacts without email", async () => {
    const user = await makeUser();
    await saveRequest(
      baseRequest(user.id, {
        recipient: {
          contactId: "cc-hamburg-placeholder",
          organizationName: "Port of Hamburg — commercial inquiry",
          contactType: "PORT_COMMERCIAL",
          portId: "port-hamburg",
          portName: "Hamburg",
          sourceUrl: "https://www.hafen-hamburg.de/",
        },
      }),
    );
    const result = await sendCommercialRequest({
      requestId: "req_send_1",
      user: sessionOf(user),
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("missing_recipient_email");
  });

  it("blocks another user from sending", async () => {
    const user = await makeUser();
    await saveRequest(baseRequest(user.id));
    const result = await sendCommercialRequest({
      requestId: "req_send_1",
      user: {
        id: "other_user",
        email: "other@example.com",
        fullName: "Other",
        emailVerifiedAt: null,
      },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("not_found");
  });

  it("records failure without becoming SENT when provider misconfigured for live", async () => {
    process.env.EMAIL_DELIVERY_MODE = "live";
    delete process.env.EMAIL_API_KEY;
    const user = await makeUser();
    const verifiedAt = new Date().toISOString();
    await getRepositories().users.markEmailVerified(user.id, verifiedAt);
    await saveRequest(baseRequest(user.id));
    const result = await sendCommercialRequest({
      requestId: "req_send_1",
      user: { ...sessionOf(user), emailVerifiedAt: verifiedAt },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.request?.status).toBe("SEND_FAILED");
    const audits = await getRepositories().audits.listForRequest("req_send_1");
    expect(audits.some((a) => a.eventType === "EMAIL_SEND_FAILED")).toBe(true);
    process.env.EMAIL_DELIVERY_MODE = "log";
  });

  it("resolves recipient email from directory not browser snapshot", async () => {
    const user = await makeUser();
    await saveRequest(
      baseRequest(user.id, {
        recipient: {
          contactId: "cc-alexandria-falcon",
          organizationName: "Falcon Freight Group",
          contactType: "BROKER",
          portId: "port-alexandria",
          portName: "Alexandria",
          email: "spoofed@example.com",
          sourceUrl: "https://www.falconfg.com/",
        },
      }),
    );
    const result = await sendCommercialRequest({
      requestId: "req_send_1",
      user: sessionOf(user),
    });
    expect(result.ok).toBe(true);
    const messages = await getRepositories().messages.listForRequest("req_send_1");
    expect(messages[0].toAddress).toBe("info@falconfg.com");
  });
});

describe("request repository ownership", () => {
  it("lists only the owner's requests", async () => {
    const user = await makeUser();
    await createUser({
      id: "user_other",
      email: "other@example.com",
      passwordHash: await hashPassword("securepass1"),
      fullName: "Other",
    });
    await saveRequest(baseRequest(user.id, { id: "req_a" }));
    await saveRequest(baseRequest("user_other", { id: "req_b" }));
    const mine = await getRepositories().requests.listForUser(user.id);
    expect(mine.every((r) => r.userId === user.id)).toBe(true);
    expect(mine.some((r) => r.id === "req_b")).toBe(false);
  });
});
