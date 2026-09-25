import * as i18n from './i18n.js';
import { formatCount, formatDistance } from '../lib/format.js';
import { computeTourStats } from '../lib/stats.js';
import { state } from './state.js';
import { openModal, closeModal } from './modal.js';
import {
  show,
  elStatsModal,
  elStatsTotalDistance,
  elStatsTotalCount,
  elStatsThisYear,
  elStatsLastYear,
  elStatsAverage,
  elBtnStatsLongest,
  elStatsLongestDetail,
  elStatsEmpty,
  elStatsPerYear,
} from './dom.js';

const t = i18n.t;

function renderStats() {
  const locale = i18n.intlLocale();
  const stats = computeTourStats(state.tours, new Date());
  elStatsTotalDistance.textContent = formatDistance(stats.totalDistance, locale);
  elStatsTotalCount.textContent = formatCount(stats.totalCount, locale);
  elStatsThisYear.textContent = formatDistance(stats.distanceThisYear, locale);
  elStatsLastYear.textContent = formatDistance(stats.distanceLastYear, locale);
  elStatsAverage.textContent = formatDistance(stats.averageDistance, locale);

  show(elBtnStatsLongest, !!stats.longestTour);
  if (stats.longestTour) {
    elBtnStatsLongest.dataset.tourId = stats.longestTour.id;
    elStatsLongestDetail.textContent = t('stats.longestDetail', {
      name: stats.longestTour.name || '',
      distance: formatDistance(stats.longestTour.distance, locale),
    }).trim();
  }

  show(elStatsEmpty, stats.totalCount === 0);
  elStatsPerYear.innerHTML = '';
  stats.perYear.forEach(({ year, distance, count }) => {
    const li = document.createElement('li');
    const yearSpan = document.createElement('span');
    yearSpan.className = 'stats-year';
    yearSpan.textContent = String(year);
    const detailSpan = document.createElement('span');
    detailSpan.textContent = t('stats.perYearRow', {
      distance: formatDistance(distance, locale),
      count,
    });
    li.append(yearSpan, detailSpan);
    elStatsPerYear.appendChild(li);
  });
}

export function openStatsModal() {
  if (!state.user) return;
  renderStats();
  openModal(elStatsModal);
}

export function closeStatsModal() {
  closeModal(elStatsModal);
}
