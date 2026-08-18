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
} from './dom.js';

const t = i18n.t;

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

// GDPR erasure.
export async function deleteMyAccount() {
  if (!confirm(t('confirm.deleteAccount'))) return;
  try {
    const res = await apiFetch('/api/account', { method: 'DELETE' });
    if (!res.ok) throw new Error('delete failed');
    closeProfile();
    toast(t('toast.accountDeleted'), 'success');
    await signOut();
  } catch {
    toast(t('toast.accountDeleteError'), 'error');
  }
}
