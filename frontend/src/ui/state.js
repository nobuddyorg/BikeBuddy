import { DEFAULT_SORT } from '../lib/tours.js';
import { loadLineStyle } from './lineStyleStorage.js';

export const state = {
  user: null,
  tours: [],
  selectedTourId: null,
  // Photo uploads wait for this; the gallery render it ends with would wipe their tiles.
  detailLoading: Promise.resolve(),
  routeLayer: null,
  lineStyle: loadLineStyle(),
  pinLayer: null,
  showPins: false,
  loadingTours: false,
  toursLoadFailed: false,
  sort: DEFAULT_SORT,
  search: '',
  filterInView: false,
  page: 1,
  selectMode: false,
  selectedIds: new Set(),
};
