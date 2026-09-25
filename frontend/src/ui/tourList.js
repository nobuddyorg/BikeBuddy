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

// Wraps the search's matched runs in <mark>, via createElement/textContent only —
// tour names are user-supplied.
function createNameElement(name, matchedIndices) {
  const nameElement = document.createElement('div');
  nameElement.className = 'tour-item-name';
  nameElement.title = name; // full, unmarked name — a hover tooltip for the ellipsis-truncated row (#445)
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

// Glyphs rather than emoji: these sit on coloured backgrounds and had to read
// the same regardless of platform emoji rendering.
const TRASH_ICON_SVG =
  '<svg class="tour-item-delete-icon" viewBox="0 0 24 24" aria-hidden="true">' +
  '<path fill="#000" d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>' +
  '</svg>';

function createDeleteBackground() {
  const background = document.createElement('div');
  background.className = 'tour-item-delete-bg';
  background.setAttribute('aria-hidden', 'true');
  background.innerHTML = TRASH_ICON_SVG;
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
    // Space also scrolls the list by default; only suppress that once this
    // row is actually the one handling the key.
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
  item.className = 'tour-item' + (tour.id === state.selectedTourId ? ' active' : '');

  const content = document.createElement('div');
  content.className = 'tour-item-content';
  content.tabIndex = 0;
  describeRow(content, tour);
  content.append(createCheckbox(tour), createDetails(tour));
  bindRowInteractions(content, tour);

  item.append(createDeleteBackground(), content);
  return item;
}

// The list, its count and the pager: the part of renderSidebar that depends on
// the sort, search and "in view" filter.
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

  // The map isn't beside the list on mobile to pan/zoom while watching it
  // filter, and the toggle is hidden there — ignore a stray filterInView=true
  // left over from a desktop session or a shared/bookmarked ?inView=1 URL,
  // or the list would filter itself with no visible control to undo it.
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
