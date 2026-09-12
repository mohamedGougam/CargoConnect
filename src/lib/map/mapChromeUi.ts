/**
 * Presentation-only map chrome state (collapse + fullscreen).
 * Must never trigger search, OpenAI, or route recalculation.
 */

export interface MapChromeUiState {
  summaryCollapsed: boolean;
  mapFullscreen: boolean;
}

export function createMapChromeUiState(
  overrides?: Partial<MapChromeUiState>,
): MapChromeUiState {
  return {
    summaryCollapsed: false,
    mapFullscreen: false,
    ...overrides,
  };
}

export function toggleSummaryCollapsed(
  state: MapChromeUiState,
): MapChromeUiState {
  return { ...state, summaryCollapsed: !state.summaryCollapsed };
}

export function setSummaryCollapsed(
  state: MapChromeUiState,
  collapsed: boolean,
): MapChromeUiState {
  return { ...state, summaryCollapsed: collapsed };
}

export function enterMapFullscreen(state: MapChromeUiState): MapChromeUiState {
  return { ...state, mapFullscreen: true };
}

export function exitMapFullscreen(state: MapChromeUiState): MapChromeUiState {
  return { ...state, mapFullscreen: false };
}

/**
 * Escape exits map fullscreen only when no drawer/modal owns the key.
 * Collapse state is preserved across enter/exit.
 */
export function handleMapChromeEscape(
  state: MapChromeUiState,
  options: { drawerOrModalOpen: boolean },
): MapChromeUiState {
  if (options.drawerOrModalOpen) return state;
  if (!state.mapFullscreen) return state;
  return exitMapFullscreen(state);
}

/** Top search chrome is hidden while map fullscreen is active. */
export function isSearchChromeVisible(state: MapChromeUiState): boolean {
  return !state.mapFullscreen;
}

/** Active route/corridor must remain visible in fullscreen (search state untouched). */
export function shouldKeepActiveRouteVisible(
  state: MapChromeUiState,
  searchActive: boolean,
): boolean {
  void state;
  return searchActive;
}
