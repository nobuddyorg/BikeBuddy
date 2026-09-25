import { showElement, hideElement, isHidden } from './dom.js';

// A menu that opens from its trigger and closes on a second click, a click
// anywhere outside `container`, or Escape. onOpen runs once the panel shows,
// so it can measure and position it.
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
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !isHidden(panel)) close();
  });
  return { close };
}
