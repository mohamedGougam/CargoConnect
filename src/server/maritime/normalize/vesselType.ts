import type { VesselType } from "@/domain/models";

/**
 * Deterministic AIS ship & cargo type (ITU-R M.1371) → CargoConnect category.
 *
 * AIS cargo codes (70–79) do NOT distinguish container vs bulk vs general with
 * enough precision for commercial claims — those map to general_cargo.
 * Unknown / unsupported codes stay unknown.
 */
export function normalizeAisShipType(code: number | undefined | null): VesselType {
  if (code === undefined || code === null || !Number.isFinite(code)) return "unknown";
  const n = Math.trunc(code);
  if (n < 0 || n > 99) return "unknown";

  if (n === 30) return "fishing";
  if (n === 31 || n === 32 || n === 52) return "tug_service";
  // 33 — vessel engaged in dredging / underwater ops
  if (n === 33) return "other";
  // 34 — diving; 35 — military
  if (n === 34 || n === 35) return "other";
  // 36 — sailing; 37 — pleasure craft
  if (n === 36 || n === 37) return "pleasure";
  // 40–49 high-speed craft
  if (n >= 40 && n <= 49) return "other";
  // 50 — pilot; 51 — SAR; 53–55 special
  if (n === 50 || n === 51 || (n >= 53 && n <= 55)) return "other";
  if (n >= 60 && n <= 69) return "passenger";
  // AIS 70–79 cargo — do not invent container vs bulk without more signal
  if (n >= 70 && n <= 79) return "general_cargo";
  if (n >= 80 && n <= 89) return "tanker";
  // 90–99 other / no additional info
  if (n >= 90 && n <= 99) return "other";
  if (n === 0) return "unknown";
  return "other";
}

export function cargoCategoryForVesselType(type: VesselType): string {
  switch (type) {
    case "container":
      return "Container";
    case "general_cargo":
      return "General cargo";
    case "bulk_carrier":
      return "Bulk";
    case "tanker":
      return "Tanker";
    case "ro_ro":
      return "Ro-Ro";
    case "multipurpose":
      return "Multipurpose";
    case "passenger":
      return "Passenger";
    case "tug_service":
      return "Tug / service";
    case "fishing":
      return "Fishing";
    case "pleasure":
      return "Pleasure / sailing";
    case "other":
      return "Other";
    case "unknown":
    default:
      return "Unknown";
  }
}

/** MID (digits 1–3 of MMSI) → ISO-ish flag label. Partial table for MVP. */
const MID_FLAG: Record<string, string> = {
  "201": "Albania",
  "202": "Andorra",
  "203": "Austria",
  "204": "Portugal",
  "205": "Belgium",
  "206": "Belarus",
  "207": "Bulgaria",
  "208": "Vatican",
  "209": "Cyprus",
  "210": "Cyprus",
  "211": "Germany",
  "212": "Cyprus",
  "213": "Georgia",
  "214": "Moldova",
  "215": "Malta",
  "216": "Armenia",
  "218": "Germany",
  "219": "Denmark",
  "220": "Denmark",
  "224": "Spain",
  "225": "Spain",
  "226": "France",
  "227": "France",
  "228": "France",
  "229": "Malta",
  "230": "Finland",
  "231": "Faroe Islands",
  "232": "United Kingdom",
  "233": "United Kingdom",
  "234": "United Kingdom",
  "235": "United Kingdom",
  "236": "Gibraltar",
  "237": "Greece",
  "238": "Croatia",
  "239": "Greece",
  "240": "Greece",
  "241": "Greece",
  "242": "Morocco",
  "243": "Hungary",
  "244": "Netherlands",
  "245": "Netherlands",
  "246": "Netherlands",
  "247": "Italy",
  "248": "Malta",
  "249": "Malta",
  "250": "Ireland",
  "251": "Iceland",
  "252": "Liechtenstein",
  "253": "Luxembourg",
  "254": "Monaco",
  "255": "Portugal",
  "256": "Malta",
  "257": "Norway",
  "258": "Norway",
  "259": "Norway",
  "261": "Poland",
  "263": "Portugal",
  "264": "Romania",
  "265": "Sweden",
  "266": "Sweden",
  "267": "Slovakia",
  "268": "San Marino",
  "269": "Switzerland",
  "270": "Czech Republic",
  "271": "Turkey",
  "272": "Ukraine",
  "273": "Russia",
  "274": "North Macedonia",
  "275": "Latvia",
  "276": "Estonia",
  "277": "Lithuania",
  "278": "Slovenia",
  "279": "Serbia",
  "338": "United States",
  "366": "United States",
  "367": "United States",
  "368": "United States",
  "369": "United States",
  "412": "China",
  "413": "China",
  "414": "China",
  "416": "Taiwan",
  "431": "Japan",
  "432": "Japan",
  "440": "South Korea",
  "441": "South Korea",
  "470": "United Arab Emirates",
  "471": "United Arab Emirates",
  "477": "Hong Kong",
  "503": "Australia",
  "525": "Indonesia",
  "533": "Malaysia",
  "538": "Marshall Islands",
  "563": "Singapore",
  "564": "Singapore",
  "565": "Singapore",
  "566": "Singapore",
  "636": "Liberia",
  "657": "India",
};

export function flagFromMmsi(mmsi: string | undefined): string | undefined {
  if (!mmsi || mmsi.length < 3) return undefined;
  return MID_FLAG[mmsi.slice(0, 3)];
}
