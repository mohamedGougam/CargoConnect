/**
 * Call the protected shipment observation job endpoint.
 * Never prints SHIPMENT_OBSERVATION_JOB_SECRET.
 *
 * Usage:
 *   npx tsx scripts/cron-validate.ts
 *   CRON_VALIDATE_BASE_URL=https://your-app.onrender.com npx tsx scripts/cron-validate.ts
 *   CRON_VALIDATE_TWICE=true npx tsx scripts/cron-validate.ts   # overlap / lease check
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config();

async function callOnce(base: string, secret: string) {
  const res = await fetch(`${base}/api/internal/shipment-observation/run`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
    },
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { httpStatus: res.status, body };
}

function summarize(label: string, httpStatus: number, body: Record<string, unknown>) {
  return {
    step: label,
    httpStatus,
    ok: body.ok === true,
    skipped: body.skipped === true,
    reason: body.reason ?? null,
    activeExecutions: body.activeExecutions ?? null,
    matchedVessels: body.matchedVessels ?? null,
    observationsIngested: body.observationsIngested ?? null,
    observationsSkipped: body.observationsSkipped ?? null,
    errors: body.errors ?? null,
    aisMode: body.aisMode ?? null,
    errorCode:
      body.error && typeof body.error === "object"
        ? (body.error as { code?: string }).code
        : null,
  };
}

async function main() {
  const secret = process.env.SHIPMENT_OBSERVATION_JOB_SECRET?.trim();
  const base = (
    process.env.CRON_VALIDATE_BASE_URL?.trim() ||
    process.env.APP_BASE_URL?.trim() ||
    "http://127.0.0.1:3000"
  ).replace(/\/$/, "");

  console.log(
    JSON.stringify({
      step: "config",
      baseUrl: base,
      secretPresent: Boolean(secret),
      secretLengthOk: Boolean(secret && secret.length >= 16),
      twice: process.env.CRON_VALIDATE_TWICE === "true",
    }),
  );

  if (!secret || secret.length < 16) {
    console.log(
      JSON.stringify({
        step: "fatal",
        error: "SHIPMENT_OBSERVATION_JOB_SECRET missing or shorter than 16 chars",
      }),
    );
    process.exit(1);
  }

  const first = await callOnce(base, secret);
  console.log(JSON.stringify(summarize("run_1", first.httpStatus, first.body)));

  if (process.env.CRON_VALIDATE_TWICE === "true") {
    const second = await callOnce(base, secret);
    console.log(JSON.stringify(summarize("run_2", second.httpStatus, second.body)));
    console.log(
      JSON.stringify({
        step: "overlap_note",
        leaseSafe:
          second.body.skipped === true ||
          (second.body.ok === true && second.httpStatus === 200),
      }),
    );
  }

  if (first.httpStatus === 401 || first.httpStatus === 503) {
    process.exit(1);
  }
  if (first.body.ok !== true && first.httpStatus >= 500) {
    process.exit(1);
  }
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
