import { describe, expect, it, beforeEach } from "vitest";
import {
  createUser,
  findUserByEmail,
  getIntent,
  saveIntent,
  saveRequest,
  getRequest,
  resetCommercialStoreForTests,
} from "@/server/commercial/store";
import { hashPassword, verifyPassword, signupUser, loginUser } from "@/server/commercial/auth";
import { buildCommercialRequestDraft } from "@/lib/commercial/buildDraft";
import { generateCommercialMessageDraft } from "@/lib/commercial/generateMessage";
import {
  getContactsForPort,
  suggestContactsForDestination,
  listCommercialContacts,
} from "@/data/commercial/contacts";
import { runMaritimeRouteSearch } from "@/lib/search/runSearch";
import { NO_VERIFIED_RATE_NOTE, type CommercialRequest } from "@/domain/commercial/types";
import { createIdleSearchState } from "@/domain/search/types";
import type { Vessel } from "@/domain/models";

beforeEach(async () => {
  await resetCommercialStoreForTests();
});

describe("auth basics", () => {
  it("hashes passwords and never stores plaintext", async () => {
    const hash = await hashPassword("secretpass1");
    expect(hash).not.toContain("secretpass1");
    expect(await verifyPassword("secretpass1", hash)).toBe(true);
    expect(await verifyPassword("wrong", hash)).toBe(false);
  });

  it("signs up and logs in", async () => {
    const signed = await signupUser({
      fullName: "Ada Merchant",
      email: "ada@example.com",
      password: "securepass1",
      companyName: "Ada Shipping",
    });
    expect("user" in signed).toBe(true);
    if (!("user" in signed)) return;

    const stored = await findUserByEmail("ada@example.com");
    expect(stored?.passwordHash).toBeTruthy();
    expect(JSON.stringify(stored)).not.toContain("securepass1");

    const login = await loginUser({
      email: "ada@example.com",
      password: "securepass1",
    });
    expect("user" in login).toBe(true);

    const bad = await loginUser({
      email: "ada@example.com",
      password: "nope",
    });
    expect("error" in bad).toBe(true);
  });

  it("rejects duplicate signup", async () => {
    await signupUser({
      fullName: "Ada",
      email: "dup@example.com",
      password: "securepass1",
    });
    const again = await signupUser({
      fullName: "Ada",
      email: "dup@example.com",
      password: "securepass1",
    });
    expect("error" in again).toBe(true);
  });
});

describe("RouteSearchState → CommercialRequestDraft", () => {
  it("preserves search context without reparsing", () => {
    const search = runMaritimeRouteSearch({
      query: "2,000 tons of steel from Rotterdam to Alexandria",
      vessels: [],
    });
    expect(search.status).toBe("active");

    const vessel: Vessel = {
      id: "v1",
      name: "Steel Runner",
      type: "general_cargo",
      cargoCategory: "General",
      position: { longitude: 10, latitude: 40 },
      status: "underway",
    };

    const draft = buildCommercialRequestDraft({
      type: "QUOTE",
      search,
      selectedVessel: vessel,
    });

    expect(draft.originalQuery).toBe(search.originalQuery);
    expect(draft.origin?.name).toMatch(/Rotterdam/i);
    expect(draft.destination?.name).toMatch(/Alexandria/i);
    expect(draft.cargo.weightTons).toBe(2000);
    expect(draft.cargo.description).toBe("steel");
    expect(draft.selectedVessel?.id).toBe("v1");
    expect(draft.verifiedFreightRateAvailable).toBe(false);
    expect(draft.freightRateNote).toBe(NO_VERIFIED_RATE_NOTE);
    expect(draft.searchContext).toBe(search);
  });

  it("prefills reservation draft the same way", () => {
    const search = runMaritimeRouteSearch({
      query: "Rotterdam to Alexandria",
      vessels: [],
    });
    const draft = buildCommercialRequestDraft({
      type: "RESERVATION",
      search,
    });
    expect(draft.type).toBe("RESERVATION");
    expect(draft.origin?.name).toMatch(/Rotterdam/i);
    expect(draft.destination?.name).toMatch(/Alexandria/i);
  });
});

describe("commercial contacts", () => {
  it("looks up Alexandria contacts with verified emails", () => {
    const result = suggestContactsForDestination("port-alexandria");
    expect(result.contacts.length).toBeGreaterThan(0);
    expect(result.suggested?.email).toBeTruthy();
    expect(result.missingEmail).toBe(false);
  });

  it("handles missing email ports without fabricating addresses", () => {
    const hamburg = getContactsForPort("port-hamburg");
    expect(hamburg.length).toBeGreaterThan(0);
    expect(hamburg.every((c) => !c.email || c.email.includes("@"))).toBe(true);
    const result = suggestContactsForDestination("port-hamburg");
    expect(result.missingEmail).toBe(true);
    expect(result.suggested?.email).toBeUndefined();
  });

  it("covers the ten demo ports", () => {
    const ports = new Set(listCommercialContacts().map((c) => c.portId));
    for (const id of [
      "port-rotterdam",
      "port-antwerp",
      "port-hamburg",
      "port-piraeus",
      "port-thessaloniki",
      "port-istanbul",
      "port-alexandria",
      "port-said",
      "port-algeciras",
      "port-jebel-ali",
    ]) {
      expect(ports.has(id)).toBe(true);
    }
  });
});

describe("commercial message generation", () => {
  it("builds editable quote message from structured fields only", () => {
    const draft = generateCommercialMessageDraft({
      type: "QUOTE",
      contactName: "Ada Merchant",
      companyName: "Ada Shipping",
      originName: "Rotterdam",
      destinationName: "Alexandria",
      cargoDescription: "steel",
      weightTons: 2000,
      preferredVesselType: "general_cargo",
      recipientOrganization: "Falcon Freight Group",
    });
    expect(draft.subject).toContain("Rotterdam");
    expect(draft.subject).toContain("Alexandria");
    expect(draft.body).toContain("2,000 tons");
    expect(draft.body).toContain("steel");
    expect(draft.body).toContain("Falcon Freight Group");
    expect(draft.body.toLowerCase()).not.toMatch(/\$\d|€\d|usd\s*\d|rate:\s*\d/i);
    expect(draft.generator).toBe("deterministic_template");
  });

  it("marks reservation wording as request not booking", () => {
    const draft = generateCommercialMessageDraft({
      type: "RESERVATION",
      contactName: "Ada",
      originName: "Rotterdam",
      destinationName: "Alexandria",
      noVesselPreference: true,
    });
    expect(draft.body.toLowerCase()).toContain("reservation request");
    expect(draft.body.toLowerCase()).not.toContain("confirmed booking completed");
  });

  it("handles missing cargo fields", () => {
    const draft = generateCommercialMessageDraft({
      type: "QUOTE",
      contactName: "Ada",
      originName: "Rotterdam",
      destinationName: "Alexandria",
    });
    expect(draft.body).toContain("Origin: Rotterdam");
    expect(draft.body).not.toContain("Cargo:");
  });
});

describe("request status lifecycle + intent preservation", () => {
  it("stores intent and request with search context", async () => {
    const search = runMaritimeRouteSearch({
      query: "2,000 tons of steel from Rotterdam to Alexandria",
      vessels: [],
    });
    await saveIntent({
      id: "intent-demo",
      workflow: "price",
      search,
      selectedVessel: null,
      selectedPort: null,
      createdAt: new Date().toISOString(),
    });
    const intent = await getIntent("intent-demo");
    expect(intent?.search.origin?.name).toMatch(/Rotterdam/i);
    expect(intent?.search.destination?.name).toMatch(/Alexandria/i);
    expect(intent?.search.cargo?.description).toBe("steel");
    expect(
      intent?.search.cargo?.quantityTons === 2000 ||
        intent?.search.cargo?.quantityText?.includes("2,000"),
    ).toBe(true);

    const user = await createUser({
      id: "user-1",
      email: "u@example.com",
      passwordHash: await hashPassword("securepass1"),
      fullName: "User",
    });

    const now = new Date().toISOString();
    const request: CommercialRequest = {
      id: "req-1",
      type: "QUOTE",
      userId: user.id,
      status: "DRAFT",
      searchContext: search,
      origin: search.origin,
      destination: search.destination,
      cargo: { description: "steel", weightTons: 2000 },
      verifiedFreightRateAvailable: false,
      freightRateNote: NO_VERIFIED_RATE_NOTE,
      createdAt: now,
      updatedAt: now,
    };
    await saveRequest(request);
    const loaded = await getRequest("req-1");
    expect(loaded?.status).toBe("DRAFT");
    expect(loaded?.verifiedFreightRateAvailable).toBe(false);

    loaded!.status = "READY_TO_SEND";
    loaded!.updatedAt = new Date().toISOString();
    await saveRequest(loaded!);
    expect((await getRequest("req-1"))?.status).toBe("READY_TO_SEND");
  });

  it("never fabricates pricing on idle search draft", () => {
    const draft = buildCommercialRequestDraft({
      type: "QUOTE",
      search: createIdleSearchState(),
    });
    expect(draft.verifiedFreightRateAvailable).toBe(false);
    expect(draft.freightRateNote).toContain("Not available");
  });
});

describe("auth protection helpers", () => {
  it("requires credentials for commercial store users", async () => {
    const login = await loginUser({ email: "nobody@example.com", password: "x" });
    expect("error" in login).toBe(true);
  });
});
