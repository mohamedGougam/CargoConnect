import { describe, expect, it } from "vitest";
import { resolveMapStyleForTheme } from "@/lib/map/style";
import {
  DEFAULT_VISUAL_THEME_ID,
  VISUAL_THEME_IDS,
  resolveVisualTheme,
} from "@/lib/map/visualThemes";

describe("visual themes (style-only)", () => {
  it("resolves all three exploration themes", () => {
    expect(VISUAL_THEME_IDS).toHaveLength(3);
    for (const id of VISUAL_THEME_IDS) {
      const theme = resolveVisualTheme(id);
      expect(theme.id).toBe(id);
      expect(theme.corridor.coreWidth[0]).toBeLessThan(theme.corridor.glowWidth[0]);
      expect(theme.clusters.radii[0]).toBeLessThanOrEqual(theme.clusters.radii[2]);
    }
  });

  it("defaults to premium maritime", () => {
    expect(resolveVisualTheme(null).id).toBe(DEFAULT_VISUAL_THEME_ID);
    expect(resolveVisualTheme("unknown").id).toBe("premium-maritime");
  });

  it("keeps free Esri tile sources when applying theme raster tunes", () => {
    const theme = resolveVisualTheme("premium-maritime");
    const style = resolveMapStyleForTheme("dark", theme);
    expect(typeof style).toBe("object");
    if (typeof style === "string") return;
    const sources = Object.values(style.sources ?? {});
    expect(sources.length).toBeGreaterThan(0);
    for (const source of sources) {
      if (source.type !== "raster" || !("tiles" in source)) continue;
      for (const tile of source.tiles ?? []) {
        expect(tile).toContain("arcgisonline.com");
        expect(tile).not.toContain("mapbox");
        expect(tile).not.toContain("maptiler");
      }
    }
  });
});
