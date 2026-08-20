'use strict';

import * as i18n from '../lib/i18n.js';
import { initials, formatDate } from '../lib/format.js';
import { parseErrorMessage } from '../lib/upload.js';
import { state } from './state.js';
import { apiFetch, refreshUser, renderNavAuth, signOut } from './auth.js';
import { toast } from './toast.js';
import { openModal, closeModal } from './modal.js';
import {
  show,
  elProfileModal,
  elProfileAvatar,
  elProfileTitle,
  elProfileNameInput,
  elProfileNameError,
  elProfileEmail,
  elProfileSince,
  elDeleteAccountModal,
  elDeleteAccountHint,
  elDeleteAccountInput,
  elBtnDeleteAccountConfirm,
} from './dom.js';

const t = i18n.t;

// A typed phrase rather than a second click, kept as one literal token
// (not translated) so it stays exact and easy to type regardless of locale.
const DELETE_ACCOUNT_PHRASE = 'DELETE';

function renderProfile() {
  elProfileTitle.textContent = state.user.name || t('profile.yourAccount');
  elProfileAvatar.textContent = initials(state.user.name || state.user.email);
  elProfileEmail.textContent = state.user.email || '—';
  elProfileSince.textContent = state.user.createdAt
    ? formatDate(state.user.createdAt, i18n.dateLocale())
    : '—';
  elProfileNameInput.value = state.user.name || '';
}

export async function openProfile() {
  if (!state.user) return;
  renderProfile();
  openModal(elProfileModal);

  // Join date lives on the user doc, which the login session may not have.
  if (!state.user.createdAt) {
    await refreshUser();
    renderProfile();
  }
}

export function closeProfile() {
  closeModal(elProfileModal);
}

export async function saveProfileName(e) {
  e.preventDefault();
  const name = elProfileNameInput.value.trim();
  show(elProfileNameError, false);
  try {
    const res = await apiFetch('/api/me', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) {
      elProfileNameError.textContent = parseErrorMessage(await res.text(), t('errors.saveName'));
      show(elProfileNameError, true);
      return;
    }
    state.user = { ...state.user, ...(await res.json()) };
    renderProfile();
    renderNavAuth();
    toast(t('toast.nameUpdated'), 'success');
  } catch {
    elProfileNameError.textContent = t('errors.network');
    show(elProfileNameError, true);
  }
}

// Persisted before it is applied: i18n.setLanguage reloads the page, so
// anything after it never runs.
export async function selectLanguage(code) {
  try {
    const res = await apiFetch('/api/me', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ language: code }),
    });
    if (!res.ok) {
      toast(parseErrorMessage(await res.text(), t('errors.saveLanguage')), 'error');
      return;
    }
    i18n.setLanguage(code);
  } catch {
    toast(t('errors.network'), 'error');
  }
}

// GDPR data export.
export async function downloadMyData() {
  try {
    const res = await apiFetch('/api/me/export');
    if (!res.ok) throw new Error('export failed');
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement('a');
    a.href = url;
    a.download = 'bikebuddy-export.json';
    a.click();
    URL.revokeObjectURL(url);
    toast(t('toast.exportDone'), 'success');
  } catch {
    toast(t('toast.exportError'), 'error');
  }
}

export function openDeleteAccountModal() {
  elDeleteAccountInput.value = '';
  elDeleteAccountHint.textContent = t('confirm.deleteAccountPhraseHint', {
    phrase: DELETE_ACCOUNT_PHRASE,
  });
  elBtnDeleteAccountConfirm.disabled = true;
  openModal(elDeleteAccountModal);
}

export function closeDeleteAccountModal() {
  closeModal(elDeleteAccountModal);
}

export function updateDeleteAccountConfirmState() {
  elBtnDeleteAccountConfirm.disabled = elDeleteAccountInput.value !== DELETE_ACCOUNT_PHRASE;
}

// GDPR erasure. Only reachable once the typed-phrase check in the modal has
// enabled the button, so no further confirmation happens here.
export async function deleteMyAccount() {
  try {
    const res = await apiFetch('/api/account', { method: 'DELETE' });
    if (!res.ok) throw new Error('delete failed');
    closeDeleteAccountModal();
    closeProfile();
    toast(t('toast.accountDeleted'), 'success');
    await signOut();
  } catch {
    toast(t('toast.accountDeleteError'), 'error');
  }
}
