'use strict';

import { loadLineStyle } from '../lib/lineStyle.js';

export const state = {
  user: null,
  tours: [],
  selectedTourId: null,
  routeLayer: null,
  routePointSets: [],
  lineStyle: loadLineStyle(),
  pinLayer: null,
  showPins: false,
  loadingTours: false,
  toursLoadFailed: false,
  sort: 'date-desc',
  search: '',
  filterInView: false,
  page: 1,
  selectMode: false,
  selectedIds: new Set(),
};
