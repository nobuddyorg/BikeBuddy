// @ts-check

// Which of the sidebar's mutually exclusive states to show: signed out,
// loading, load error, empty, or the tour list.
export function sidebarViewState({ signedIn, loadingTours, toursLoadFailed, tourCount }) {
  const loading = signedIn && loadingTours;
  const failed = signedIn && !loading && toursLoadFailed;
  const settled = signedIn && !loading && !failed;
  return {
    signedIn,
    loading,
    failed,
    empty: settled && tourCount === 0,
    hasTours: settled && tourCount > 0,
  };
}
