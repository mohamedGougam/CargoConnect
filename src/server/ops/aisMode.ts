/**
 * AIS provider mode — commercial launch gate.
 * AISStream remains the development/demo feed. Do not claim licensed unless
 * an operator explicitly sets AIS_PROVIDER_MODE=licensed after confirming rights.
 */

export type AisProviderMode = "development" | "licensed";

export function getAisProviderMode(): AisProviderMode {
  const raw = (process.env.AIS_PROVIDER_MODE ?? "development").trim().toLowerCase();
  if (raw === "licensed") return "licensed";
  return "development";
}

export function getAisProviderLabel(): string {
  const mode = getAisProviderMode();
  if (mode === "licensed") {
    return "Licensed AIS provider (operator-configured)";
  }
  return "Development / Demo AIS feed (AISStream) — not a licensed commercial tracking product unless rights are confirmed";
}

export function isDevelopmentAisMode(): boolean {
  return getAisProviderMode() === "development";
}
