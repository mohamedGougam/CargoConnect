import { describe, expect, it } from "vitest";
import {
  createMapChromeUiState,
  enterMapFullscreen,
  exitMapFullscreen,
  handleMapChromeEscape,
  isSearchChromeVisible,
  setSummaryCollapsed,
  shouldKeepActiveRouteVisible,
  toggleSummaryCollapsed,
} from "@/lib/map/mapChromeUi";

describe("map chrome UI (collapse + fullscreen)", () => {
  it("A: collapse result panel", () => {
    const next = toggleSummaryCollapsed(createMapChromeUiState());
    expect(next.summaryCollapsed).toBe(true);
  });

  it("B: expand result panel", () => {
    const collapsed = createMapChromeUiState({ summaryCollapsed: true });
    const next = toggleSummaryCollapsed(collapsed);
    expect(next.summaryCollapsed).toBe(false);
  });

  it("C: search/collapse state preserved while collapsed (presentation only)", () => {
    const state = setSummaryCollapsed(createMapChromeUiState(), true);
    // Toggling collapse must not invent fullscreen or reset other fields
    expect(state.mapFullscreen).toBe(false);
    expect(state.summaryCollapsed).toBe(true);
    const again = toggleSummaryCollapsed(state);
    expect(again.summaryCollapsed).toBe(false);
    expect(again.mapFullscreen).toBe(false);
  });

  it("D: enter fullscreen", () => {
    const next = enterMapFullscreen(createMapChromeUiState());
    expect(next.mapFullscreen).toBe(true);
  });

  it("E: top search UI hidden in fullscreen", () => {
    const next = enterMapFullscreen(createMapChromeUiState());
    expect(isSearchChromeVisible(next)).toBe(false);
  });

  it("F: active route remains visible in fullscreen", () => {
    const next = enterMapFullscreen(createMapChromeUiState());
    expect(shouldKeepActiveRouteVisible(next, true)).toBe(true);
    expect(shouldKeepActiveRouteVisible(next, false)).toBe(false);
  });

  it("G: exit fullscreen restores search chrome visibility", () => {
    const entered = enterMapFullscreen(createMapChromeUiState());
    const exited = exitMapFullscreen(entered);
    expect(exited.mapFullscreen).toBe(false);
    expect(isSearchChromeVisible(exited)).toBe(true);
  });

  it("H: collapse state restored after fullscreen", () => {
    let state = setSummaryCollapsed(createMapChromeUiState(), true);
    state = enterMapFullscreen(state);
    expect(state.summaryCollapsed).toBe(true);
    state = exitMapFullscreen(state);
    expect(state.summaryCollapsed).toBe(true);
    expect(isSearchChromeVisible(state)).toBe(true);
  });

  it("I: Escape exits fullscreen when no drawer is open", () => {
    const state = enterMapFullscreen(createMapChromeUiState());
    const next = handleMapChromeEscape(state, { drawerOrModalOpen: false });
    expect(next.mapFullscreen).toBe(false);
  });

  it("I2: Escape does not exit fullscreen when drawer owns Escape", () => {
    const state = enterMapFullscreen(
      createMapChromeUiState({ summaryCollapsed: true }),
    );
    const next = handleMapChromeEscape(state, { drawerOrModalOpen: true });
    expect(next.mapFullscreen).toBe(true);
    expect(next.summaryCollapsed).toBe(true);
  });

  it("J: UI-only actions never imply search reset fields", () => {
    // These helpers only touch chrome flags — callers must not clear RouteSearchState.
    let state = createMapChromeUiState();
    state = setSummaryCollapsed(state, true);
    state = enterMapFullscreen(state);
    state = exitMapFullscreen(state);
    state = toggleSummaryCollapsed(state);
    expect(state).toEqual({
      summaryCollapsed: false,
      mapFullscreen: false,
    });
  });
});
