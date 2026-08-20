'use strict';

import * as i18n from '../lib/i18n.js';
import { formatDistance } from '../lib/format.js';
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
  const stats = computeTourStats(state.tours);
  elStatsTotalDistance.textContent = formatDistance(stats.totalDistance);
  elStatsTotalCount.textContent = String(stats.totalCount);
  elStatsThisYear.textContent = formatDistance(stats.distanceThisYear);
  elStatsLastYear.textContent = formatDistance(stats.distanceLastYear);
  elStatsAverage.textContent = formatDistance(stats.averageDistance);

  show(elBtnStatsLongest, !!stats.longestTour);
  if (stats.longestTour) {
    elBtnStatsLongest.dataset.tourId = stats.longestTour.id;
    elStatsLongestDetail.textContent =
      `${stats.longestTour.name || ''} · ${formatDistance(stats.longestTour.distance)}`.trim();
  }

  show(elStatsEmpty, stats.totalCount === 0);
  elStatsPerYear.innerHTML = '';
  stats.perYear.forEach(({ year, distance, count }) => {
    const li = document.createElement('li');
    const yearSpan = document.createElement('span');
    yearSpan.className = 'stats-year';
    yearSpan.textContent = String(year);
    const detailSpan = document.createElement('span');
    detailSpan.textContent = t('stats.perYearRow', { distance: formatDistance(distance), count });
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
