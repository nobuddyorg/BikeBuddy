import { expect, Locator, Page } from '@playwright/test';

interface MapView {
  /** Points to self (the Leaflet map; carries data-tiles and data-zoom). */
  (): Locator;
  /** High-level interactions. */
  do: {
    showPins(): Promise<void>;
    hidePins(): Promise<void>;
    /** Up to `steps` levels, fewer at Leaflet's minimum zoom. */
    zoomOut(steps: number): Promise<void>;
    /** Up to `steps` levels, fewer at Leaflet's maximum zoom. */
    zoomIn(steps: number): Promise<void>;
  };
  /** Raw locators. */
  locators: {
    empty: Locator;
    loadError: Locator;
    pins: {
      toggle: Locator;
      toggleInput: Locator;
      markers: Locator;
    };
  };
}

export function initMapView(page: Page): MapView {
  const root = page.locator('#map');
  const locators = {
    empty: page.locator('#map-empty'),
    loadError: page.locator('#map-load-error'),
    pins: {
      toggle: page.locator('#pin-toggle'),
      toggleInput: page.locator('#pin-toggle-input'),
      markers: root.getByTestId('photo-pin'),
    },
  };
  // Leaflet's own zoom control, reached by its accessible name.
  const zoomButtons = {
    in: root.getByRole('button', { name: 'Zoom in' }),
    out: root.getByRole('button', { name: 'Zoom out' }),
  };

  // Leaflet drops a click mid-animation, so each step waits for data-zoom (set on zoomend).
  const zoom = async ({ button, steps }: { button: Locator; steps: number }) => {
    for (let step = 0; step < steps; step++) {
      // At its limit Leaflet disables the button, and click() would wait forever.
      if ((await button.getAttribute('aria-disabled')) === 'true') return;
      const zoomBefore = await root.getAttribute('data-zoom');
      await button.click();
      await expect(root).not.toHaveAttribute('data-zoom', zoomBefore ?? '');
    }
  };

  const interactions = {
    showPins: async () => locators.pins.toggleInput.check(),
    hidePins: async () => locators.pins.toggleInput.uncheck(),
    zoomOut: async (steps: number) => zoom({ button: zoomButtons.out, steps }),
    zoomIn: async (steps: number) => zoom({ button: zoomButtons.in, steps }),
  };
  return Object.assign(() => root, { locators, do: interactions });
}
