import { ReactiveSet } from '@solid-primitives/set';
import { createEffect } from 'solid-js';
import { SetStoreFunction, createStore } from 'solid-js/store';

interface FilterStore {
  show: string;
  title: string;
  sort: string;
  startDate: Date | null,
  endDate: Date | null,
  eras: Era[],
}

interface Era {
  name: string,
  startDate: Date,
  endDate: Date,
  enabled: boolean
}

export const InitialState = {
  show: '',
  title: '',
  sort: 'newest-first',
  startDate: null,
  endDate: null,
  eras: [
    { enabled: true, name: 'Sausalito Era', startDate: new Date(1960, 0), endDate: new Date(2010, 6, 8) },
    { enabled: true, name: 'Whiskey Basement Era', startDate: new Date(2010, 6, 8), endDate: new Date(2012, 2, 14) },
    { enabled: true, name: 'CBSi Era', startDate: new Date(2012, 2, 14), endDate: new Date(2014, 5, 20) },
    { enabled: true, name: 'Giant Beast Era', startDate: new Date(2014, 5, 20), endDate: new Date(2016, 0, 1) },
    { enabled: true, name: 'GBE + Dan Era', startDate: new Date(2016, 0, 1), endDate: new Date(2020, 2, 11) },
    { enabled: true, name: 'Home Stream Era', startDate: new Date(2020, 2, 11), endDate: new Date(2022, 5, 6) },
    { enabled: true, name: 'Modern Era', startDate: new Date(2022, 5, 6), endDate: new Date(2099, 12) },
  ]
};

export function createFilterStore(): [FilterStore, SetStoreFunction<FilterStore>] {
  const lsState = window.localStorage.getItem('state');
  let initialState = Object.assign({}, InitialState);
  if (lsState) {
    initialState = Object.assign(initialState, JSON.parse(lsState, (key, value) => {
      if ((key == 'endDate' || key == 'startDate') && value !== null) {
        return new Date(value);
      }
      return value;
    }));
  }

  const [store, setStore] = createStore<FilterStore>(initialState);

  createEffect(() => {
    // store the state in localstorage
    window.localStorage.setItem('state', JSON.stringify(store));
  });

  return [store, setStore];
}

interface VideoStore {
  videos: { [id: string]: [number, number] };
}

export function createVideoStore(): [VideoStore, SetStoreFunction<VideoStore>] {
  let initialState = { videos: {} };

  const videos = window.localStorage.getItem('videos');
  if (videos) {
    initialState = JSON.parse(videos);
  }

  const [store, setStore] = createStore<VideoStore>(initialState);

  createEffect(() => {
    window.localStorage.setItem('videos', JSON.stringify(store));
  });

  return [store, setStore];
}

export function createFavoritesStore(): ReactiveSet<string> {
  let initialState = [];

  const favs = window.localStorage.getItem('favorites');
  if (favs?.[0] == '[') {
    initialState = JSON.parse(favs);
  }

  const store = new ReactiveSet<string>(initialState);

  createEffect(() => {
    window.localStorage.setItem('favorites', JSON.stringify(Array.from(store)));
  });

  return store;
}