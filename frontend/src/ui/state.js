import { DEFAULT_SORT } from '../lib/tours.js';
import { loadLineStyle } from './lineStyleStorage.js';

export const state = {
  user: null,
  tours: [],
  selectedTourId: null,
  // Settles once the selected tour's detail has loaded and its gallery is drawn
  // (tour-detail.js selectTour); a photo upload waits for it, or that render
  // would wipe the upload's tiles.
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
