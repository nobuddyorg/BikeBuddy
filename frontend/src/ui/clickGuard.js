// Long enough for the compatibility click a touch gesture leaves behind; the
// timeout covers browsers that never send one, where nothing else would
// clear the guard.
const GHOST_CLICK_WINDOW_MS = 400;

// Swallows the next click inside `scope` once armed. `indicator` carries
// data-click-guard while the guard is up, so a test can wait for it to drop.
export function createClickGuard({ scope, indicator = scope }) {
  let armed = false;
  let timer;

  const disarm = () => {
    armed = false;
    clearTimeout(timer);
    delete indicator.dataset.clickGuard;
  };

  scope.addEventListener(
    'click',
    (event) => {
      if (!armed) return;
      event.stopImmediatePropagation();
      disarm();
    },
    true,
  );

  return function arm() {
    armed = true;
    indicator.dataset.clickGuard = 'active';
    clearTimeout(timer);
    timer = setTimeout(disarm, GHOST_CLICK_WINDOW_MS);
  };
}
