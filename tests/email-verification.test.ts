import { beforeEach, describe, expect, it } from "vitest";
import { signupUser, hashPassword, publicUser } from "@/server/commercial/auth";
import {
  consumeEmailVerificationToken,
  generateRawVerificationToken,
  hashVerificationToken,
  issueEmailVerification,
} from "@/server/commercial/emailVerification";
import {
  resetSendRateLimitsForTests,
  sendCommercialRequest,
} from "@/server/commercial/sendRequest";
import { getRepositories } from "@/server/commercial/repos";
import { newId } from "@/server/commercial/repos/memory";
import {
  createUser,
  resetCommercialStoreForTests,
  saveRequest,
  findUserById,
} from "@/server/commercial/store";
import { NO_VERIFIED_RATE_NOTE, type CommercialRequest } from "@/domain/commercial/types";
import { createIdleSearchState } from "@/domain/search/types";
import { runMaritimeRouteSearch } from "@/lib/search/runSearch";

beforeEach(async () => {
  process.env.COMMERCIAL_STORE = "memory";
  process.env.EMAIL_DELIVERY_MODE = "log";
  process.env.EMAIL_FROM_ADDRESS = "requests@test.cargoconnect.local";
  process.env.EMAIL_FROM_NAME = "CargoConnect";
  process.env.APP_BASE_URL = "http://localhost:3000";
  process.env.EMAIL_VERIFICATION_TOKEN_TTL_MINUTES = "60";
  process.env.EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS = "0";
  await resetCommercialStoreForTests();
  resetSendRateLimitsForTests();
});

async function readyQuote(userId: string, id = "req_verify_1"): Promise<CommercialRequest> {
  const search = await runMaritimeRouteSearch({
    query: "2,000 tons of steel from Rotterdam to Alexandria",
    vessels: [],
  });
  const now = new Date().toISOString();
  return {
    id,
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
  };
}

describe("email verification", () => {
  it("signup creates unverified user and hashed verification token", async () => {
    const result = await signupUser({
      fullName: "Ada Shipper",
      email: "ada@example.com",
      password: "securepass1",
    });
    expect("user" in result).toBe(true);
    if (!("user" in result)) return;

    expect(result.user.emailVerifiedAt).toBeNull();
    const stored = await findUserById(result.user.id);
    expect(stored?.emailVerifiedAt).toBeNull();

    const repos = getRepositories();
    const audits = await repos.audits.listForUser(result.user.id);
    expect(audits.some((a) => a.eventType === "USER_EMAIL_VERIFICATION_SENT")).toBe(
      true,
    );

    // Token exists; raw token never stored (hashes are 64-char hex)
    const recent = await repos.verificationTokens.countRecentForUser(
      result.user.id,
      new Date(0).toISOString(),
    );
    expect(recent).toBe(1);

    // Ensure no audit metadata contains a raw token-looking field
    for (const a of audits) {
      const meta = JSON.stringify(a.metadata ?? {});
      expect(meta).not.toMatch(/token=/i);
    }
  });

  it("valid token verifies email and is single-use", async () => {
    const user = await createUser({
      id: "user_v1",
      email: "v1@example.com",
      passwordHash: await hashPassword("securepass1"),
      fullName: "V One",
      emailVerifiedAt: null,
    });
    const raw = generateRawVerificationToken();
    const hash = hashVerificationToken(raw);
    await getRepositories().verificationTokens.create({
      id: newId("evt"),
      userId: user.id,
      tokenHash: hash,
      expiresAt: new Date(Date.now() + 60 * 60_000).toISOString(),
      usedAt: null,
      createdAt: new Date().toISOString(),
    });

    const first = await consumeEmailVerificationToken(raw);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.user.emailVerifiedAt).toBeTruthy();

    const second = await consumeEmailVerificationToken(raw);
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.code).toBe("invalid");

    const audits = await getRepositories().audits.listForUser(user.id);
    expect(audits.some((a) => a.eventType === "USER_EMAIL_VERIFIED")).toBe(true);
  });

  it("rejects expired and invalid tokens", async () => {
    const user = await createUser({
      id: "user_v2",
      email: "v2@example.com",
      passwordHash: await hashPassword("securepass1"),
      fullName: "V Two",
      emailVerifiedAt: null,
    });
    const raw = generateRawVerificationToken();
    await getRepositories().verificationTokens.create({
      id: newId("evt"),
      userId: user.id,
      tokenHash: hashVerificationToken(raw),
      expiresAt: new Date(Date.now() - 1000).toISOString(),
      usedAt: null,
      createdAt: new Date().toISOString(),
    });

    const expired = await consumeEmailVerificationToken(raw);
    expect(expired.ok).toBe(false);

    const invalid = await consumeEmailVerificationToken("not-a-real-token-value-xx");
    expect(invalid.ok).toBe(false);
    if (!invalid.ok) expect(invalid.error).toMatch(/invalid or expired/i);
  });

  it("resend works and rate limits; verified user cannot reissue", async () => {
    const user = await createUser({
      id: "user_v3",
      email: "v3@example.com",
      passwordHash: await hashPassword("securepass1"),
      fullName: "V Three",
      emailVerifiedAt: null,
    });

    const first = await issueEmailVerification(user);
    expect(first.ok).toBe(true);

    // Fill hourly bucket with synthetic tokens
    const repos = getRepositories();
    for (let i = 0; i < 4; i++) {
      await repos.verificationTokens.create({
        id: newId("evt"),
        userId: user.id,
        tokenHash: hashVerificationToken(generateRawVerificationToken()),
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        usedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      });
    }
    // first issue + 4 = 5; next should rate limit
    const limited = await issueEmailVerification(user);
    expect(limited.ok).toBe(false);
    if (!limited.ok) expect(limited.code).toBe("rate_limited");

    await repos.users.markEmailVerified(user.id, new Date().toISOString());
    const verifiedUser = await findUserById(user.id);
    const blocked = await issueEmailVerification(verifiedUser!);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.code).toBe("already_verified");
  });

  it("unverified user blocked from LIVE send; request stays READY_TO_SEND", async () => {
    process.env.EMAIL_DELIVERY_MODE = "live";
    process.env.EMAIL_API_KEY = "re_test_key";

    const user = await createUser({
      id: "user_live_block",
      email: "liveblock@example.com",
      passwordHash: await hashPassword("securepass1"),
      fullName: "Live Block",
      emailVerifiedAt: null,
    });
    await saveRequest(await readyQuote(user.id));

    const result = await sendCommercialRequest({
      requestId: "req_verify_1",
      user: publicUser(user),
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("EMAIL_VERIFICATION_REQUIRED");
    expect(result.request?.status).toBe("READY_TO_SEND");

    const audits = await getRepositories().audits.listForRequest("req_verify_1");
    expect(audits.some((a) => a.eventType === "SEND_STARTED")).toBe(false);
    expect(audits.some((a) => a.eventType === "EMAIL_SENT")).toBe(false);

    process.env.EMAIL_DELIVERY_MODE = "log";
  });

  it("unverified user may use log/simulated send", async () => {
    const user = await createUser({
      id: "user_log_ok",
      email: "logok@example.com",
      passwordHash: await hashPassword("securepass1"),
      fullName: "Log Ok",
      emailVerifiedAt: null,
    });
    await saveRequest(await readyQuote(user.id, "req_log_ok"));
    const result = await sendCommercialRequest({
      requestId: "req_log_ok",
      user: publicUser(user),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.simulated).toBe(true);
    expect(result.request.status).toBe("DELIVERY_SIMULATED");
  });

  it("after verify, READY_TO_SEND remains and live gate passes (provider config next)", async () => {
    process.env.EMAIL_DELIVERY_MODE = "live";
    delete process.env.EMAIL_API_KEY;

    const user = await createUser({
      id: "user_after_verify",
      email: "after@example.com",
      passwordHash: await hashPassword("securepass1"),
      fullName: "After Verify",
      emailVerifiedAt: null,
    });
    await saveRequest(await readyQuote(user.id, "req_after"));

    // Attempt while unverified
    const blocked = await sendCommercialRequest({
      requestId: "req_after",
      user: publicUser(user),
    });
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.code).toBe("EMAIL_VERIFICATION_REQUIRED");

    const stillReady = await getRepositories().requests.get("req_after");
    expect(stillReady?.status).toBe("READY_TO_SEND");

    await getRepositories().users.markEmailVerified(
      user.id,
      new Date().toISOString(),
    );
    const verified = await findUserById(user.id);

    const after = await sendCommercialRequest({
      requestId: "req_after",
      user: publicUser(verified!),
    });
    // Gate passed; live without key fails provider config (not verification)
    expect(after.ok).toBe(false);
    if (after.ok) return;
    expect(after.code).not.toBe("EMAIL_VERIFICATION_REQUIRED");
    expect(after.code).toBe("provider_config");

    process.env.EMAIL_DELIVERY_MODE = "log";
  });

  it("verification state persists on user record", async () => {
    const user = await createUser({
      id: "user_persist",
      email: "persist@example.com",
      passwordHash: await hashPassword("securepass1"),
      fullName: "Persist",
      emailVerifiedAt: null,
    });
    const raw = generateRawVerificationToken();
    await getRepositories().verificationTokens.create({
      id: newId("evt"),
      userId: user.id,
      tokenHash: hashVerificationToken(raw),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      usedAt: null,
      createdAt: new Date().toISOString(),
    });
    await consumeEmailVerificationToken(raw);
    const again = await findUserById(user.id);
    expect(again?.emailVerifiedAt).toBeTruthy();
    expect(publicUser(again!).emailVerifiedAt).toBeTruthy();
  });
});
