import { Locator, Page } from '@playwright/test';

interface EditModal {
  /** Points to self (the modal dialog). */
  (): Locator;
  /** High-level interactions. */
  do: {
    setName(name: string): Promise<void>;
    setDescription(description: string): Promise<void>;
    submit(): Promise<void>;
  };
  /** Raw locators. */
  locators: {
    name: Locator;
    description: Locator;
    buttons: {
      submit: Locator;
    };
  };
}

export function initEditModal(page: Page): EditModal {
  const root = page.locator('#edit-modal');
  const locators = {
    name: page.locator('#edit-name'),
    description: page.locator('#edit-description'),
    buttons: {
      submit: page.locator('#btn-submit-edit'),
    },
  };
  const interactions = {
    setName: async (name: string) => locators.name.fill(name),
    setDescription: async (description: string) => locators.description.fill(description),
    submit: async () => locators.buttons.submit.click(),
  };
  return Object.assign(() => root, { locators, do: interactions });
}
