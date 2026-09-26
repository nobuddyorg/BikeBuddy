import { showElement, hideElement, isHidden } from './dom.js';

// onOpen runs once the panel shows, so it can measure and position it.
export function wirePopover({ trigger, panel, container, onOpen = () => {} }) {
  const close = () => {
    hideElement(panel);
    trigger.setAttribute('aria-expanded', 'false');
  };
  const open = () => {
    showElement(panel);
    trigger.setAttribute('aria-expanded', 'true');
    onOpen();
  };

  trigger.addEventListener('click', () => (isHidden(panel) ? open() : close()));
  document.addEventListener('click', (event) => {
    if (!container.contains(event.target)) close();
  });
  // Capture phase, before app.js's dialog handler, which skips an Escape a menu has used.
  document.addEventListener(
    'keydown',
    (event) => {
      if (event.key !== 'Escape' || isHidden(panel)) return;
      event.preventDefault();
      close();
    },
    { capture: true },
  );
  return { close };
}
