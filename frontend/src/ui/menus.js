import { SUPPORTED_LOCALES, filterLocales } from '../lib/i18n.js';
import { SORT_OPTIONS } from '../lib/tours.js';
import { centeredLeft } from '../lib/layout.js';
import {
  WEIGHT_MIN,
  WEIGHT_MAX,
  OPACITY_MIN,
  OPACITY_MAX,
  opacityToPercent,
  percentToOpacity,
} from '../lib/lineStyle.js';
import { formatPercent } from '../lib/format.js';
import * as i18n from './i18n.js';
import { saveLineStyle } from './lineStyleStorage.js';
import { state } from './state.js';
import { redrawRoutes } from './routes.js';
import { selectLanguage } from './profile.js';
import { wirePopover } from './popover.js';
import {
  setVisible,
  tourSortSelect,
  sortMenu,
  sortMenuButton,
  sortMenuList,
  lineStyleControl,
  lineStyleButton,
  lineStyleMenu,
  lineStyleColorInput,
  lineStyleWidthInput,
  lineStyleWidthValue,
  lineStyleOpacityInput,
  lineStyleOpacityValue,
  languageButton,
  languageMenu,
  languageSearchInput,
  languageList,
  languageSwitcher,
} from './dom.js';

const t = i18n.t;

// Popovers keep this far from the viewport edge and this far below their trigger.
const MENU_EDGE_MARGIN_PX = 16;
const MENU_OFFSET_PX = 6;

// One <span> per [className, text] pair; textContent, so no string is parsed as markup.
function spans(parts) {
  return parts.map(([className, text]) => {
    const span = document.createElement('span');
    if (className) span.className = className;
    span.textContent = text;
    return span;
  });
}

function createLanguageOption(locale) {
  const item = document.createElement('li');
  const option = document.createElement('button');
  option.type = 'button';
  option.className = 'lang-option';
  option.setAttribute('role', 'option');
  option.dataset.code = locale.code;
  option.setAttribute('aria-selected', String(locale.code === i18n.getLocale()));
  option.append(
    ...spans([
      ['lang-flag', locale.flag],
      ['', locale.label],
      ['lang-code', locale.short],
    ]),
  );
  option.addEventListener('click', () => selectLanguage(locale.code));
  item.appendChild(option);
  return item;
}

function showMatchingLanguages() {
  const matching = new Set(filterLocales(languageSearchInput.value).map((locale) => locale.code));
  languageList.querySelectorAll('.lang-option').forEach((option) => {
    setVisible(option.parentElement, matching.has(option.dataset.code));
  });
}

// .lang-menu is `position: fixed`, so it can't be anchored in CSS. Centred
// on the modal card rather than the narrow switcher, or it hangs off one edge.
function positionLanguageMenu() {
  const buttonRect = languageButton.getBoundingClientRect();
  const modalRect = languageButton.closest('.modal').getBoundingClientRect();
  const left = centeredLeft({
    containerLeft: modalRect.left,
    containerWidth: modalRect.width,
    elementWidth: languageMenu.offsetWidth,
    minimumLeft: MENU_EDGE_MARGIN_PX,
  });
  languageMenu.style.top = `${buttonRect.bottom + MENU_OFFSET_PX}px`;
  languageMenu.style.left = `${left}px`;
}

export function setupLanguageSwitcher() {
  const meta = i18n.getLocaleMeta();
  // Full name, not the short code: there is room for it here.
  languageButton.replaceChildren(
    ...spans([
      ['lang-flag', meta.flag],
      ['lang-name', meta.label],
    ]),
  );
  languageList.append(...SUPPORTED_LOCALES.map(createLanguageOption));

  wirePopover({
    trigger: languageButton,
    panel: languageMenu,
    container: languageSwitcher,
    onOpen: () => {
      languageSearchInput.value = '';
      showMatchingLanguages();
      positionLanguageMenu();
      languageSearchInput.focus();
    },
  });
  languageSearchInput.addEventListener('input', showMatchingLanguages);
}

// The desktop <select> lists the same options as the mobile menu below; its
// labels are translated by applyI18n like the static markup.
export function populateSortSelect() {
  for (const { key, labelKey } of SORT_OPTIONS) {
    const option = document.createElement('option');
    option.value = key;
    option.dataset.i18n = labelKey;
    tourSortSelect.appendChild(option);
  }
}

// `position: fixed` to escape the sidebar's clipping, so the offset has to
// come from the button's actual viewport rect.
function positionSortMenu() {
  sortMenuList.querySelectorAll('.sort-menu-option').forEach((option) => {
    option.setAttribute('aria-selected', String(option.dataset.value === state.sort));
  });
  const rect = sortMenuButton.getBoundingClientRect();
  sortMenuList.style.top = `${rect.bottom + MENU_OFFSET_PX}px`;
  sortMenuList.style.right = `${window.innerWidth - rect.right}px`;
}

// Mobile's replacement for the native <select>. Choosing an option writes the
// select's value and dispatches its change event, so the sorting logic stays
// in one place.
export function setupSortMenu() {
  const { close } = wirePopover({
    trigger: sortMenuButton,
    panel: sortMenuList,
    container: sortMenu,
    onOpen: positionSortMenu,
  });
  for (const { key, labelKey } of SORT_OPTIONS) {
    const item = document.createElement('li');
    const option = document.createElement('button');
    option.type = 'button';
    option.className = 'sort-menu-option';
    option.setAttribute('role', 'option');
    option.dataset.value = key;
    option.textContent = t(labelKey);
    option.addEventListener('click', () => {
      tourSortSelect.value = key;
      tourSortSelect.dispatchEvent(new Event('change'));
      close();
    });
    item.appendChild(option);
    sortMenuList.appendChild(item);
  }
}

function showLineStyle() {
  lineStyleColorInput.value = state.lineStyle.color;
  lineStyleWidthInput.value = String(state.lineStyle.weight);
  lineStyleWidthValue.textContent = `${state.lineStyle.weight}px`;
  lineStyleOpacityInput.value = String(opacityToPercent(state.lineStyle.opacity));
  lineStyleOpacityValue.textContent = formatPercent(state.lineStyle.opacity, i18n.intlLocale());
}

function updateLineStyle(patch) {
  state.lineStyle = { ...state.lineStyle, ...patch };
  showLineStyle();
  redrawRoutes();
}

export function setupLineStyleMenu() {
  lineStyleWidthInput.min = String(WEIGHT_MIN);
  lineStyleWidthInput.max = String(WEIGHT_MAX);
  lineStyleOpacityInput.min = String(opacityToPercent(OPACITY_MIN));
  lineStyleOpacityInput.max = String(opacityToPercent(OPACITY_MAX));
  showLineStyle();
  wirePopover({ trigger: lineStyleButton, panel: lineStyleMenu, container: lineStyleControl });

  // localStorage is only written once the user settles on a value, not on
  // every 'input' tick of a drag — the live preview above is cheap, a
  // synchronous disk write per tick isn't.
  const commitLineStyle = () => saveLineStyle(state.lineStyle);
  const controls = [
    [lineStyleColorInput, () => ({ color: lineStyleColorInput.value })],
    [lineStyleWidthInput, () => ({ weight: Number(lineStyleWidthInput.value) })],
    [
      lineStyleOpacityInput,
      () => ({ opacity: percentToOpacity(Number(lineStyleOpacityInput.value)) }),
    ],
  ];
  for (const [input, readPatch] of controls) {
    input.addEventListener('input', () => updateLineStyle(readPatch()));
    input.addEventListener('change', commitLineStyle);
  }
}
