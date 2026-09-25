// @ts-check

// A fixed-position popover centred on its container, but never closer than
// minimumLeft to the viewport's left edge.
export function centeredLeft({ containerLeft, containerWidth, elementWidth, minimumLeft }) {
  return Math.max(minimumLeft, containerLeft + (containerWidth - elementWidth) / 2);
}

// A dialog's first focusable is its close button; focus lands on the control
// after it when there is one.
export function initialFocusIndex(focusableCount) {
  return focusableCount > 1 ? 1 : 0;
}

// Expanding the map from a mobile tour preview pulls the map out of the detail
// panel; collapsing again puts it back there instead of showing the list's
// map button.
export function mapExpandTransition({ expanded, wasInDetail, expandedFromDetail }) {
  if (expanded) return { expandedFromDetail: wasInDetail, returnToDetail: false, showFab: false };
  return {
    expandedFromDetail: false,
    returnToDetail: expandedFromDetail,
    showFab: !expandedFromDetail,
  };
}
