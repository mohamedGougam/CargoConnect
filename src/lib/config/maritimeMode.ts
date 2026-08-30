export type MaritimeDataMode = "sample" | "live" | "composite";

/** Client-safe mode resolution (NEXT_PUBLIC_* only). */
export function getClientMaritimeMode(): MaritimeDataMode {
  return parseMaritimeMode(
    process.env.NEXT_PUBLIC_MARITIME_DATA_MODE ?? process.env.NEXT_PUBLIC_DATA_PROVIDER,
  );
}

export function parseMaritimeMode(value: string | undefined): MaritimeDataMode {
  if (value === "live" || value === "composite" || value === "sample") return value;
  return "sample";
}
