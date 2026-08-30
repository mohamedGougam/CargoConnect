import { NextResponse } from "next/server";
import { getMaritimeServerConfig } from "@/server/maritime/config";
import {
  ensureAisIngestStarted,
  getAisIngestDiagnostics,
} from "@/server/maritime/ais/ingest";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/maritime/diagnostics
 * Development / explicitly enabled only. Never exposes API keys.
 */
export async function GET() {
  const config = getMaritimeServerConfig();
  if (!config.diagnosticsEnabled) {
    return NextResponse.json({ error: "Diagnostics disabled" }, { status: 404 });
  }

  if (config.canConnectAis) {
    await ensureAisIngestStarted();
  }

  const diag = getAisIngestDiagnostics();

  return NextResponse.json({
    mode: config.mode,
    publicMode: config.publicMode,
    effectiveMode: config.effectiveMode,
    aisstreamEnabled: config.aisstreamEnabled,
    hasApiKey: Boolean(config.apiKey),
    canConnectAis: config.canConnectAis,
    feed: {
      connectionState: diag.connectionState,
      vesselsInCache: diag.vesselsInCache,
      vesselsWithPosition: diag.vesselsWithPosition,
      vesselsWithName: diag.vesselsWithName,
      uniqueMmsis: diag.uniqueMmsis,
      messagesReceived: diag.messagesReceived,
      positionMessages: diag.positionMessages,
      staticMessages: diag.staticMessages,
      ignoredMessages: diag.ignoredMessages,
      lastMessageAt: diag.lastMessageAt,
      lastError: diag.lastError,
      startedAt: diag.startedAt,
      bboxes: diag.bboxes,
      regionNote: diag.regionNote,
    },
    licensingNote:
      "AISStream is for DEVELOPMENT / PROTOTYPE use only until commercial/public-display rights are confirmed.",
  });
}
