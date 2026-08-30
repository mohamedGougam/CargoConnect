import type { MaritimeRoute, Vessel } from "@/domain/models";
import { chainMaritimeWaypoints, maritimeArc } from "@/lib/map/routes";
import { PORT_COORDS } from "./sample-ports";

const P = PORT_COORDS;

function posOnArc(
  fromId: string,
  toId: string,
  t: number,
  preferSouth = true,
): { longitude: number; latitude: number; course: number } {
  const arc = maritimeArc(P[fromId], P[toId], { segments: 12, preferSouth });
  const idx = Math.min(arc.length - 2, Math.max(0, Math.floor(t * (arc.length - 1))));
  const a = arc[idx];
  const b = arc[Math.min(arc.length - 1, idx + 1)];
  const bearing =
    (Math.atan2(b.longitude - a.longitude, b.latitude - a.latitude) * 180) / Math.PI;
  return {
    longitude: a.longitude + (b.longitude - a.longitude) * 0.35,
    latitude: a.latitude + (b.latitude - a.latitude) * 0.35,
    course: (bearing + 360) % 360,
  };
}

/**
 * Isolated demonstration vessels for UI/map wiring only.
 * Positions are illustrative. Not live AIS.
 */
export const SAMPLE_VESSELS: Vessel[] = [
  {
    id: "vsl-aegean-star",
    name: "AEGEAN STAR",
    imo: "9401123",
    mmsi: "241234000",
    type: "general_cargo",
    cargoCategory: "Steel & project cargo",
    flag: "Greece",
    ...(() => {
      const p = posOnArc("port-piraeus", "port-alexandria", 0.35);
      return {
        position: { longitude: p.longitude, latitude: p.latitude },
        course: p.course,
      };
    })(),
    speed: 12.4,
    originPortId: "port-piraeus",
    destinationPortId: "port-alexandria",
    eta: "2026-09-02T14:00:00Z",
    status: "underway",
    specifications: {
      lengthMeters: 168,
      beamMeters: 25,
      draftMeters: 9.2,
      grossTonnage: 18500,
      deadweightTons: 28000,
      yearBuilt: 2012,
    },
    cargo: {
      capacityTons: 25000,
      currentCargoDescription: "Steel coils",
      availableCapacityTons: 4200,
    },
  },
  {
    id: "vsl-hellenic-forge",
    name: "HELLENIC FORGE",
    type: "general_cargo",
    cargoCategory: "Steel products",
    flag: "Greece",
    ...(() => {
      const p = posOnArc("port-piraeus", "port-said", 0.55);
      return {
        position: { longitude: p.longitude, latitude: p.latitude },
        course: p.course,
      };
    })(),
    speed: 11.2,
    originPortId: "port-piraeus",
    destinationPortId: "port-said",
    eta: "2026-09-03T09:00:00Z",
    status: "underway",
    specifications: {
      lengthMeters: 148,
      beamMeters: 22,
      deadweightTons: 21000,
      yearBuilt: 2010,
    },
    cargo: {
      capacityTons: 19000,
      currentCargoDescription: "Steel plates",
      availableCapacityTons: 1500,
    },
  },
  {
    id: "vsl-nordic-bulk",
    name: "NORDIC BULK",
    imo: "9614455",
    type: "bulk_carrier",
    cargoCategory: "Dry bulk",
    flag: "Norway",
    ...(() => {
      const p = posOnArc("port-hamburg", "port-alexandria", 0.42, true);
      return {
        position: { longitude: p.longitude, latitude: p.latitude },
        course: p.course,
      };
    })(),
    speed: 11.1,
    originPortId: "port-hamburg",
    destinationPortId: "port-alexandria",
    eta: "2026-09-08T08:00:00Z",
    status: "underway",
    specifications: {
      lengthMeters: 225,
      beamMeters: 32,
      draftMeters: 12.8,
      deadweightTons: 82000,
      yearBuilt: 2016,
    },
    cargo: {
      capacityTons: 78000,
      currentCargoDescription: "Grain",
      availableCapacityTons: 0,
    },
  },
  {
    id: "vsl-baltic-ore",
    name: "BALTIC ORE",
    type: "bulk_carrier",
    cargoCategory: "Dry bulk",
    flag: "Liberia",
    ...(() => {
      const p = posOnArc("port-hamburg", "port-algeciras", 0.28);
      return {
        position: { longitude: p.longitude, latitude: p.latitude },
        course: p.course,
      };
    })(),
    speed: 10.6,
    originPortId: "port-hamburg",
    destinationPortId: "port-algeciras",
    eta: "2026-09-06T12:00:00Z",
    status: "underway",
    specifications: {
      lengthMeters: 190,
      beamMeters: 30,
      deadweightTons: 56000,
      yearBuilt: 2013,
    },
  },
  {
    id: "vsl-rotterdam-express",
    name: "ROTTERDAM EXPRESS",
    imo: "9778890",
    type: "container",
    cargoCategory: "Containers",
    flag: "Netherlands",
    ...(() => {
      const p = posOnArc("port-rotterdam", "port-singapore", 0.18);
      return {
        position: { longitude: p.longitude, latitude: p.latitude },
        course: p.course,
      };
    })(),
    speed: 16.2,
    originPortId: "port-rotterdam",
    destinationPortId: "port-singapore",
    eta: "2026-09-22T06:00:00Z",
    status: "underway",
    specifications: {
      lengthMeters: 366,
      beamMeters: 51,
      draftMeters: 15.5,
      deadweightTons: 145000,
      yearBuilt: 2019,
    },
    cargo: { capacityTeu: 14500, currentCargoDescription: "Mixed containerized cargo" },
  },
  {
    id: "vsl-schelde-box",
    name: "SCHELDE BOX",
    type: "container",
    cargoCategory: "Containers",
    flag: "Belgium",
    ...(() => {
      const p = posOnArc("port-antwerp", "port-algeciras", 0.4);
      return {
        position: { longitude: p.longitude, latitude: p.latitude },
        course: p.course,
      };
    })(),
    speed: 15.4,
    originPortId: "port-antwerp",
    destinationPortId: "port-algeciras",
    eta: "2026-09-05T16:00:00Z",
    status: "underway",
    specifications: {
      lengthMeters: 300,
      beamMeters: 40,
      deadweightTons: 98000,
      yearBuilt: 2017,
    },
    cargo: { capacityTeu: 9000 },
  },
  {
    id: "vsl-med-trader",
    name: "MED TRADER",
    type: "multipurpose",
    cargoCategory: "Machinery & breakbulk",
    flag: "Malta",
    ...(() => {
      const p = posOnArc("port-rotterdam", "port-alexandria", 0.55);
      return {
        position: { longitude: p.longitude, latitude: p.latitude },
        course: p.course,
      };
    })(),
    speed: 10.8,
    originPortId: "port-rotterdam",
    destinationPortId: "port-alexandria",
    eta: "2026-09-05T18:00:00Z",
    status: "underway",
    specifications: {
      lengthMeters: 142,
      beamMeters: 21,
      draftMeters: 8.4,
      deadweightTons: 18500,
      yearBuilt: 2009,
    },
    cargo: {
      capacityTons: 16000,
      currentCargoDescription: "Industrial machinery",
      availableCapacityTons: 3100,
    },
  },
  {
    id: "vsl-project-north",
    name: "PROJECT NORTH",
    type: "multipurpose",
    cargoCategory: "Project cargo",
    flag: "Netherlands",
    ...(() => {
      const p = posOnArc("port-antwerp", "port-istanbul", 0.48);
      return {
        position: { longitude: p.longitude, latitude: p.latitude },
        course: p.course,
      };
    })(),
    speed: 11.5,
    originPortId: "port-antwerp",
    destinationPortId: "port-istanbul",
    eta: "2026-09-07T10:00:00Z",
    status: "underway",
    specifications: {
      lengthMeters: 138,
      beamMeters: 20,
      deadweightTons: 14000,
      yearBuilt: 2015,
    },
    cargo: { capacityTons: 12000, currentCargoDescription: "Wind turbine components" },
  },
  {
    id: "vsl-bosporus-link",
    name: "BOSPORUS LINK",
    type: "container",
    cargoCategory: "Containers",
    flag: "Türkiye",
    ...(() => {
      const p = posOnArc("port-istanbul", "port-piraeus", 0.5);
      return {
        position: { longitude: p.longitude, latitude: p.latitude },
        course: p.course,
      };
    })(),
    speed: 13.2,
    originPortId: "port-istanbul",
    destinationPortId: "port-piraeus",
    eta: "2026-09-02T20:00:00Z",
    status: "underway",
    specifications: {
      lengthMeters: 210,
      beamMeters: 30,
      deadweightTons: 42000,
      yearBuilt: 2014,
    },
    cargo: { capacityTeu: 3500 },
  },
  {
    id: "vsl-nile-breeze",
    name: "NILE BREEZE",
    type: "general_cargo",
    cargoCategory: "General cargo",
    flag: "Egypt",
    position: { longitude: 29.7, latitude: 31.35 },
    course: 0,
    speed: 0.2,
    originPortId: "port-piraeus",
    destinationPortId: "port-alexandria",
    status: "moored",
    specifications: {
      lengthMeters: 118,
      beamMeters: 18,
      deadweightTons: 9500,
      yearBuilt: 2007,
    },
  },
  {
    id: "vsl-suez-relay",
    name: "SUEZ RELAY",
    type: "container",
    cargoCategory: "Containers",
    flag: "Singapore",
    ...(() => {
      const p = posOnArc("port-said", "port-jebel-ali", 0.35);
      return {
        position: { longitude: p.longitude, latitude: p.latitude },
        course: p.course,
      };
    })(),
    speed: 15.8,
    originPortId: "port-said",
    destinationPortId: "port-jebel-ali",
    eta: "2026-09-09T04:00:00Z",
    status: "underway",
    specifications: {
      lengthMeters: 320,
      beamMeters: 42,
      deadweightTons: 105000,
      yearBuilt: 2018,
    },
    cargo: { capacityTeu: 11000 },
  },
  {
    id: "vsl-gulf-carrier",
    name: "GULF CARRIER",
    type: "tanker",
    cargoCategory: "Liquid bulk",
    flag: "Marshall Islands",
    ...(() => {
      const p = posOnArc("port-jebel-ali", "port-algeciras", 0.25);
      return {
        position: { longitude: p.longitude, latitude: p.latitude },
        course: p.course,
      };
    })(),
    speed: 12.0,
    originPortId: "port-jebel-ali",
    destinationPortId: "port-algeciras",
    eta: "2026-09-18T08:00:00Z",
    status: "underway",
    specifications: {
      lengthMeters: 250,
      beamMeters: 44,
      deadweightTons: 115000,
      yearBuilt: 2016,
    },
  },
  {
    id: "vsl-asia-link",
    name: "ASIA LINK",
    type: "container",
    cargoCategory: "Containers",
    flag: "Hong Kong",
    ...(() => {
      const p = posOnArc("port-singapore", "port-shanghai", 0.4);
      return {
        position: { longitude: p.longitude, latitude: p.latitude },
        course: p.course,
      };
    })(),
    speed: 14.3,
    originPortId: "port-singapore",
    destinationPortId: "port-shanghai",
    eta: "2026-09-06T04:00:00Z",
    status: "underway",
    specifications: {
      lengthMeters: 300,
      beamMeters: 40,
      deadweightTons: 95000,
      yearBuilt: 2017,
    },
    cargo: { capacityTeu: 8500 },
  },
  {
    id: "vsl-pacific-bridge",
    name: "PACIFIC BRIDGE",
    type: "container",
    cargoCategory: "Containers",
    flag: "Singapore",
    ...(() => {
      const p = posOnArc("port-shanghai", "port-los-angeles", 0.45, false);
      return {
        position: { longitude: p.longitude, latitude: p.latitude },
        course: p.course,
      };
    })(),
    speed: 17.5,
    originPortId: "port-shanghai",
    destinationPortId: "port-los-angeles",
    eta: "2026-09-18T12:00:00Z",
    status: "underway",
    specifications: {
      lengthMeters: 335,
      beamMeters: 48,
      deadweightTons: 110000,
      yearBuilt: 2018,
    },
    cargo: { capacityTeu: 12000 },
  },
  {
    id: "vsl-atlantic-ro",
    name: "ATLANTIC RO",
    type: "ro_ro",
    cargoCategory: "Vehicles & rolling cargo",
    flag: "Bahamas",
    ...(() => {
      const p = posOnArc("port-hamburg", "port-algeciras", 0.62);
      return {
        position: { longitude: p.longitude, latitude: p.latitude },
        course: p.course,
      };
    })(),
    speed: 15.0,
    originPortId: "port-hamburg",
    destinationPortId: "port-algeciras",
    eta: "2026-09-10T09:00:00Z",
    status: "underway",
    specifications: {
      lengthMeters: 200,
      beamMeters: 32,
      deadweightTons: 22000,
      yearBuilt: 2014,
    },
  },
  {
    id: "vsl-levante-ro",
    name: "LEVANTE RO",
    type: "ro_ro",
    cargoCategory: "Vehicles",
    flag: "Italy",
    ...(() => {
      const p = posOnArc("port-algeciras", "port-piraeus", 0.45);
      return {
        position: { longitude: p.longitude, latitude: p.latitude },
        course: p.course,
      };
    })(),
    speed: 14.1,
    originPortId: "port-algeciras",
    destinationPortId: "port-piraeus",
    eta: "2026-09-04T22:00:00Z",
    status: "underway",
    specifications: {
      lengthMeters: 185,
      beamMeters: 28,
      deadweightTons: 18000,
      yearBuilt: 2012,
    },
  },
  {
    id: "vsl-baltic-forge",
    name: "BALTIC FORGE",
    type: "general_cargo",
    cargoCategory: "Steel products",
    flag: "Finland",
    ...(() => {
      const p = posOnArc("port-hamburg", "port-piraeus", 0.5);
      return {
        position: { longitude: p.longitude, latitude: p.latitude },
        course: p.course,
      };
    })(),
    speed: 11.6,
    originPortId: "port-hamburg",
    destinationPortId: "port-piraeus",
    eta: "2026-09-07T11:00:00Z",
    status: "underway",
    specifications: {
      lengthMeters: 155,
      beamMeters: 23,
      deadweightTons: 22000,
      yearBuilt: 2011,
    },
    cargo: {
      capacityTons: 20000,
      currentCargoDescription: "Steel plates",
      availableCapacityTons: 1800,
    },
  },
  {
    id: "vsl-rhine-feeder",
    name: "RHINE FEEDER",
    type: "container",
    cargoCategory: "Containers",
    flag: "Germany",
    ...(() => {
      const p = posOnArc("port-rotterdam", "port-hamburg", 0.5, false);
      return {
        position: { longitude: p.longitude, latitude: p.latitude },
        course: p.course,
      };
    })(),
    speed: 12.8,
    originPortId: "port-rotterdam",
    destinationPortId: "port-hamburg",
    eta: "2026-09-01T18:00:00Z",
    status: "underway",
    specifications: {
      lengthMeters: 160,
      beamMeters: 24,
      deadweightTons: 18000,
      yearBuilt: 2019,
    },
    cargo: { capacityTeu: 1400 },
  },
  {
    id: "vsl-marmara-bulk",
    name: "MARMARA BULK",
    type: "bulk_carrier",
    cargoCategory: "Agricultural bulk",
    flag: "Türkiye",
    ...(() => {
      const p = posOnArc("port-istanbul", "port-alexandria", 0.4);
      return {
        position: { longitude: p.longitude, latitude: p.latitude },
        course: p.course,
      };
    })(),
    speed: 10.9,
    originPortId: "port-istanbul",
    destinationPortId: "port-alexandria",
    eta: "2026-09-04T06:00:00Z",
    status: "underway",
    specifications: {
      lengthMeters: 180,
      beamMeters: 28,
      deadweightTons: 45000,
      yearBuilt: 2011,
    },
    cargo: { capacityTons: 42000, currentCargoDescription: "Wheat" },
  },
  {
    id: "vsl-red-sea-multi",
    name: "RED SEA MULTI",
    type: "multipurpose",
    cargoCategory: "Breakbulk",
    flag: "Cyprus",
    ...(() => {
      const p = posOnArc("port-said", "port-jebel-ali", 0.6);
      return {
        position: { longitude: p.longitude, latitude: p.latitude },
        course: p.course,
      };
    })(),
    speed: 11.0,
    originPortId: "port-said",
    destinationPortId: "port-jebel-ali",
    eta: "2026-09-11T14:00:00Z",
    status: "underway",
    specifications: {
      lengthMeters: 130,
      beamMeters: 19,
      deadweightTons: 12000,
      yearBuilt: 2008,
    },
  },
  {
    id: "vsl-gibraltar-tank",
    name: "GIBRALTAR TANK",
    type: "tanker",
    cargoCategory: "Refined products",
    flag: "Malta",
    ...(() => {
      const p = posOnArc("port-algeciras", "port-rotterdam", 0.35);
      return {
        position: { longitude: p.longitude, latitude: p.latitude },
        course: p.course,
      };
    })(),
    speed: 11.8,
    originPortId: "port-algeciras",
    destinationPortId: "port-rotterdam",
    eta: "2026-09-08T20:00:00Z",
    status: "underway",
    specifications: {
      lengthMeters: 183,
      beamMeters: 32,
      deadweightTons: 48000,
      yearBuilt: 2015,
    },
  },
  {
    id: "vsl-aegean-box",
    name: "AEGEAN BOX",
    type: "container",
    cargoCategory: "Containers",
    flag: "Greece",
    ...(() => {
      const p = posOnArc("port-piraeus", "port-istanbul", 0.3);
      return {
        position: { longitude: p.longitude, latitude: p.latitude },
        course: p.course,
      };
    })(),
    speed: 13.5,
    originPortId: "port-piraeus",
    destinationPortId: "port-istanbul",
    eta: "2026-09-02T08:00:00Z",
    status: "underway",
    specifications: {
      lengthMeters: 175,
      beamMeters: 27,
      deadweightTons: 24000,
      yearBuilt: 2016,
    },
    cargo: { capacityTeu: 2200 },
  },
  {
    id: "vsl-dubai-express",
    name: "DUBAI EXPRESS",
    type: "container",
    cargoCategory: "Containers",
    flag: "UAE",
    ...(() => {
      const p = posOnArc("port-jebel-ali", "port-singapore", 0.33);
      return {
        position: { longitude: p.longitude, latitude: p.latitude },
        course: p.course,
      };
    })(),
    speed: 16.0,
    originPortId: "port-jebel-ali",
    destinationPortId: "port-singapore",
    eta: "2026-09-12T02:00:00Z",
    status: "underway",
    specifications: {
      lengthMeters: 340,
      beamMeters: 46,
      deadweightTons: 120000,
      yearBuilt: 2020,
    },
    cargo: { capacityTeu: 13000 },
  },
  {
    id: "vsl-anchor-haven",
    name: "ANCHOR HAVEN",
    type: "bulk_carrier",
    cargoCategory: "Dry bulk",
    flag: "Panama",
    position: { longitude: 4.35, latitude: 51.9 },
    course: 90,
    speed: 0.1,
    originPortId: "port-rotterdam",
    destinationPortId: "port-alexandria",
    status: "at_anchor",
    specifications: {
      lengthMeters: 200,
      beamMeters: 32,
      deadweightTons: 60000,
      yearBuilt: 2009,
    },
  },
];

function route(
  id: string,
  originPortId: string,
  destinationPortId: string,
  via: string[] = [],
  bulge = 0.16,
): MaritimeRoute {
  const points = [P[originPortId], ...via.map((v) => P[v]), P[destinationPortId]];
  return {
    id,
    originPortId,
    destinationPortId,
    waypoints: chainMaritimeWaypoints(points, { segmentsPerLeg: 7, bulge }),
  };
}

export const SAMPLE_ROUTES: MaritimeRoute[] = [
  route("rte-piraeus-alexandria", "port-piraeus", "port-alexandria", [], 0.12),
  route("rte-piraeus-said", "port-piraeus", "port-said", [], 0.1),
  route(
    "rte-hamburg-alexandria",
    "port-hamburg",
    "port-alexandria",
    ["port-algeciras"],
    0.14,
  ),
  route("rte-hamburg-algeciras", "port-hamburg", "port-algeciras", [], 0.18),
  route(
    "rte-rotterdam-singapore",
    "port-rotterdam",
    "port-singapore",
    ["port-algeciras", "port-said", "port-jebel-ali"],
    0.1,
  ),
  route("rte-antwerp-algeciras", "port-antwerp", "port-algeciras", [], 0.18),
  route(
    "rte-rotterdam-alexandria",
    "port-rotterdam",
    "port-alexandria",
    ["port-algeciras"],
    0.12,
  ),
  route(
    "rte-antwerp-istanbul",
    "port-antwerp",
    "port-istanbul",
    ["port-algeciras", "port-piraeus"],
    0.1,
  ),
  route("rte-istanbul-piraeus", "port-istanbul", "port-piraeus", [], 0.08),
  route("rte-said-jebel", "port-said", "port-jebel-ali", [], 0.12),
  route("rte-jebel-algeciras", "port-jebel-ali", "port-algeciras", ["port-said"], 0.1),
  route("rte-singapore-shanghai", "port-singapore", "port-shanghai", [], 0.12),
  route("rte-shanghai-lax", "port-shanghai", "port-los-angeles", [], 0.22),
  route("rte-algeciras-piraeus", "port-algeciras", "port-piraeus", [], 0.1),
  route("rte-hamburg-piraeus", "port-hamburg", "port-piraeus", ["port-algeciras"], 0.12),
  route("rte-rotterdam-hamburg", "port-rotterdam", "port-hamburg", [], 0.05),
  route("rte-istanbul-alexandria", "port-istanbul", "port-alexandria", [], 0.1),
  route("rte-algeciras-rotterdam", "port-algeciras", "port-rotterdam", [], 0.16),
  route("rte-piraeus-istanbul", "port-piraeus", "port-istanbul", [], 0.08),
  route("rte-jebel-singapore", "port-jebel-ali", "port-singapore", [], 0.12),
];
