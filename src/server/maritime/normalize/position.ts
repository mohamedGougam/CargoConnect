export function isValidLatitude(lat: number): boolean {
  return Number.isFinite(lat) && lat >= -90 && lat <= 90;
}

export function isValidLongitude(lon: number): boolean {
  return Number.isFinite(lon) && lon >= -180 && lon <= 180;
}

/** AIS uses 91 / 181 as “not available”. */
export function isUsableAisPosition(lat: number, lon: number): boolean {
  if (!isValidLatitude(lat) || !isValidLongitude(lon)) return false;
  if (Math.abs(lat) >= 90 || Math.abs(lon) >= 180) return false;
  // Reject null-island spam unless explicitly in tiny bbox (we still allow 0,0 if rare)
  return true;
}

export function isValidSpeedKnots(sog: number): boolean {
  return Number.isFinite(sog) && sog >= 0 && sog < 102.2; // AIS max / N/A sentinel ~102.3
}

export function isValidCourseDegrees(cog: number): boolean {
  return Number.isFinite(cog) && cog >= 0 && cog < 360;
}

export function isValidHeadingDegrees(heading: number): boolean {
  // 511 = not available in AIS
  return Number.isFinite(heading) && heading >= 0 && heading < 360;
}

export function sanitizeMmsi(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  const digits = String(value).replace(/\D/g, "");
  if (digits.length !== 9) return undefined;
  if (digits === "000000000") return undefined;
  return digits;
}

export function sanitizeImo(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  const n = typeof value === "number" ? value : Number(String(value).replace(/\D/g, ""));
  if (!Number.isFinite(n) || n <= 0 || n >= 1_000_000_000) return undefined;
  return String(Math.trunc(n));
}

export function sanitizeShipName(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const cleaned = value.replace(/@+/g, " ").replace(/\0/g, "").trim().replace(/\s+/g, " ");
  if (!cleaned) return undefined;
  return cleaned;
}

export function sanitizeCallsign(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const cleaned = value.replace(/@+/g, "").trim();
  if (!cleaned) return undefined;
  return cleaned;
}
