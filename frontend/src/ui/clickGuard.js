// Outlasts the compatibility click a touch leaves; browsers that send none just time out.
const GHOST_CLICK_WINDOW_MS = 400;

// `indicator` carries data-click-guard while armed, so a test can wait for it to drop.
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
