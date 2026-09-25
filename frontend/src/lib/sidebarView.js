// @ts-check

// Signed out, loading, error, empty and the list are mutually exclusive sidebar states.
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
