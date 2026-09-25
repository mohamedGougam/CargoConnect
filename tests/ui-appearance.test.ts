import { describe, expect, it } from "vitest";
import {
  appearanceForMapTheme,
  mapThemeForAppearance,
} from "@/lib/ui/appearance";

describe("ui appearance", () => {
  it("pairs Day appearance with Day View map theme", () => {
    expect(mapThemeForAppearance("day")).toBe("day-view");
    expect(mapThemeForAppearance("night")).toBe("premium-maritime");
  });

  it("derives appearance from map theme", () => {
    expect(appearanceForMapTheme("day-view")).toBe("day");
    expect(appearanceForMapTheme("premium-maritime")).toBe("night");
    expect(appearanceForMapTheme("modern-navigation")).toBe("night");
  });
});
