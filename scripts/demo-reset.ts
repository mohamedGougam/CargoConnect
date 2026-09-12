/**
 * Safely reset in-memory demo commercial state.
 * Never touches PostgreSQL. Never prints secrets.
 *
 * In-process (same Node as Next):
 *   DEMO_MODE=true npx tsx scripts/demo-reset.ts --local
 *
 * Against a running app:
 *   DEMO_MODE=true DEMO_RESET_SECRET=... npx tsx scripts/demo-reset.ts
 *   DEMO_RESET_BASE_URL=https://… npx tsx scripts/demo-reset.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config();

async function main() {
  const local = process.argv.includes("--local");
  const demoMode = (process.env.DEMO_MODE ?? "").trim().toLowerCase() === "true";
  const hasDb = Boolean(process.env.DATABASE_URL?.trim());
  const persistence = (process.env.COMMERCIAL_PERSISTENCE ?? "").trim().toLowerCase();

  console.log(
    JSON.stringify({
      step: "config",
      demoMode,
      databaseUrlPresent: hasDb,
      commercialPersistence: persistence || "(unset)",
      commercialStore: process.env.COMMERCIAL_STORE?.trim() || "(unset)",
      mode: local ? "local_in_process" : "http",
    }),
  );

  if (!demoMode) {
    console.log(
      JSON.stringify({
        step: "fatal",
        error: "DEMO_MODE=true required",
      }),
    );
    process.exit(1);
  }

  if (hasDb || persistence === "postgres") {
    console.log(
      JSON.stringify({
        step: "fatal",
        error:
          "Refusing reset — DATABASE_URL or COMMERCIAL_PERSISTENCE=postgres is set. Demo reset never targets Postgres.",
      }),
    );
    process.exit(1);
  }

  if (local) {
    process.env.COMMERCIAL_STORE = "memory";
    const { resetDemoCommercialStore } = await import(
      "../src/server/commercial/repos"
    );
    const result = await resetDemoCommercialStore();
    console.log(JSON.stringify({ step: "result", ...result }));
    process.exit(0);
  }

  const secret =
    process.env.DEMO_RESET_SECRET?.trim() ||
    process.env.INTERNAL_OPS_SECRET?.trim();
  const base = (
    process.env.DEMO_RESET_BASE_URL?.trim() ||
    process.env.APP_BASE_URL?.trim() ||
    "http://127.0.0.1:3000"
  ).replace(/\/$/, "");

  if (!secret || secret.length < 16) {
    console.log(
      JSON.stringify({
        step: "fatal",
        error:
          "DEMO_RESET_SECRET or INTERNAL_OPS_SECRET (≥16 chars) required for HTTP reset — or use --local",
      }),
    );
    process.exit(1);
  }

  const res = await fetch(`${base}/api/internal/demo/reset`, {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}` },
  });
  const body = await res.json().catch(() => ({}));
  console.log(
    JSON.stringify({
      step: "result",
      httpStatus: res.status,
      body,
    }),
  );
  process.exit(res.ok ? 0 : 1);
}

main().catch((err) => {
  console.error(
    JSON.stringify({
      step: "fatal",
      error: err instanceof Error ? err.message : String(err),
    }),
  );
  process.exit(1);
});
