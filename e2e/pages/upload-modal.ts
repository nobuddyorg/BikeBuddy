import { Locator, Page } from '@playwright/test';

type FileInput = string | { name: string; mimeType: string; buffer: Buffer };

interface UploadModal {
  /** Points to self (the modal dialog). */
  (): Locator;
  /** High-level interactions. */
  do: {
    setName(name: string): Promise<void>;
    pickFile(file: FileInput): Promise<void>;
    submit(): Promise<void>;
    close(): Promise<void>;
  };
  /** Raw locators. */
  locators: {
    name: Locator;
    file: Locator;
    dropzoneFilename: Locator;
    error: Locator;
    buttons: {
      submit: Locator;
      close: Locator;
    };
  };
}

export function initUploadModal(page: Page): UploadModal {
  const root = page.locator('#upload-modal');
  const locators = {
    name: page.locator('#upload-name'),
    file: page.locator('#upload-file'),
    dropzoneFilename: page.locator('#dropzone-filename'),
    error: page.locator('#upload-error'),
    buttons: {
      submit: page.locator('#btn-submit-upload'),
      close: page.locator('#btn-close-upload'),
    },
  };
  const interactions = {
    setName: async (name: string) => locators.name.fill(name),
    pickFile: async (file: FileInput) => locators.file.setInputFiles(file),
    submit: async () => locators.buttons.submit.click(),
    close: async () => locators.buttons.close.click(),
  };
  return Object.assign(() => root, { locators, do: interactions });
}
