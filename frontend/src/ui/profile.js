import * as i18n from './i18n.js';
import { initials, formatDate } from '../lib/format.js';
import { parseErrorMessage } from '../lib/upload.js';
import { state } from './state.js';
import { apiRequest } from './api.js';
import { refreshUser, renderNavAuth, signOut } from './auth.js';
import { toast } from './toast.js';
import { openModal, closeModal } from './modal.js';
import {
  showElement,
  hideElement,
  profileModal,
  profileAvatar,
  profileTitle,
  profileNameInput,
  profileNameError,
  profileEmail,
  profileMemberSince,
  deleteAccountModal,
  deleteAccountHint,
  deleteAccountInput,
  deleteAccountConfirmButton,
} from './dom.js';

const t = i18n.t;

// Not translated: the phrase must be exact and easy to type in any locale.
const DELETE_ACCOUNT_PHRASE = 'DELETE';

function renderProfile() {
  profileTitle.textContent = state.user.name || t('profile.yourAccount');
  profileAvatar.textContent = initials(state.user.name || state.user.email);
  profileEmail.textContent = state.user.email || '—';
  profileMemberSince.textContent = state.user.createdAt
    ? formatDate(state.user.createdAt, i18n.intlLocale())
    : '—';
  profileNameInput.value = state.user.name || '';
}

export async function openProfile() {
  if (!state.user) return;
  renderProfile();
  openModal(profileModal);

  // The join date is on the user document, which the sign-in session may lack.
  if (!state.user.createdAt) {
    await refreshUser();
    renderProfile();
  }
}

export function closeProfile() {
  closeModal(profileModal);
}

function showNameError(message) {
  profileNameError.textContent = message;
  showElement(profileNameError);
}

const patchMe = (changes) =>
  apiRequest('/api/me', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(changes),
  });

export async function saveProfileName(event) {
  event.preventDefault();
  hideElement(profileNameError);
  const { response, networkError } = await patchMe({ name: profileNameInput.value.trim() });
  if (networkError) {
    showNameError(t('errors.network'));
    return;
  }
  if (!response.ok) {
    showNameError(i18n.tApi(parseErrorMessage(await response.text(), t('errors.saveName'))));
    return;
  }
  state.user = { ...state.user, ...(await response.json()) };
  renderProfile();
  renderNavAuth();
  toast(t('toast.nameUpdated'), { type: 'success' });
}

// Persisted first: setLanguage reloads the page, so nothing after it runs.
export async function selectLanguage(code) {
  const { response, networkError } = await patchMe({ language: code });
  if (networkError) {
    toast(t('errors.network'), { type: 'error' });
    return;
  }
  if (!response.ok) {
    const message = parseErrorMessage(await response.text(), t('errors.saveLanguage'));
    toast(i18n.tApi(message), { type: 'error' });
    return;
  }
  i18n.setLanguage(code);
}

export async function downloadMyData() {
  const { response, networkError } = await apiRequest('/api/me/export');
  if (networkError || !response.ok) {
    toast(t('toast.exportError'), { type: 'error' });
    return;
  }
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement('a');
  link.href = url;
  link.download = 'bikebuddy-export.json';
  link.click();
  URL.revokeObjectURL(url);
  toast(t('toast.exportDone'), { type: 'success' });
}

export function openDeleteAccountModal() {
  deleteAccountInput.value = '';
  deleteAccountHint.textContent = t('confirm.deleteAccountPhraseHint', {
    phrase: DELETE_ACCOUNT_PHRASE,
  });
  deleteAccountConfirmButton.disabled = true;
  openModal(deleteAccountModal);
}

export function closeDeleteAccountModal() {
  closeModal(deleteAccountModal);
}

export function updateDeleteAccountConfirmState() {
  deleteAccountConfirmButton.disabled = deleteAccountInput.value !== DELETE_ACCOUNT_PHRASE;
}

// Only reachable once the typed phrase has enabled the button.
export async function deleteMyAccount() {
  const { response, networkError } = await apiRequest('/api/account', { method: 'DELETE' });
  if (networkError || !response.ok) {
    toast(t('toast.accountDeleteError'), { type: 'error' });
    return;
  }
  closeDeleteAccountModal();
  closeProfile();
  toast(t('toast.accountDeleted'), { type: 'success' });
  await signOut();
}
