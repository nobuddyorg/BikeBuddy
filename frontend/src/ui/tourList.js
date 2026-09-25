import * as i18n from './i18n.js';
import { formatCount, formatDate, formatDistance } from '../lib/format.js';
import { visibleTours, toursInView, paginate, PAGE_SIZE, fuzzyMatchIndices } from '../lib/tours.js';
import { state } from './state.js';
import { mapBoundsPlain, isMobileLayout } from './map.js';
import { deleteTourById, selectTour, closeDetailPanel } from './tour-detail.js';
import { toggleTourSelection, enterSingleSelect } from './selectMode.js';
import { bindLongPress, bindTourSwipe } from './tourGestures.js';
import {
  show,
  elTourList,
  elTourCount,
  elTourPager,
  elTourPagerLabel,
  elTourPagerPrev,
  elTourPagerNext,
} from './dom.js';

const t = i18n.t;

// textContent, never innerHTML: tour names are user-supplied.
function textDiv(className, text) {
  const div = document.createElement('div');
  div.className = className;
  div.textContent = text;
  return div;
}

// Wraps runs of matched indices in <mark>, via createElement/textContent only —
// tour names are user-supplied.
function highlightedNameNode(name, indices) {
  name = name || '';
  const div = document.createElement('div');
  div.className = 'tour-item-name';
  div.title = name; // full, unmarked name — a hover tooltip for the ellipsis-truncated row (#445)
  const matched = new Set(indices);
  let i = 0;
  while (i < name.length) {
    let j = i;
    while (j < name.length && matched.has(j) === matched.has(i)) j++;
    const run = name.slice(i, j);
    if (matched.has(i)) {
      const mark = document.createElement('mark');
      mark.textContent = run;
      div.appendChild(mark);
    } else {
      div.appendChild(document.createTextNode(run));
    }
    i = j;
  }
  return div;
}

// Glyphs rather than emoji: these sit on coloured backgrounds and had to read
// the same regardless of platform emoji rendering.
const TRASH_ICON_SVG =
  '<svg class="tour-item-delete-icon" viewBox="0 0 24 24" aria-hidden="true">' +
  '<path fill="#000" d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>' +
  '</svg>';

function createTourItem(tour) {
  const li = document.createElement('li');
  li.className = 'tour-item' + (tour.id === state.selectedTourId ? ' active' : '');

  const deleteBg = document.createElement('div');
  deleteBg.className = 'tour-item-delete-bg';
  deleteBg.setAttribute('aria-hidden', 'true');
  deleteBg.innerHTML = TRASH_ICON_SVG;

  const content = document.createElement('div');
  content.className = 'tour-item-content';
  content.tabIndex = 0;
  content.setAttribute(
    'aria-label',
    t('sidebar.tourItemAria', {
      name: tour.name || '',
      date: formatDate(tour.createdAt, i18n.intlLocale()),
      distance: formatDistance(tour.distance, i18n.intlLocale()),
    }),
  );
  if (state.selectMode) {
    content.setAttribute('role', 'checkbox');
    content.setAttribute('aria-checked', String(state.selectedIds.has(tour.id)));
  } else {
    content.setAttribute('role', 'button');
  }
  if (tour.id === state.selectedTourId) content.setAttribute('aria-current', 'true');

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.className = 'tour-item-checkbox';
  checkbox.checked = state.selectedIds.has(tour.id);
  checkbox.setAttribute('aria-hidden', 'true');
  show(checkbox, state.selectMode);

  const details = document.createElement('div');
  details.className = 'tour-item-details';
  details.append(
    highlightedNameNode(tour.name, fuzzyMatchIndices(state.search, tour.name)),
    textDiv(
      'tour-item-meta',
      t('sidebar.tourItemMeta', {
        date: formatDate(tour.createdAt, i18n.intlLocale()),
        distance: formatDistance(tour.distance, i18n.intlLocale()),
      }),
    ),
  );

  content.append(checkbox, details);
  content.addEventListener('click', () => {
    if (state.selectMode) toggleTourSelection(tour.id);
    else if (state.selectedTourId === tour.id) closeDetailPanel();
    else selectTour(tour.id);
  });
  content.addEventListener('keydown', (e) => {
    // Space also scrolls the list by default; only suppress that once this
    // row is actually the one handling the key.
    if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return;
    e.preventDefault();
    content.click();
  });
  bindLongPress(content, () => {
    if (state.selectMode) return false;
    enterSingleSelect(tour.id);
    return true;
  });
  bindTourSwipe(content, () => deleteTourById(tour.id));

  li.append(deleteBg, content);
  return li;
}

// The list, its count and the pager: the part of renderSidebar that depends on
// the sort, search and "in view" filter.
export function renderTourList({ signedIn, loading, hasTours }) {
  elTourList.innerHTML = '';
  if (!hasTours) {
    elTourCount.textContent = formatCount(
      signedIn && !loading ? state.tours.length : 0,
      i18n.intlLocale(),
    );
    show(elTourPager, false);
    return;
  }

  // The map isn't beside the list on mobile to pan/zoom while watching it
  // filter, and the toggle is hidden there — ignore a stray filterInView=true
  // left over from a desktop session or a shared/bookmarked ?inView=1 URL,
  // or the list would filter itself with no visible control to undo it.
  const inViewActive = state.filterInView && !isMobileLayout();
  const scoped = inViewActive ? toursInView(state.tours, mapBoundsPlain()) : state.tours;
  const visible = visibleTours({
    tours: scoped,
    sort: state.sort,
    search: state.search,
    locale: i18n.intlLocale(),
  });
  const filterActive = inViewActive || state.search.trim() !== '';
  elTourCount.textContent = filterActive
    ? t('sidebar.filteredCount', { count: visible.length, total: state.tours.length })
    : formatCount(state.tours.length, i18n.intlLocale());
  if (visible.length === 0) {
    elTourList.appendChild(textDiv('tour-empty', t('tours.noMatch')));
    show(elTourPager, false);
    return;
  }

  const { items, page, totalPages } = paginate(visible, state.page, PAGE_SIZE);
  state.page = page;
  items.forEach((tour) => elTourList.appendChild(createTourItem(tour)));

  show(elTourPager, totalPages > 1);
  elTourPagerLabel.textContent = t('sidebar.pagerLabel', { page, totalPages });
  elTourPagerPrev.disabled = page <= 1;
  elTourPagerNext.disabled = page >= totalPages;
}
