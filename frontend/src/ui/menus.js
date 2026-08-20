'use strict';

import * as i18n from '../lib/i18n.js';
import {
  WEIGHT_MIN,
  WEIGHT_MAX,
  OPACITY_MIN,
  OPACITY_MAX,
  saveLineStyle,
} from '../lib/lineStyle.js';
import { state } from './state.js';
import { redrawRoutes } from './routes.js';
import { selectLanguage } from './profile.js';
import {
  $,
  show,
  elTourSort,
  elSortMenu,
  elBtnSortMenu,
  elSortMenuList,
  elLineStyleWrap,
  elBtnLineStyle,
  elLineStyleMenu,
  elLineStyleColor,
  elLineStyleWidth,
  elLineStyleWidthValue,
  elLineStyleOpacity,
  elLineStyleOpacityValue,
} from './dom.js';

const t = i18n.t;

export function setupLanguageSwitcher() {
  const elBtnLang = $('btn-lang');
  const elLangMenu = $('lang-menu');
  const elLangSearch = $('lang-search');
  const elLangList = $('lang-list');
  const meta = i18n.getLocaleMeta();
  // Full name, not the short code: there is room for it here.
  elBtnLang.innerHTML = `<span class="lang-flag">${meta.flag}</span><span class="lang-name">${meta.label}</span>`;

  for (const loc of i18n.SUPPORTED_LOCALES) {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'lang-option';
    btn.setAttribute('role', 'option');
    btn.dataset.code = loc.code;
    btn.dataset.search = `${loc.label} ${loc.code} ${loc.short}`.toLowerCase();
    btn.setAttribute('aria-selected', String(loc.code === i18n.getLocale()));
    btn.innerHTML = `<span class="lang-flag">${loc.flag}</span><span>${loc.label}</span><span class="lang-code">${loc.short}</span>`;
    btn.addEventListener('click', () => selectLanguage(loc.code));
    li.appendChild(btn);
    elLangList.appendChild(li);
  }

  const closeMenu = () => {
    show(elLangMenu, false);
    elBtnLang.setAttribute('aria-expanded', 'false');
  };
  const openMenu = () => {
    const btnRect = elBtnLang.getBoundingClientRect();
    show(elLangMenu, true);
    elBtnLang.setAttribute('aria-expanded', 'true');
    elLangSearch.value = '';
    elLangList.querySelectorAll('li').forEach((li) => show(li, true));
    // .lang-menu is `position: fixed`, so it can't be anchored in CSS. Centred
    // on the modal card rather than the narrow switcher, or it hangs off one
    // edge (setupSortMenu does the same below).
    const modalRect = elBtnLang.closest('.modal').getBoundingClientRect();
    const menuWidth = elLangMenu.offsetWidth;
    const left = Math.max(16, modalRect.left + (modalRect.width - menuWidth) / 2);
    elLangMenu.style.top = `${btnRect.bottom + 6}px`;
    elLangMenu.style.left = `${left}px`;
    elLangSearch.focus();
  };

  elBtnLang.addEventListener('click', () => {
    if (elLangMenu.classList.contains('hidden')) openMenu();
    else closeMenu();
  });
  elLangSearch.addEventListener('input', () => {
    const q = elLangSearch.value.trim().toLowerCase();
    elLangList.querySelectorAll('.lang-option').forEach((opt) => {
      show(opt.parentElement, opt.dataset.search.includes(q));
    });
  });
  document.addEventListener('click', (e) => {
    if (!$('lang-switcher').contains(e.target)) closeMenu();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !elLangMenu.classList.contains('hidden')) closeMenu();
  });
}

// Mobile's replacement for the native <select>. Selecting an option writes
// elTourSort.value and dispatches its change event, so the sorting logic
// stays in one place.
const SORT_OPTIONS = [
  { value: 'date-desc', i18nKey: 'sort.dateDesc' },
  { value: 'date-asc', i18nKey: 'sort.dateAsc' },
  { value: 'name-asc', i18nKey: 'sort.nameAsc' },
  { value: 'name-desc', i18nKey: 'sort.nameDesc' },
  { value: 'length-desc', i18nKey: 'sort.lengthDesc' },
  { value: 'length-asc', i18nKey: 'sort.lengthAsc' },
];

export function setupSortMenu() {
  for (const opt of SORT_OPTIONS) {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'sort-menu-option';
    btn.setAttribute('role', 'option');
    btn.dataset.value = opt.value;
    btn.textContent = t(opt.i18nKey);
    btn.addEventListener('click', () => {
      elTourSort.value = opt.value;
      elTourSort.dispatchEvent(new Event('change'));
      closeMenu();
    });
    li.appendChild(btn);
    elSortMenuList.appendChild(li);
  }

  const closeMenu = () => {
    show(elSortMenuList, false);
    elBtnSortMenu.setAttribute('aria-expanded', 'false');
  };
  const openMenu = () => {
    elSortMenuList.querySelectorAll('.sort-menu-option').forEach((opt) => {
      opt.setAttribute('aria-selected', String(opt.dataset.value === state.sort));
    });
    // `position: fixed` to escape the sidebar's clipping, so the offset has to
    // come from the button's actual viewport rect.
    const rect = elBtnSortMenu.getBoundingClientRect();
    elSortMenuList.style.top = `${rect.bottom + 6}px`;
    elSortMenuList.style.right = `${window.innerWidth - rect.right}px`;
    show(elSortMenuList, true);
    elBtnSortMenu.setAttribute('aria-expanded', 'true');
  };

  elBtnSortMenu.addEventListener('click', () => {
    if (elSortMenuList.classList.contains('hidden')) openMenu();
    else closeMenu();
  });
  document.addEventListener('click', (e) => {
    if (!elSortMenu.contains(e.target)) closeMenu();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !elSortMenuList.classList.contains('hidden')) closeMenu();
  });
}

export function setupLineStyleMenu() {
  elLineStyleWidth.min = String(WEIGHT_MIN);
  elLineStyleWidth.max = String(WEIGHT_MAX);
  elLineStyleOpacity.min = String(Math.round(OPACITY_MIN * 100));
  elLineStyleOpacity.max = String(Math.round(OPACITY_MAX * 100));

  const applyControls = () => {
    elLineStyleColor.value = state.lineStyle.color;
    elLineStyleWidth.value = String(state.lineStyle.weight);
    elLineStyleWidthValue.textContent = `${state.lineStyle.weight}px`;
    const opacityPct = Math.round(state.lineStyle.opacity * 100);
    elLineStyleOpacity.value = String(opacityPct);
    elLineStyleOpacityValue.textContent = `${opacityPct}%`;
  };
  applyControls();

  const closeMenu = () => {
    show(elLineStyleMenu, false);
    elBtnLineStyle.setAttribute('aria-expanded', 'false');
  };
  const openMenu = () => {
    show(elLineStyleMenu, true);
    elBtnLineStyle.setAttribute('aria-expanded', 'true');
  };

  elBtnLineStyle.addEventListener('click', () => {
    if (elLineStyleMenu.classList.contains('hidden')) openMenu();
    else closeMenu();
  });
  document.addEventListener('click', (e) => {
    if (!elLineStyleWrap.contains(e.target)) closeMenu();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !elLineStyleMenu.classList.contains('hidden')) closeMenu();
  });

  const updateStyle = (patch) => {
    state.lineStyle = { ...state.lineStyle, ...patch };
    applyControls();
    redrawRoutes();
  };
  // localStorage is only written once the user settles on a value, not on
  // every 'input' tick of a drag — the live preview above is cheap, a
  // synchronous disk write per tick isn't.
  const commitStyle = () => saveLineStyle(state.lineStyle);

  elLineStyleColor.addEventListener('input', () => updateStyle({ color: elLineStyleColor.value }));
  elLineStyleColor.addEventListener('change', commitStyle);
  elLineStyleWidth.addEventListener('input', () =>
    updateStyle({ weight: Number(elLineStyleWidth.value) }),
  );
  elLineStyleWidth.addEventListener('change', commitStyle);
  elLineStyleOpacity.addEventListener('input', () =>
    updateStyle({ opacity: Number(elLineStyleOpacity.value) / 100 }),
  );
  elLineStyleOpacity.addEventListener('change', commitStyle);
}
