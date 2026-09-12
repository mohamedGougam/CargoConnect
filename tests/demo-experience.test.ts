import { beforeEach, describe, expect, it } from "vitest";
import { runMaritimeRouteSearch } from "@/lib/search/runSearch";
import { resetCommercialStoreForTests } from "@/server/commercial/repos";

describe("demo experience polish", () => {
  beforeEach(async () => {
    process.env.COMMERCIAL_STORE = "memory";
    process.env.DEMO_MODE = "true";
    delete process.env.DATABASE_URL;
    delete process.env.COMMERCIAL_PERSISTENCE;
    await resetCommercialStoreForTests();
  });

  it("parses the flagship Rotterdam → Alexandria steel query", async () => {
    const result = await runMaritimeRouteSearch({
      query: "2,000 MT steel from Rotterdam to Alexandria",
      vessels: [],
    });
    expect(result.status).toBe("active");
    expect(result.origin?.name).toMatch(/Rotterdam/i);
    expect(result.destination?.name).toMatch(/Alexandria/i);
    expect(result.cargo?.description?.toLowerCase()).toMatch(/steel/);
    expect(result.cargo?.quantityTons).toBe(2000);
  });

  it("hides demo status when DEMO_MODE is off", async () => {
    process.env.DEMO_MODE = "false";
    const { GET } = await import("@/app/api/demo/status/route");
    const res = await GET();
    const json = (await res.json()) as { demoMode: boolean };
    expect(json.demoMode).toBe(false);
  });

  it("exposes demo status when DEMO_MODE is on", async () => {
    process.env.DEMO_MODE = "true";
    const { GET } = await import("@/app/api/demo/status/route");
    const res = await GET();
    const json = (await res.json()) as {
      demoMode: boolean;
      brokerFixturesAvailable: boolean;
    };
    expect(json.demoMode).toBe(true);
    expect(json.brokerFixturesAvailable).toBe(true);
  });

  it("refuses broker fixtures when postgres is configured", async () => {
    process.env.DEMO_MODE = "true";
    process.env.COMMERCIAL_PERSISTENCE = "postgres";
    process.env.DATABASE_URL = "postgres://example.invalid/db";
    const { POST } = await import("@/app/api/demo/broker-responses/route");
    const res = await POST(
      new Request("http://localhost/api/demo/broker-responses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: "x" }),
      }),
    );
    expect(res.status).toBe(409);
    delete process.env.DATABASE_URL;
    delete process.env.COMMERCIAL_PERSISTENCE;
  });
});
