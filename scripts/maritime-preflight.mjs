#!/usr/bin/env node
/**
 * Preflight for live AIS prototype activation.
 * Does not print secrets. Exits non-zero if live cannot start.
 *
 * Usage: npm run maritime:preflight
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const envPath = path.join(root, ".env.local");

function parseEnv(filePath) {
  const out = {};
  if (!existsSync(filePath)) return out;
  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const i = trimmed.indexOf("=");
    if (i < 0) continue;
    const key = trimmed.slice(0, i).trim();
    let value = trimmed.slice(i + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

const env = { ...process.env, ...parseEnv(envPath) };
const publicMode = env.NEXT_PUBLIC_MARITIME_DATA_MODE || env.NEXT_PUBLIC_DATA_PROVIDER || "sample";
const serverMode = env.MARITIME_DATA_MODE || "sample";
const enabled = /^(1|true|yes)$/i.test(env.AISSTREAM_ENABLED || "");
const hasKey = Boolean((env.AISSTREAM_API_KEY || "").trim());
const liveRequested =
  publicMode === "live" ||
  publicMode === "composite" ||
  serverMode === "live" ||
  serverMode === "composite";

const report = {
  envLocalPresent: existsSync(envPath),
  NEXT_PUBLIC_MARITIME_DATA_MODE: publicMode,
  MARITIME_DATA_MODE: serverMode,
  AISSTREAM_ENABLED: enabled,
  AISSTREAM_API_KEY_present: hasKey,
  AISSTREAM_API_KEY_length: hasKey ? String(env.AISSTREAM_API_KEY).trim().length : 0,
  liveRequested,
  canConnectAis: liveRequested && enabled && hasKey,
  defaultBbox:
    "[[[30.0,22.0],[41.5,37.0]]] — Eastern Mediterranean (Greece / Aegean / Crete / W. Turkey / Cyprus approaches)",
  howToGetKey: "https://aisstream.io/ → sign in with GitHub → Account → create API key",
  nextStepsIfReady: [
    "Set NEXT_PUBLIC_MARITIME_DATA_MODE=composite",
    "Set MARITIME_DATA_MODE=composite",
    "Set AISSTREAM_ENABLED=true",
    "Set AISSTREAM_API_KEY=<your key>",
    "Restart npm run dev",
    "Open http://localhost:3000 and run npm run maritime:status",
  ],
};

console.log(JSON.stringify(report, null, 2));

if (!report.canConnectAis) {
  console.error("\nLive AIS prototype is NOT ready — missing key and/or flags.");
  console.error("Obtain a free prototype key at https://aisstream.io/ (do not commit it).");
  process.exit(2);
}

console.error("\nLive AIS prototype configuration looks ready (key present, flags on).");
process.exit(0);
