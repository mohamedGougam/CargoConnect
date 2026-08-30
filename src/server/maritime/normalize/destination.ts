/**
 * Conservative destination cleanup only.
 * Does not claim equivalence to an official port.
 */
export function normalizeDestinationRaw(raw: string | undefined | null): string | undefined {
  if (raw === undefined || raw === null) return undefined;
  let s = raw.replace(/@+/g, " ").replace(/\0/g, "").trim();
  s = s.replace(/\s+/g, " ");
  if (!s) return undefined;
  // Drop obvious placeholders
  const upper = s.toUpperCase();
  if (upper === "NULL" || upper === "N/A" || upper === "NA" || upper === "NONE") {
    return undefined;
  }
  return s;
}

/** Light display form — uppercase trimmed; still not a port match. */
export function normalizeDestinationDisplay(raw: string | undefined): string | undefined {
  const cleaned = normalizeDestinationRaw(raw);
  if (!cleaned) return undefined;
  return cleaned.toUpperCase();
}
