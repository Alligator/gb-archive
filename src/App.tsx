import { onMount, type Component, createSignal, For, Show, createEffect } from 'solid-js';
import { SetStoreFunction, createStore } from 'solid-js/store';
import type { JSX } from 'solid-js';
import styles from './App.module.css';

interface Video {
  date: Date;
  identifier: string;
  subject: string;
  title: string;
  description: string;
}

interface VideoJson {
  date: Date;
  identifier: string;
  subject: string | string[];
  title: string;
  description: string;
}

interface State {
  show: string;
  title: string;
  sort: string;
}

function createFilterStore(): [State, SetStoreFunction<State>] {
  let initialState = {
    show: '',
    title: '',
    sort: 'newest-first',
  };

  const lsState = window.localStorage.getItem('state');
  if (lsState) {
    initialState = JSON.parse(lsState);
  }

  const [store, setStore] = createStore<State>(initialState);

  createEffect(() => {
    // store the state in localstorage
    window.localStorage.setItem('state', JSON.stringify(store));
  });

  return [store, setStore];
}

const App: Component = () => {
  const [videos, setVideos] = createSignal<Video[]>([]);
  const [shows, setShows] = createSignal<string[]>([]);
  const [selectedVideo, setSelectedVideo] = createSignal<Video | null>(null);
  const [embiggen, setEmbiggen] = createSignal(false);
  const [filterState, setFilterState] = createFilterStore();

  onMount(async () => {
    const resp = await fetch('archive-org.json');
    const json = await resp.json() as VideoJson[];
    const videos: Video[] = json.map((v) => ({
      ...v,
      date: new Date(v.date),
      subject: Array.isArray(v.subject) ? v.subject[1] : v.subject,
    }));

    setVideos(videos);

    const showsSet = new Set<string>();
    for (const v of videos) {
      showsSet.add(v.subject);
    }
    const shows = [...showsSet];
    shows.sort();
    setShows(shows);

  });

  const filterByShow: JSX.EventHandler<HTMLSelectElement, Event> = (evt) => {
    setFilterState({ show: evt.currentTarget.value });
  };

  const search: JSX.EventHandler<HTMLInputElement, InputEvent> = (evt) => {
    setFilterState({ title: evt.currentTarget.value });
  };

  const selectVideo = (video: Video) => {
    if (selectedVideo()?.identifier === video.identifier) {
      setSelectedVideo(null);
    } else {
      setSelectedVideo(video);
    }
  };

  const filteredVideos = () => {
    let filteredVids = videos();

    if (filterState.show !== '') {
      filteredVids = filteredVids.filter(v => v.subject === filterState.show);
    }

    if (filterState.title !== '') {
      filteredVids = filteredVids.filter(v => v.title.toLowerCase().includes(filterState.title));
    }

    if (filterState.sort === 'newest-first') {
      filteredVids.sort((a, b) => b.date.getTime() - a.date.getTime());
    } else {
      filteredVids.sort((a, b) => a.date.getTime() - b.date.getTime());
    }
    return filteredVids;
  };

  const onDialogClick: JSX.EventHandler<HTMLDialogElement, Event> = (evt) => {
    if (evt.target === evt.currentTarget) {
      setSelectedVideo(null);
    }
  };

  const onSortChange: JSX.EventHandler<HTMLSelectElement, Event> = (evt) => {
    setFilterState({ sort: evt.currentTarget.value });
  };

  return (
    <main class="container">
      <table class="striped">
        <thead>
          <tr>
            <th>Date</th>
            <th>Title</th>
            <th>Show</th>
          </tr>
          <tr>
            <td>
              <select onChange={onSortChange} value={filterState.sort}>
                <option value="newest-first">Newest first</option>
                <option value="oldest-first">Oldest first</option>
              </select>
            </td>
            <td>
              <input type="search" onInput={search} value={filterState.title}/>
            </td>
            <td>
              <Show when={shows().length > 0}>
                <select onChange={filterByShow} value={filterState.show}>
                  <option value="">(none)</option>
                  <For each={shows()}>{show =>
                    <option value={show}>{show}</option>
                  }</For>
                </select>
              </Show>
            </td>
          </tr>
        </thead>
        <tbody>
          <For each={filteredVideos()}>{vid =>
            <tr>
              <td>{vid.date.toLocaleDateString()}</td>
              <td>
                <span class={styles.video} onClick={[selectVideo, vid]}>{vid.title}</span>
                <div class={styles.desc}>
                  <small>{vid.description}</small>
                </div>
                {/* <a href={`https://archive.org/details/${vid.identifier}`}>🔗</a> */}
                {/* <Show when={vid.identifier === selectedVideo()}>
                  <iframe src={`https://archive.org/embed/${vid.identifier}`} width="640" height="480" frameborder="0" webkitallowfullscreen="true" mozallowfullscreen="true" allowfullscreen></iframe>
                </Show> */}
              </td>
              <td>{vid.subject}</td>
            </tr>
          }</For>
        </tbody>
      </table>

      <Show when={selectedVideo()}>{vid =>
        <dialog open onClick={onDialogClick} class={embiggen() ? styles['dialog-embiggen'] : ''} >
          <article>
            <header class="embiggen-hide">{vid().title}</header>
            <p class="embiggen-hide"><small>{vid().description}</small></p>
            <p>
              <iframe class={embiggen() ? styles['embed-embiggen'] : styles.embed} src={`https://archive.org/embed/${vid().identifier}`} frameBorder="0" webkitallowfullscreen="true" mozallowfullscreen="true" allowfullscreen />
            </p>
            <button class="outline secondary" onClick={() => setEmbiggen(!embiggen()) }>{embiggen() ? 'Debiggen' : 'Embiggen'}</button>
          </article>
        </dialog>
      }</Show>

    </main>
  );
};

export default App;
