import { createEffect } from 'solid-js';
import { SetStoreFunction, createStore } from 'solid-js/store';


interface FilterStore {
  show: string;
  title: string;
  sort: string;
}

export function createFilterStore(): [FilterStore, SetStoreFunction<FilterStore>] {
  let initialState = {
    show: '',
    title: '',
    sort: 'newest-first',
  };

  const lsState = window.localStorage.getItem('state');
  if (lsState) {
    initialState = JSON.parse(lsState);
  }

  const [store, setStore] = createStore<FilterStore>(initialState);

  createEffect(() => {
    // store the state in localstorage
    window.localStorage.setItem('state', JSON.stringify(store));
  });

  return [store, setStore];
}


interface VideoStore {
  videos: { [id: string]: string };
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