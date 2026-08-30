#!/usr/bin/env node
/**
 * Print maritime diagnostics (dev server must be running for live feed stats).
 * Usage: npm run maritime:status
 */
const base = process.env.MARITIME_STATUS_URL ?? "http://localhost:3000";

async function main() {
  const url = `${base.replace(/\/$/, "")}/api/maritime/diagnostics`;
  try {
    const res = await fetch(url);
    const body = await res.json();
    if (!res.ok) {
      console.error("Diagnostics unavailable:", body);
      process.exit(1);
    }
    console.log(JSON.stringify(body, null, 2));
  } catch (err) {
    console.error(
      "Could not reach diagnostics. Is `npm run dev` running?\n",
      err instanceof Error ? err.message : err,
    );
    process.exit(1);
  }
}

main();
