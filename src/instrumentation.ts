/**
 * Next.js instrumentation — start AIS ingest when the server boots (if configured).
 * Failures must never crash the app; sample mode remains usable.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "edge") return;

  try {
    const { getMaritimeServerConfig } = await import("./server/maritime/config");
    const config = getMaritimeServerConfig();
    if (!config.canConnectAis) return;

    const { ensureAisIngestStarted } = await import("./server/maritime/ais/ingest");
    await ensureAisIngestStarted();
  } catch (err) {
    console.warn(
      "[CargoConnect] AIS ingest bootstrap skipped:",
      err instanceof Error ? err.message : err,
    );
  }
}
