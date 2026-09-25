import { Locator, Page } from '@playwright/test';
import { initConfirmModal } from './confirm-modal';

// Locator.setInputFiles' own type: one value, or a homogeneous array — never a mixed array.
type FileInputArg = Parameters<Locator['setInputFiles']>[0];

interface DetailPanel {
  /** Points to self (the open tour's panel). */
  (): Locator;
  /** High-level interactions. */
  do: {
    openEdit(): Promise<void>;
    downloadGpx(): Promise<void>;
    deleteTour(): Promise<void>;
    close(): Promise<void>;
    addPhotos(files: FileInputArg): Promise<void>;
    deletePhoto(index: number): Promise<void>;
    openPhoto(index: number): Promise<void>;
    retryPhoto(): Promise<void>;
    dismissPhotoError(): Promise<void>;
  };
  /** Raw locators. */
  locators: {
    name: Locator;
    description: Locator;
    date: Locator;
    buttons: {
      edit: Locator;
      downloadGpx: Locator;
      delete: Locator;
      close: Locator;
    };
    photos: {
      input: Locator;
      thumbnails: Locator;
      pendingTiles: Locator;
      errorTiles: Locator;
      retryButtons: Locator;
      dismissButtons: Locator;
      deleteButtons: Locator;
    };
  };
}

export function initDetailPanel(page: Page): DetailPanel {
  const root = page.locator('#detail-panel');
  const grid = page.locator('#tour-image-grid');
  const locators = {
    name: page.locator('#detail-name'),
    description: page.locator('#detail-description'),
    date: page.locator('#detail-date'),
    buttons: {
      edit: page.locator('#btn-edit-tour'),
      downloadGpx: page.locator('#btn-download-gpx'),
      delete: page.locator('#btn-delete-tour'),
      close: page.locator('#btn-close-detail'),
    },
    photos: {
      input: page.locator('#image-file'),
      thumbnails: grid.getByTestId('image-thumb'),
      pendingTiles: grid.getByTestId('image-tile-pending'),
      errorTiles: grid.getByTestId('image-tile-error'),
      retryButtons: grid.getByTestId('image-tile-retry'),
      dismissButtons: grid.getByTestId('image-tile-dismiss'),
      deleteButtons: grid.getByTestId('image-delete'),
    },
  };
  const confirm = initConfirmModal(page);
  const interactions = {
    openEdit: async () => locators.buttons.edit.click(),
    downloadGpx: async () => locators.buttons.downloadGpx.click(),
    deleteTour: async () => {
      await locators.buttons.delete.click();
      await confirm.do.confirm();
    },
    close: async () => locators.buttons.close.click(),
    addPhotos: async (files: FileInputArg) => locators.photos.input.setInputFiles(files),
    deletePhoto: async (index: number) => {
      await locators.photos.deleteButtons.nth(index).click();
      await confirm.do.confirm();
    },
    openPhoto: async (index: number) => locators.photos.thumbnails.nth(index).click(),
    retryPhoto: async () => locators.photos.retryButtons.first().click(),
    dismissPhotoError: async () => locators.photos.dismissButtons.first().click(),
  };
  return Object.assign(() => root, { locators, do: interactions });
}
