import * as i18n from './i18n.js';
import { initials, formatDate } from '../lib/format.js';
import { parseErrorMessage } from '../lib/upload.js';
import { state } from './state.js';
import { apiFetch } from './api.js';
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

// A typed phrase rather than a second click, kept as one literal token
// (not translated) so it stays exact and easy to type regardless of locale.
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

  // Join date lives on the user doc, which the login session may not have.
  if (!state.user.createdAt) {
    await refreshUser();
    renderProfile();
  }
}

export function closeProfile() {
  closeModal(profileModal);
}

export async function saveProfileName(event) {
  event.preventDefault();
  const name = profileNameInput.value.trim();
  hideElement(profileNameError);
  try {
    const response = await apiFetch('/api/me', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    if (!response.ok) {
      profileNameError.textContent = i18n.tApi(
        parseErrorMessage(await response.text(), t('errors.saveName')),
      );
      showElement(profileNameError);
      return;
    }
    state.user = { ...state.user, ...(await response.json()) };
    renderProfile();
    renderNavAuth();
    toast(t('toast.nameUpdated'), { type: 'success' });
  } catch {
    profileNameError.textContent = t('errors.network');
    showElement(profileNameError);
  }
}

// Persisted before it is applied: i18n.setLanguage reloads the page, so
// anything after it never runs.
export async function selectLanguage(code) {
  try {
    const response = await apiFetch('/api/me', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ language: code }),
    });
    if (!response.ok) {
      toast(i18n.tApi(parseErrorMessage(await response.text(), t('errors.saveLanguage'))), {
        type: 'error',
      });
      return;
    }
    i18n.setLanguage(code);
  } catch {
    toast(t('errors.network'), { type: 'error' });
  }
}

// GDPR data export.
export async function downloadMyData() {
  try {
    const response = await apiFetch('/api/me/export');
    if (!response.ok) throw new Error('export failed');
    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement('a');
    link.href = url;
    link.download = 'bikebuddy-export.json';
    link.click();
    URL.revokeObjectURL(url);
    toast(t('toast.exportDone'), { type: 'success' });
  } catch {
    toast(t('toast.exportError'), { type: 'error' });
  }
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

// GDPR erasure. Only reachable once the typed-phrase check in the modal has
// enabled the button, so no further confirmation happens here.
export async function deleteMyAccount() {
  try {
    const response = await apiFetch('/api/account', { method: 'DELETE' });
    if (!response.ok) throw new Error('delete failed');
    closeDeleteAccountModal();
    closeProfile();
    toast(t('toast.accountDeleted'), { type: 'success' });
    await signOut();
  } catch {
    toast(t('toast.accountDeleteError'), { type: 'error' });
  }
}
