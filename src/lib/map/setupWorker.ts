import { setWorkerUrl } from "maplibre-gl";

let configured = false;

/**
 * MapLibre GeoJSON/vector processing runs in a Web Worker.
 * Next.js/Turbopack often fails to resolve the default blob worker URL,
 * which leaves sources permanently unloaded (invisible vessels/routes/ports).
 */
export function ensureMapLibreWorker(): void {
  if (configured || typeof window === "undefined") return;
  setWorkerUrl(`${window.location.origin}/maplibre-gl-worker.mjs`);
  configured = true;
}
