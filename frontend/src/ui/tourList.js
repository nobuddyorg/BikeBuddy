import * as i18n from './i18n.js';
import { formatCount, formatDate, formatDistance } from '../lib/format.js';
import { tourListView, fuzzyMatchIndices, matchRuns } from '../lib/tours.js';
import { state } from './state.js';
import { mapBoundsPlain, isMobileLayout } from './map.js';
import { selectTour, closeDetailPanel } from './tourPanel.js';
import { deleteTourById } from './tourRemoval.js';
import { toggleTourSelection, enterSingleSelect } from './selectMode.js';
import { bindLongPress, bindTourSwipe } from './tourGestures.js';
import {
  hideElement,
  setVisible,
  tourList,
  tourCountBadge,
  tourPager,
  tourPagerLabel,
  tourPagerPreviousButton,
  tourPagerNextButton,
} from './dom.js';

const t = i18n.t;

// textContent, never innerHTML: tour names are user-supplied.
function createTextDiv(className, text) {
  const div = document.createElement('div');
  div.className = className;
  div.textContent = text;
  return div;
}

// createElement/textContent only: tour names are user-supplied.
function createNameElement(name, matchedIndices) {
  const nameElement = document.createElement('div');
  nameElement.className = 'tour-item-name';
  nameElement.dataset.testid = 'tour-item-name';
  nameElement.title = name; // the full name, for the ellipsis-truncated row
  for (const run of matchRuns(name, matchedIndices)) {
    if (run.matched) {
      const mark = document.createElement('mark');
      mark.textContent = run.text;
      nameElement.appendChild(mark);
    } else {
      nameElement.appendChild(document.createTextNode(run.text));
    }
  }
  return nameElement;
}

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

function createTrashIcon() {
  const icon = document.createElementNS(SVG_NAMESPACE, 'svg');
  icon.setAttribute('class', 'tour-item-delete-icon');
  icon.setAttribute('fill', '#000');
  icon.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS(SVG_NAMESPACE, 'use');
  use.setAttribute('href', 'icons.svg#trash');
  icon.appendChild(use);
  return icon;
}

function createDeleteBackground() {
  const background = document.createElement('div');
  background.className = 'tour-item-delete-bg';
  background.setAttribute('aria-hidden', 'true');
  background.appendChild(createTrashIcon());
  return background;
}

function createCheckbox(tour) {
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.className = 'tour-item-checkbox';
  checkbox.checked = state.selectedIds.has(tour.id);
  checkbox.setAttribute('aria-hidden', 'true');
  setVisible(checkbox, state.selectMode);
  return checkbox;
}

function createDetails(tour) {
  const locale = i18n.intlLocale();
  const name = tour.name || '';
  const details = document.createElement('div');
  details.className = 'tour-item-details';
  details.append(
    createNameElement(name, fuzzyMatchIndices(state.search, name).indices),
    createTextDiv(
      'tour-item-meta',
      t('sidebar.tourItemMeta', {
        date: formatDate(tour.createdAt, locale),
        distance: formatDistance(tour.distance, locale),
      }),
    ),
  );
  return details;
}

function describeRow(content, tour) {
  const locale = i18n.intlLocale();
  content.setAttribute(
    'aria-label',
    t('sidebar.tourItemAria', {
      name: tour.name || '',
      date: formatDate(tour.createdAt, locale),
      distance: formatDistance(tour.distance, locale),
    }),
  );
  if (state.selectMode) {
    content.setAttribute('role', 'checkbox');
    content.setAttribute('aria-checked', String(state.selectedIds.has(tour.id)));
  } else {
    content.setAttribute('role', 'button');
  }
  if (tour.id === state.selectedTourId) content.setAttribute('aria-current', 'true');
}

function activateRow(tourId) {
  if (state.selectMode) toggleTourSelection(tourId);
  else if (state.selectedTourId === tourId) closeDetailPanel();
  else selectTour(tourId);
}

function bindRowInteractions(content, tour) {
  content.addEventListener('click', () => activateRow(tour.id));
  content.addEventListener('keydown', (event) => {
    // Space would also scroll the list.
    if (event.key !== 'Enter' && event.key !== ' ' && event.key !== 'Spacebar') return;
    event.preventDefault();
    content.click();
  });
  bindLongPress(content, () => {
    if (state.selectMode) return false;
    enterSingleSelect(tour.id);
    return true;
  });
  bindTourSwipe(content, () => deleteTourById(tour.id));
}

function createTourItem(tour) {
  const item = document.createElement('li');
  item.id = `tour-item-${tour.id}`;
  item.dataset.testid = 'tour-item';
  item.className = 'tour-item' + (tour.id === state.selectedTourId ? ' active' : '');

  const content = document.createElement('div');
  content.className = 'tour-item-content';
  content.dataset.testid = 'tour-item-content';
  content.tabIndex = 0;
  describeRow(content, tour);
  content.append(createCheckbox(tour), createDetails(tour));
  bindRowInteractions(content, tour);

  item.append(createDeleteBackground(), content);
  return item;
}

export function renderTourList({ signedIn, loading, hasTours }) {
  tourList.innerHTML = '';
  if (!hasTours) {
    tourCountBadge.textContent = formatCount(
      signedIn && !loading ? state.tours.length : 0,
      i18n.intlLocale(),
    );
    hideElement(tourPager);
    return;
  }

  // Mobile has no in-view control, so a filterInView from a URL or desktop session is ignored.
  const inViewActive = state.filterInView && !isMobileLayout();
  const view = tourListView({
    tours: state.tours,
    sort: state.sort,
    search: state.search,
    locale: i18n.intlLocale(),
    page: state.page,
    inViewBounds: inViewActive ? mapBoundsPlain() : undefined,
  });
  tourCountBadge.textContent = view.filtered
    ? t('sidebar.filteredCount', { count: view.visibleCount, total: view.totalCount })
    : formatCount(view.totalCount, i18n.intlLocale());
  if (view.visibleCount === 0) {
    tourList.appendChild(createTextDiv('tour-empty', t('tours.noMatch')));
    hideElement(tourPager);
    return;
  }

  const { items, page, totalPages } = view;
  state.page = page;
  items.forEach((tour) => tourList.appendChild(createTourItem(tour)));

  setVisible(tourPager, totalPages > 1);
  tourPagerLabel.textContent = t('sidebar.pagerLabel', { page, totalPages });
  tourPagerPreviousButton.disabled = page <= 1;
  tourPagerNextButton.disabled = page >= totalPages;
}
