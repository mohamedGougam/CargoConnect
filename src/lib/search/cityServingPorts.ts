/**
 * Explicit city → serving-port mappings.
 * Same-country only. Never used for unrelated ports.
 * Confidence for these matches is MEDIUM.
 */
export interface CityServingPortRule {
  /** ISO country code the city belongs to. */
  countryCode: string;
  /** UN/LOCODEs of ports that serve this city (same country). */
  servingUnlocodes: string[];
  /** Optional human note for diagnostics. */
  note?: string;
}

/**
 * Keys are normalized city labels (lowercase, accents stripped by resolver).
 */
export const CITY_SERVING_PORTS: Record<string, CityServingPortRule> = {
  athens: {
    countryCode: "GR",
    servingUnlocodes: ["GRPIR"],
    note: "Athens is served by Piraeus",
  },
  athina: {
    countryCode: "GR",
    servingUnlocodes: ["GRPIR"],
  },
  athen: {
    countryCode: "GR",
    servingUnlocodes: ["GRPIR"],
  },
  dubai: {
    countryCode: "AE",
    servingUnlocodes: ["AEJEA", "AEDXB"],
    note: "Dubai area → Jebel Ali / Port Rashid",
  },
  "new york": {
    countryCode: "US",
    servingUnlocodes: ["USNYC", "USEWR"],
    note: "New York / New Jersey complex",
  },
  nyc: {
    countryCode: "US",
    servingUnlocodes: ["USNYC", "USEWR"],
  },
  "long beach": {
    countryCode: "US",
    servingUnlocodes: ["USLGB", "USLAX"],
  },
};

/** Country/region display names → ISO country code for catalogue filtering. */
export const COUNTRY_QUERY_CODES: Record<string, string> = {
  netherlands: "NL",
  holland: "NL",
  nederland: "NL",
  norway: "NO",
  norge: "NO",
  spain: "ES",
  espana: "ES",
  españa: "ES",
  algeria: "DZ",
  algerie: "DZ",
  algérie: "DZ",
  greece: "GR",
  egypt: "EG",
  egypte: "EG",
  ägypten: "EG",
  aegypten: "EG",
  germany: "DE",
  deutschland: "DE",
  belgium: "BE",
  belgie: "BE",
  belgië: "BE",
  singapore: "SG",
  malaysia: "MY",
  china: "CN",
  india: "IN",
  "united states": "US",
  usa: "US",
  "united arab emirates": "AE",
  uae: "AE",
  turkey: "TR",
  türkiye: "TR",
  japan: "JP",
  australia: "AU",
  france: "FR",
  italy: "IT",
  "united kingdom": "GB",
  uk: "GB",
};

export const COUNTRY_CODE_NAMES: Record<string, string> = {
  NL: "Netherlands",
  NO: "Norway",
  ES: "Spain",
  DZ: "Algeria",
  GR: "Greece",
  EG: "Egypt",
  DE: "Germany",
  BE: "Belgium",
  SG: "Singapore",
  MY: "Malaysia",
  CN: "China",
  IN: "India",
  US: "United States",
  AE: "United Arab Emirates",
  TR: "Turkey",
  JP: "Japan",
  AU: "Australia",
  FR: "France",
  IT: "Italy",
  GB: "United Kingdom",
};
