import { Locator, Page } from '@playwright/test';
import { initConfirmModal } from './confirm-modal';
import { initTourRow, type TourRow } from './tour-row';

interface TourList {
  /** Points to self (the sidebar holding the list). */
  (): Locator;
  /** The row of the tour with exactly this name. */
  row(name: string): TourRow;
  /** High-level interactions. */
  do: {
    retryLoad(): Promise<void>;
    search(query: string): Promise<void>;
    sortBy(option: string): Promise<void>;
    showOnlyToursInView(): Promise<void>;
    showToursOutOfView(): Promise<void>;
    enterSelectMode(): Promise<void>;
    deleteSelected(): Promise<void>;
    cancelSelect(): Promise<void>;
    nextPage(): Promise<void>;
    previousPage(): Promise<void>;
  };
  /** Raw locators. */
  locators: {
    container: Locator;
    rows: Locator;
    names: Locator;
    /** The row content of the tour that is open, if any. */
    current: Locator;
    count: Locator;
    empty: Locator;
    loadError: Locator;
    search: Locator;
    sort: Locator;
    filterInView: {
      toggle: Locator;
      toggleInput: Locator;
    };
    selection: {
      bar: Locator;
      count: Locator;
    };
    pager: {
      container: Locator;
      label: Locator;
      previous: Locator;
      next: Locator;
    };
    buttons: {
      retry: Locator;
      selectMode: Locator;
      deleteSelected: Locator;
      cancelSelect: Locator;
      showAll: Locator;
    };
  };
}

export function initTourList(page: Page): TourList {
  const root = page.locator('#sidebar');
  const container = page.locator('#tour-list');
  const locators = {
    container,
    rows: container.getByTestId('tour-item'),
    names: container.getByTestId('tour-item-name'),
    current: container.getByTestId('tour-item-content').and(page.locator('[aria-current="true"]')),
    count: page.locator('#tour-count'),
    empty: page.locator('#no-tours'),
    loadError: page.locator('#tour-load-error'),
    search: page.locator('#tour-search'),
    sort: page.locator('#tour-sort'),
    filterInView: {
      toggle: page.locator('#filter-in-view-toggle'),
      toggleInput: page.locator('#filter-in-view-input'),
    },
    selection: {
      bar: page.locator('#selection-bar'),
      count: page.locator('#selection-count'),
    },
    pager: {
      container: page.locator('#tour-pager'),
      label: page.locator('#tour-pager-label'),
      previous: page.locator('#tour-pager-prev'),
      next: page.locator('#tour-pager-next'),
    },
    buttons: {
      retry: page.locator('#btn-retry-tours'),
      selectMode: page.locator('#btn-select-mode'),
      deleteSelected: page.locator('#btn-delete-selected'),
      cancelSelect: page.locator('#btn-cancel-select'),
      showAll: page.locator('#btn-show-all'),
    },
  };
  const interactions = {
    retryLoad: async () => locators.buttons.retry.click(),
    search: async (query: string) => locators.search.fill(query),
    sortBy: async (option: string) => {
      await locators.sort.selectOption(option);
    },
    showOnlyToursInView: async () => locators.filterInView.toggleInput.check(),
    showToursOutOfView: async () => locators.filterInView.toggleInput.uncheck(),
    enterSelectMode: async () => locators.buttons.selectMode.click(),
    deleteSelected: async () => {
      await locators.buttons.deleteSelected.click();
      await initConfirmModal(page).do.confirm();
    },
    cancelSelect: async () => locators.buttons.cancelSelect.click(),
    nextPage: async () => locators.pager.next.click(),
    previousPage: async () => locators.pager.previous.click(),
  };
  const row = (name: string) => initTourRow(page, { list: container, name });
  return Object.assign(() => root, { row, locators, do: interactions });
}
