// @ts-check

export function centeredLeft({ containerLeft, containerWidth, elementWidth, minimumLeft }) {
  return Math.max(minimumLeft, containerLeft + (containerWidth - elementWidth) / 2);
}

// A dialog's first focusable is its close button; focus starts on the control after it.
export function initialFocusIndex(focusableCount) {
  return focusableCount > 1 ? 1 : 0;
}

// A map expanded from the mobile tour preview collapses back into it, not to the list.
export function mapExpandTransition({ expanded, wasInDetail, expandedFromDetail }) {
  if (expanded) return { expandedFromDetail: wasInDetail, returnToDetail: false, showFab: false };
  return {
    expandedFromDetail: false,
    returnToDetail: expandedFromDetail,
    showFab: !expandedFromDetail,
  };
}
