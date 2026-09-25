import { state } from './state.js';
import { renderAllRoutes, renderSelectedToursRoutes } from './routes.js';
import { announce, TOURS_CHANGED } from './events.js';

export function toggleTourSelection(tourId) {
  if (state.selectedIds.has(tourId)) {
    state.selectedIds.delete(tourId);
  } else {
    state.selectedIds.add(tourId);
  }
  announce(TOURS_CHANGED);
  renderSelectedToursRoutes();
}

export function enterSelectMode() {
  state.selectMode = true;
  announce(TOURS_CHANGED);
}

// Long-press only — a plain tap opens the detail panel instead.
export function enterSingleSelect(tourId) {
  enterSelectMode();
  toggleTourSelection(tourId);
}

export function exitSelectMode() {
  state.selectMode = false;
  state.selectedIds.clear();
  announce(TOURS_CHANGED);
  renderAllRoutes();
}
