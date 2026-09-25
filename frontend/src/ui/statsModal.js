import * as i18n from './i18n.js';
import { formatCount, formatDistance } from '../lib/format.js';
import { computeTourStats } from '../lib/stats.js';
import { state } from './state.js';
import { openModal, closeModal } from './modal.js';
import {
  setVisible,
  statsModal,
  statsTotalDistance,
  statsTotalCount,
  statsThisYear,
  statsLastYear,
  statsAverage,
  statsLongestButton,
  statsLongestDetail,
  statsEmpty,
  statsPerYear,
} from './dom.js';

const t = i18n.t;

function renderTotals({ stats, locale }) {
  statsTotalDistance.textContent = formatDistance(stats.totalDistance, locale);
  statsTotalCount.textContent = formatCount(stats.totalCount, locale);
  statsThisYear.textContent = formatDistance(stats.distanceThisYear, locale);
  statsLastYear.textContent = formatDistance(stats.distanceLastYear, locale);
  statsAverage.textContent = formatDistance(stats.averageDistance, locale);
}

function renderLongestTour({ longestTour, locale }) {
  setVisible(statsLongestButton, Boolean(longestTour));
  if (!longestTour) return;
  statsLongestButton.dataset.tourId = longestTour.id;
  statsLongestDetail.textContent = t('stats.longestDetail', {
    name: longestTour.name || '',
    distance: formatDistance(longestTour.distance, locale),
  }).trim();
}

function createYearRow({ year, distance, count, locale }) {
  const row = document.createElement('li');
  const yearLabel = document.createElement('span');
  yearLabel.className = 'stats-year';
  yearLabel.textContent = String(year);
  const detail = document.createElement('span');
  detail.textContent = t('stats.perYearRow', { distance: formatDistance(distance, locale), count });
  row.append(yearLabel, detail);
  return row;
}

function renderStats() {
  const locale = i18n.intlLocale();
  const stats = computeTourStats(state.tours, new Date());
  renderTotals({ stats, locale });
  renderLongestTour({ longestTour: stats.longestTour, locale });
  setVisible(statsEmpty, stats.totalCount === 0);
  statsPerYear.replaceChildren(...stats.perYear.map((year) => createYearRow({ ...year, locale })));
}

export function openStatsModal() {
  if (!state.user) return;
  renderStats();
  openModal(statsModal);
}

export function closeStatsModal() {
  closeModal(statsModal);
}
