import type { VesselType } from "@/domain/models";

const ICON_SIZE = 96;

type IconSpec = {
  id: string;
  fill: string;
  accent: string;
  silhouette: "container" | "bulk" | "tanker" | "roro" | "general" | "multi";
};

const SPECS: Record<VesselType, IconSpec> = {
  container: {
    id: "cc-vessel-container",
    fill: "#7dd3c0",
    accent: "#134e4a",
    silhouette: "container",
  },
  general_cargo: {
    id: "cc-vessel-general",
    fill: "#9fd4c4",
    accent: "#1a3a34",
    silhouette: "general",
  },
  bulk_carrier: {
    id: "cc-vessel-bulk",
    fill: "#86b8c4",
    accent: "#1e3a44",
    silhouette: "bulk",
  },
  tanker: {
    id: "cc-vessel-tanker",
    fill: "#c4b5a0",
    accent: "#3f3428",
    silhouette: "tanker",
  },
  ro_ro: {
    id: "cc-vessel-roro",
    fill: "#8eb8d4",
    accent: "#1c3344",
    silhouette: "roro",
  },
  multipurpose: {
    id: "cc-vessel-multi",
    fill: "#a8c5b5",
    accent: "#243830",
    silhouette: "multi",
  },
  passenger: {
    id: "cc-vessel-passenger",
    fill: "#b8c4d4",
    accent: "#2a3444",
    silhouette: "multi",
  },
  tug_service: {
    id: "cc-vessel-tug",
    fill: "#a0b8a8",
    accent: "#24382c",
    silhouette: "general",
  },
  fishing: {
    id: "cc-vessel-fishing",
    fill: "#8cb8a0",
    accent: "#1e3a30",
    silhouette: "general",
  },
  pleasure: {
    id: "cc-vessel-pleasure",
    fill: "#9cb4c8",
    accent: "#243848",
    silhouette: "roro",
  },
  other: {
    id: "cc-vessel-other",
    fill: "#94a8a8",
    accent: "#2a3838",
    silhouette: "multi",
  },
  unknown: {
    id: "cc-vessel-unknown",
    fill: "#889898",
    accent: "#2a3434",
    silhouette: "multi",
  },
};

export function vesselIconId(type: VesselType): string {
  return SPECS[type].id;
}

export function registerVesselIcons(map: {
  hasImage: (id: string) => boolean;
  addImage: (id: string, image: ImageData, options?: { pixelRatio?: number }) => void;
}): void {
  (Object.keys(SPECS) as VesselType[]).forEach((type) => {
    const spec = SPECS[type];
    if (map.hasImage(spec.id)) return;
    const image = renderShipIcon(spec);
    if (image) map.addImage(spec.id, image, { pixelRatio: 2 });
  });
}

function renderShipIcon(spec: IconSpec): ImageData | null {
  const canvas = document.createElement("canvas");
  canvas.width = ICON_SIZE;
  canvas.height = ICON_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.clearRect(0, 0, ICON_SIZE, ICON_SIZE);
  ctx.translate(ICON_SIZE / 2, ICON_SIZE / 2);

  // Soft glow so ships read against dark ocean
  ctx.beginPath();
  ctx.ellipse(0, 2, 16, 22, 0, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(94, 234, 212, 0.18)";
  ctx.fill();

  ctx.fillStyle = spec.fill;
  ctx.strokeStyle = spec.accent;
  ctx.lineWidth = 2.2;
  ctx.lineJoin = "round";

  drawSilhouette(ctx, spec.silhouette);
  ctx.fill();
  ctx.stroke();

  // Deck highlight
  ctx.beginPath();
  ctx.moveTo(0, -18);
  ctx.lineTo(3, -4);
  ctx.lineTo(-3, -4);
  ctx.closePath();
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.fill();

  return ctx.getImageData(0, 0, ICON_SIZE, ICON_SIZE);
}

function drawSilhouette(
  ctx: CanvasRenderingContext2D,
  kind: IconSpec["silhouette"],
): void {
  ctx.beginPath();
  // Nose points up (course 0 = north); MapLibre rotates via property
  switch (kind) {
    case "container":
      ctx.moveTo(0, -26);
      ctx.lineTo(9, -8);
      ctx.lineTo(11, 8);
      ctx.lineTo(8, 22);
      ctx.lineTo(0, 18);
      ctx.lineTo(-8, 22);
      ctx.lineTo(-11, 8);
      ctx.lineTo(-9, -8);
      break;
    case "bulk":
      ctx.moveTo(0, -24);
      ctx.lineTo(10, -6);
      ctx.lineTo(12, 10);
      ctx.lineTo(7, 22);
      ctx.lineTo(-7, 22);
      ctx.lineTo(-12, 10);
      ctx.lineTo(-10, -6);
      break;
    case "tanker":
      ctx.moveTo(0, -22);
      ctx.bezierCurveTo(8, -14, 11, -2, 11, 8);
      ctx.lineTo(8, 22);
      ctx.lineTo(-8, 22);
      ctx.lineTo(-11, 8);
      ctx.bezierCurveTo(-11, -2, -8, -14, 0, -22);
      break;
    case "roro":
      ctx.moveTo(0, -24);
      ctx.lineTo(10, -10);
      ctx.lineTo(10, 14);
      ctx.lineTo(6, 22);
      ctx.lineTo(-6, 22);
      ctx.lineTo(-10, 14);
      ctx.lineTo(-10, -10);
      break;
    case "multi":
      ctx.moveTo(0, -25);
      ctx.lineTo(8, -12);
      ctx.lineTo(10, 4);
      ctx.lineTo(7, 20);
      ctx.lineTo(0, 16);
      ctx.lineTo(-7, 20);
      ctx.lineTo(-10, 4);
      ctx.lineTo(-8, -12);
      break;
    case "general":
    default:
      ctx.moveTo(0, -26);
      ctx.lineTo(10, 8);
      ctx.lineTo(0, 4);
      ctx.lineTo(-10, 8);
      break;
  }
  ctx.closePath();
}
