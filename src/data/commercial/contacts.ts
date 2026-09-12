import type { CommercialContact } from "@/domain/commercial/types";

/**
 * Curated MVP commercial directory (~10 ports).
 * Only emails that appear on publicly cited sources are included.
 * Missing email = unavailable (never fabricated).
 *
 * verifiedAt: research date for this CargoConnect curation pass.
 */
export const COMMERCIAL_CONTACTS: CommercialContact[] = [
  {
    id: "cc-rotterdam-broekman",
    organizationName: "Broekman Logistics",
    contactType: "SHIPPING_AGENT",
    portId: "port-rotterdam",
    portName: "Rotterdam",
    email: "sales.rtm@broekmanlogistics.com",
    phone: "+31 (0)10 487 3911",
    website: "https://www.broekmanlogistics.com/",
    sourceUrl: "https://freightforwarderservices.com/rotterdam/",
    verifiedAt: "2026-09-10",
    notes: "Ocean / logistics commercial inbox listed for Rotterdam operations.",
  },
  {
    id: "cc-rotterdam-port-authority",
    organizationName: "Port of Rotterdam Authority",
    contactType: "PORT_COMMERCIAL",
    portId: "port-rotterdam",
    portName: "Rotterdam",
    email: "info@portofrotterdam.com",
    phone: "+31 (0)10 252 1010",
    website: "https://www.portofrotterdam.com/en/contact",
    sourceUrl: "https://www.portofrotterdam.com/en/contact",
    verifiedAt: "2026-09-10",
    notes: "General port authority contact — not a freight broker.",
  },
  {
    id: "cc-antwerp-broekman",
    organizationName: "Broekman Logistics NV",
    contactType: "BROKER",
    portId: "port-antwerp",
    portName: "Antwerp",
    email: "Info.be@broekmanlogistics.com",
    phone: "+32 (0)3 544 33 22",
    website: "https://www.broekmanlogistics.com/",
    sourceUrl: "https://www.forwardbelgium.be/",
    verifiedAt: "2026-09-10",
    notes: "Listed on Forward Belgium membership materials.",
  },
  {
    id: "cc-antwerp-ims",
    organizationName: "IMS Shipping (Antwerp HQ)",
    contactType: "SHIPPING_AGENT",
    portId: "port-antwerp",
    portName: "Antwerp",
    email: "Antwerp@ims-shipping.com",
    website: "https://www.ims-shipping.com/",
    sourceUrl:
      "https://www.ims-shipping.com/en/agents-port-information/agents-ims-lines-africa/ims-shipping-antwerp-hq",
    verifiedAt: "2026-09-10",
  },
  {
    id: "cc-hamburg-placeholder",
    organizationName: "Port of Hamburg — commercial inquiry",
    contactType: "PORT_COMMERCIAL",
    portId: "port-hamburg",
    portName: "Hamburg",
    website: "https://www.hafen-hamburg.de/",
    sourceUrl: "https://www.hafen-hamburg.de/",
    verifiedAt: "2026-09-10",
    notes:
      "No single public freight-broker email confidently verified for this MVP pass — email left unavailable.",
  },
  {
    id: "cc-piraeus-alma",
    organizationName: "AL-MA Customs Brokers",
    contactType: "BROKER",
    portId: "port-piraeus",
    portName: "Piraeus",
    email: "info@al-ma.net",
    phone: "+30 210 417 7750",
    website: "https://www.al-ma.net/",
    sourceUrl: "https://www.al-ma.net/",
    verifiedAt: "2026-09-10",
  },
  {
    id: "cc-thessaloniki-placeholder",
    organizationName: "Thessaloniki — commercial inquiry",
    contactType: "OTHER",
    portId: "port-thessaloniki",
    portName: "Thessaloniki",
    website: "https://www.thpa.gr/",
    sourceUrl: "https://www.thpa.gr/",
    verifiedAt: "2026-09-10",
    notes: "Legitimate commercial email not verified in this curation pass.",
  },
  {
    id: "cc-istanbul-placeholder",
    organizationName: "Istanbul / Ambarlı — commercial inquiry",
    contactType: "OTHER",
    portId: "port-istanbul",
    portName: "Istanbul",
    website: "https://www.portofambarli.com/",
    sourceUrl: "https://www.portofambarli.com/",
    verifiedAt: "2026-09-10",
    notes: "Legitimate commercial email not verified in this curation pass.",
  },
  {
    id: "cc-alexandria-falcon",
    organizationName: "Falcon Freight Group",
    contactType: "BROKER",
    portId: "port-alexandria",
    portName: "Alexandria",
    email: "info@falconfg.com",
    phone: "+20 (3) 483-3655",
    website: "https://www.falconfg.com/",
    sourceUrl: "https://www.falconfg.com/",
    verifiedAt: "2026-09-10",
  },
  {
    id: "cc-alexandria-blueocean",
    organizationName: "Blue Ocean Marine",
    contactType: "SHIPPING_AGENT",
    portId: "port-alexandria",
    portName: "Alexandria",
    email: "shipping@blueoceanmarine.com.eg",
    website: "https://blueoceanmarine.com.eg/",
    sourceUrl: "https://blueoceanmarine.com.eg/",
    verifiedAt: "2026-09-10",
  },
  {
    id: "cc-alexandria-triton",
    organizationName: "Triton Egypt for Shipping Agencies",
    contactType: "SHIPPING_AGENT",
    portId: "port-alexandria",
    portName: "Alexandria",
    email: "info@tritoneg.com",
    phone: "+203 48 77 374",
    website: "https://tritoneg.com/",
    sourceUrl: "https://tritoneg.com/",
    verifiedAt: "2026-09-10",
  },
  {
    id: "cc-portsaid-placeholder",
    organizationName: "Port Said — commercial inquiry",
    contactType: "OTHER",
    portId: "port-said",
    portName: "Port Said",
    website: "https://www.sczone.eg/",
    sourceUrl: "https://www.sczone.eg/",
    verifiedAt: "2026-09-10",
    notes: "Legitimate commercial email not verified in this curation pass.",
  },
  {
    id: "cc-algeciras-steinweg",
    organizationName: "C. Steinweg-Iberia (Algeciras via Barcelona desk)",
    contactType: "SHIPPING_AGENT",
    portId: "port-algeciras",
    portName: "Algeciras",
    email: "barcelona@es.steinweg.com",
    phone: "+34 932 987 870",
    website: "https://www.steinweg.com/locations/algeciras/",
    sourceUrl: "https://www.steinweg.com/locations/algeciras/",
    verifiedAt: "2026-09-10",
    notes: "Steinweg directs Algeciras forwarding inquiries to the Barcelona office.",
  },
  {
    id: "cc-jebelali-placeholder",
    organizationName: "DP World / Jebel Ali — commercial inquiry",
    contactType: "PORT_COMMERCIAL",
    portId: "port-jebel-ali",
    portName: "Jebel Ali",
    website: "https://www.dpworld.com/",
    sourceUrl: "https://www.dpworld.com/",
    verifiedAt: "2026-09-10",
    notes:
      "Corporate portal exists; no single public Jebel Ali commercial inbox confidently verified for this MVP — email left unavailable.",
  },
];

export function listCommercialContacts(): CommercialContact[] {
  return COMMERCIAL_CONTACTS;
}

export function getContactsForPort(portId: string): CommercialContact[] {
  return COMMERCIAL_CONTACTS.filter((c) => c.portId === portId);
}

export function getContactById(id: string): CommercialContact | undefined {
  return COMMERCIAL_CONTACTS.find((c) => c.id === id);
}

/** Prefer destination port contacts that have a verified email. */
export function suggestContactsForDestination(portId: string | undefined): {
  contacts: CommercialContact[];
  suggested?: CommercialContact;
  missingEmail: boolean;
} {
  if (!portId) {
    return { contacts: [], missingEmail: true };
  }
  const contacts = getContactsForPort(portId);
  const withEmail = contacts.filter((c) => Boolean(c.email));
  return {
    contacts,
    suggested: withEmail[0] ?? contacts[0],
    missingEmail: withEmail.length === 0,
  };
}
