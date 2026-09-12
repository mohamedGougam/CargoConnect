import { beforeEach, describe, expect, it } from "vitest";
import { Webhook } from "svix";
import {
  createUser,
  resetCommercialStoreForTests,
  saveRequest,
} from "@/server/commercial/store";
import { hashPassword } from "@/server/commercial/auth";
import { getRepositories } from "@/server/commercial/repos";
import { processInboundEmail } from "@/server/commercial/inbound/processInbound";
import { extractQuoteDeterministic } from "@/server/commercial/inbound/extractQuote";
import { verifyResendWebhook } from "@/server/commercial/inbound/verifyWebhook";
import {
  buildOutboundInternetMessageId,
  buildRequestReplyAddress,
  extractReplyTokenFromAddress,
  generateReplyToken,
} from "@/server/commercial/inbound/replyAddress";
import { NO_VERIFIED_RATE_NOTE, type CommercialRequest } from "@/domain/commercial/types";
import { createIdleSearchState } from "@/domain/search/types";
import { runMaritimeRouteSearch } from "@/lib/search/runSearch";
import { newId } from "@/server/commercial/repos/memory";

const FIXTURE_QUOTE = `Dear Mohamed,

We can offer USD 42/MT for 2,000 MT steel Rotterdam/Alexandria,
laycan 18–20 September, transit approx. 9 days.
Rate valid until 15 September.

Regards,
Falcon Freight Group`;

const FIXTURE_INFO_REQUEST = `Dear Mohamed,

Thank you for your enquiry. Please provide cargo dimensions and packing details
so we can assess suitability. We do not have a rate yet.

Best regards`;

const FIXTURE_RESERVATION = `Hello,

We can reserve space subject to stem. Hold is provisional — not a confirmed booking.

Regards`;

beforeEach(async () => {
  process.env.COMMERCIAL_STORE = "memory";
  process.env.EMAIL_INBOUND_ENABLED = "true";
  process.env.EMAIL_INBOUND_DOMAIN = "reply.test.cargoconnect.local";
  // Svix expects whsec_ + base64
  process.env.EMAIL_WEBHOOK_SECRET =
    "whsec_" + Buffer.from("cargo_connect_inbound_test_secret_key").toString("base64");
  await resetCommercialStoreForTests();
});

async function makeSentRequest(overrides: Partial<CommercialRequest> = {}) {
  const user = await createUser({
    id: "user_inbound_1",
    email: "shipper@example.com",
    passwordHash: await hashPassword("securepass1"),
    fullName: "Shipper Ada",
    companyName: "Ada Shipping",
    emailVerifiedAt: new Date().toISOString(),
  });
  const replyToken = generateReplyToken();
  const search = await runMaritimeRouteSearch({
    query: "2,000 tons of steel from Rotterdam to Alexandria",
    vessels: [],
  });
  const now = new Date().toISOString();
  const request: CommercialRequest = {
    id: "req_inbound_1",
    type: "QUOTE",
    userId: user.id,
    status: "SENT",
    replyToken,
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
    sentAt: now,
    ...overrides,
  };
  await saveRequest(request);

  const internetMessageId = buildOutboundInternetMessageId(replyToken);
  await getRepositories().messages.create({
    id: newId("msg"),
    commercialRequestId: request.id,
    direction: "OUTBOUND",
    provider: "resend",
    providerMessageId: "out_1",
    internetMessageId,
    fromAddress: "CargoConnect <requests@test.local>",
    replyTo: buildRequestReplyAddress(replyToken)!,
    toAddress: "info@falconfg.com",
    subject: request.aiDraft!.subject,
    bodySnapshot: request.aiDraft!.body,
    deliveryStatus: "SENT",
    createdAt: now,
    sentAt: now,
  });

  return { user, request, replyToken, internetMessageId };
}

describe("reply address / correlation helpers", () => {
  it("builds and parses plus-address reply tokens", () => {
    const token = generateReplyToken();
    const addr = buildRequestReplyAddress(token);
    expect(addr).toBe(`request+${token}@reply.test.cargoconnect.local`);
    expect(extractReplyTokenFromAddress(addr!)).toBe(token);
  });
});

describe("quote extraction", () => {
  it("extracts rate currency transit validity from fixture quote", () => {
    const result = extractQuoteDeterministic({
      subject: "Re: Freight quotation request — Rotterdam to Alexandria",
      textBody: FIXTURE_QUOTE,
    });
    expect(result.hasMonetaryQuote).toBe(true);
    expect(result.quote.currency).toBe("USD");
    expect(result.quote.freightRate).toBe(42);
    expect(result.quote.rateUnit).toBe("MT");
    expect(result.quote.quantityTons).toBe(2000);
    expect(result.quote.transitTime?.toLowerCase()).toContain("9");
    expect(result.quote.validityUntil).toMatch(/15 September/i);
    expect(result.quote.responseClassification).toBe("QUOTE");
  });

  it("classifies information request with no price", () => {
    const result = extractQuoteDeterministic({
      subject: "Re: quote",
      textBody: FIXTURE_INFO_REQUEST,
    });
    expect(result.hasMonetaryQuote).toBe(false);
    expect(result.quote.freightRate).toBeNull();
    expect(result.quote.responseClassification).toBe("INFORMATION_REQUEST");
  });

  it("flags reservation language without claiming confirmed booking", () => {
    const result = extractQuoteDeterministic({
      subject: "Re: reservation",
      textBody: FIXTURE_RESERVATION,
    });
    expect(result.quote.responseClassification).toBe("RESERVATION_RESPONSE");
    expect(result.quote.notes).toMatch(/not treated as a confirmed booking/i);
  });
});

describe("inbound processing", () => {
  it("correlates via reply token, stores original, extracts quote, sets RESPONSE_RECEIVED", async () => {
    const { request, replyToken } = await makeSentRequest();
    const to = buildRequestReplyAddress(replyToken)!;

    const result = await processInboundEmail({
      provider: "fixture",
      providerMessageId: "in_1",
      fromAddress: "info@falconfg.com",
      fromName: "Falcon Freight Group",
      toAddresses: [to],
      subject: "Re: Freight quotation request — Rotterdam to Alexandria",
      textBody: FIXTURE_QUOTE,
      attachments: [
        {
          id: "att1",
          filename: "quotation.pdf",
          contentType: "application/pdf",
          sizeBytes: 12000,
        },
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.unmatched).toBe(false);
    expect(result.message.bodySnapshot).toContain("USD 42/MT");
    expect(result.quote?.freightRate).toBe(42);
    expect(result.quote?.currency).toBe("USD");

    const updated = await getRepositories().requests.get(request.id);
    expect(updated?.status).toBe("RESPONSE_RECEIVED");

    const attachments = await getRepositories().attachments.listForMessage(
      result.message.id,
    );
    expect(attachments).toHaveLength(1);
    expect(attachments[0].filename).toBe("quotation.pdf");

    const audits = await getRepositories().audits.listForRequest(request.id);
    expect(audits.some((a) => a.eventType === "INBOUND_EMAIL_CORRELATED")).toBe(
      true,
    );
    expect(
      audits.some((a) => a.eventType === "COMMERCIAL_RESPONSE_RECEIVED"),
    ).toBe(true);
    expect(audits.some((a) => a.eventType === "QUOTE_EXTRACTED")).toBe(true);
    // no full bodies in audit metadata
    for (const a of audits) {
      expect(JSON.stringify(a.metadata ?? {})).not.toContain("USD 42/MT");
    }
  });

  it("is idempotent on duplicate provider message id", async () => {
    const { replyToken } = await makeSentRequest();
    const payload = {
      provider: "fixture",
      providerMessageId: "dup_1",
      fromAddress: "info@falconfg.com",
      toAddresses: [buildRequestReplyAddress(replyToken)!],
      subject: "Re: quote",
      textBody: FIXTURE_QUOTE,
    };
    const first = await processInboundEmail(payload);
    const second = await processInboundEmail(payload);
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(second.duplicate).toBe(true);
    expect(second.message.id).toBe(first.message.id);
    const msgs = await getRepositories().messages.listForRequest("req_inbound_1");
    expect(msgs.filter((m) => m.direction === "INBOUND")).toHaveLength(1);
  });

  it("does not match on subject alone", async () => {
    await makeSentRequest();
    const result = await processInboundEmail({
      provider: "fixture",
      providerMessageId: "subj_only",
      fromAddress: "info@falconfg.com",
      toAddresses: ["catchall@reply.test.cargoconnect.local"],
      subject: "Freight quotation request — Rotterdam to Alexandria",
      textBody: FIXTURE_QUOTE,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.unmatched).toBe(true);
    const req = await getRepositories().requests.get("req_inbound_1");
    expect(req?.status).toBe("SENT");
  });

  it("rejects wrong reply token without attaching to a request", async () => {
    await makeSentRequest();
    const result = await processInboundEmail({
      provider: "fixture",
      providerMessageId: "wrong_tok",
      fromAddress: "info@falconfg.com",
      toAddresses: ["request+notarealtoken1234567890ab@reply.test.cargoconnect.local"],
      subject: "Re: quote",
      textBody: FIXTURE_QUOTE,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.unmatched).toBe(true);
  });

  it("correlates via In-Reply-To fallback", async () => {
    const { internetMessageId } = await makeSentRequest();
    const result = await processInboundEmail({
      provider: "fixture",
      providerMessageId: "thread_1",
      fromAddress: "ops@falconfg.com",
      toAddresses: ["request+unused@reply.test.cargoconnect.local"],
      subject: "Re: quote",
      textBody: FIXTURE_INFO_REQUEST,
      inReplyTo: internetMessageId,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.unmatched).toBe(false);
    expect(result.message.correlationMethod).toBe("in_reply_to");
    expect(result.message.senderTrust).toBe("OTHER_SENDER");
    expect(result.quote?.responseClassification).toBe("INFORMATION_REQUEST");
  });

  it("does not move DELIVERY_SIMULATED to RESPONSE_RECEIVED", async () => {
    const { replyToken } = await makeSentRequest({
      status: "DELIVERY_SIMULATED",
    });
    const result = await processInboundEmail({
      provider: "fixture",
      providerMessageId: "sim_1",
      fromAddress: "info@falconfg.com",
      toAddresses: [buildRequestReplyAddress(replyToken)!],
      subject: "Re: quote",
      textBody: FIXTURE_QUOTE,
    });
    expect(result.ok).toBe(true);
    const req = await getRepositories().requests.get("req_inbound_1");
    expect(req?.status).toBe("DELIVERY_SIMULATED");
    const audits = await getRepositories().audits.listForRequest("req_inbound_1");
    expect(
      audits.some((a) => a.eventType === "COMMERCIAL_RESPONSE_RECEIVED"),
    ).toBe(false);
  });

  it("keeps RESPONSE_RECEIVED for multiple inbound messages", async () => {
    const { replyToken } = await makeSentRequest();
    const to = buildRequestReplyAddress(replyToken)!;
    await processInboundEmail({
      provider: "fixture",
      providerMessageId: "m1",
      fromAddress: "info@falconfg.com",
      toAddresses: [to],
      subject: "Re: 1",
      textBody: FIXTURE_QUOTE,
    });
    await processInboundEmail({
      provider: "fixture",
      providerMessageId: "m2",
      fromAddress: "info@falconfg.com",
      toAddresses: [to],
      subject: "Re: 2",
      textBody: FIXTURE_INFO_REQUEST,
    });
    const req = await getRepositories().requests.get("req_inbound_1");
    expect(req?.status).toBe("RESPONSE_RECEIVED");
    const msgs = await getRepositories().messages.listForRequest("req_inbound_1");
    expect(msgs.filter((m) => m.direction === "INBOUND")).toHaveLength(2);
    const quotes = await getRepositories().quotes.listForRequest("req_inbound_1");
    expect(quotes.length).toBe(2);
  });

  it("rejects malformed payload", async () => {
    const result = await processInboundEmail({
      provider: "fixture",
      providerMessageId: "",
      fromAddress: "",
      toAddresses: [],
      subject: "",
      textBody: "",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("malformed");
  });
});

describe("webhook signature", () => {
  it("accepts valid signed payload and rejects invalid", () => {
    const secret = process.env.EMAIL_WEBHOOK_SECRET!;
    const payload = JSON.stringify({
      type: "email.received",
      data: { email_id: "abc", to: ["a@b.com"], from: "x@y.com", subject: "Hi" },
    });
    const wh = new Webhook(secret);
    const id = "msg_test_1";
    const timestamp = new Date();
    const signature = wh.sign(id, timestamp, payload);

    const ok = verifyResendWebhook({
      rawBody: payload,
      headers: {
        id,
        timestamp: Math.floor(timestamp.getTime() / 1000).toString(),
        signature,
      },
      secret,
    });
    expect(ok.ok).toBe(true);

    const bad = verifyResendWebhook({
      rawBody: payload,
      headers: {
        id,
        timestamp: Math.floor(timestamp.getTime() / 1000).toString(),
        signature: "v1,invalid",
      },
      secret,
    });
    expect(bad.ok).toBe(false);
  });
});
