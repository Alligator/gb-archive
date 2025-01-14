import { type Component, createSignal, For, Show, createResource, createEffect, createMemo, Suspense } from 'solid-js';
import type { JSX, ResourceFetcher } from 'solid-js';
import styles from './App.module.css';

import { VirtualContainer } from '@minht11/solid-virtual-container';

import 'video.js/dist/video-js.css';
import { createFilterStore, createVideoStore, InitialState } from './stores';
import { produce } from 'solid-js/store';
import { VideoPlayer } from './VideoPlayer';
import { compress, decompress } from './compression';

interface Video {
  date: Date
  identifier: string
  subject: string
  title: string
  description: string
}

interface VideoJson {
  date: Date
  identifier: string
  subject: string | string[]
  title: string
  description: string
}

const fetchVideos: ResourceFetcher<true, Video[], unknown> = async (_source, { /* value, */ refetching }) => {
  const cached = localStorage.getItem('videoResp');
  const lastTime = parseInt(localStorage.getItem('lastRequestTime') ?? '0');

  // grab json from either cache or online
  let json;
  const isCached = !refetching && cached && (new Date().getTime()) - lastTime < 48 * 60 * 60 * 1000; // 48 hour cache
  if (isCached) {
    if (cached[0] === '[') {
      // probably uncompressed json
      json = JSON.parse(cached);
    } else {
      json = JSON.parse(await decompress(cached));
    }
  } else {
    const resp = await fetch('https://archive.org/advancedsearch.php?q=collection%3A%22giant-bomb-archive%22&fl%5B%5D=date&fl%5B%5D=description&fl%5B%5D=identifier&fl%5B%5D=subject&fl%5B%5D=title&sort%5B%5D=&sort%5B%5D=&sort%5B%5D=&rows=20000&page=1&output=json&save=yes');
    json = await resp.json();
    json = json.response.docs;
  }

  // spruce up the response a bit
  const videos: Video[] = json.map((v: VideoJson) => ({
    ...v,
    date: new Date(v.date).getTime() - new Date(2008, 4, 28).getTime() >= 0 ? new Date(v.date) : new Date(2008, 4, 28),
    subject: Array.isArray(v.subject) ? v.subject.filter(s => s != 'Giant Bomb')[0] ?? 'Giant Bomb' : v.subject,
  }));

  try {
    if (!isCached) {
      localStorage.setItem('videoResp', await compress(JSON.stringify(videos)));
      localStorage.setItem('lastRequestTime', new Date().getTime().toString());
    }
  } catch (e) {
    console.warn('Error while caching response', e);
  }

  return videos;
};

const App: Component = () => {
  const [selectedVideo, setSelectedVideo] = createSignal<string | null>(null);
  const [randomPlay, setRandomPlay] = createSignal(false);

  const [shows, setShows] = createSignal<string[]>([]);
  const [filterState, setFilterState] = createFilterStore();
  const [videoStore, setVideoStore] = createVideoStore();
  const [videos, /*{ mutate, refetch }*/] = createResource(fetchVideos, { initialValue: [] });
  const [showDateFilters, setShowDateFIlters] = createSignal(false);

  // update list of shows based on video subjects
  createEffect(() => {
    const showsSet = new Set<string>();
    for (const v of videos()) {
      showsSet.add(v.subject);
    }
    const shows = [...showsSet];
    shows.sort();
    setShows(shows);
  });

  // update html elements of date filters
  let startDateEl: HTMLInputElement;
  let endDateEl: HTMLInputElement;
  createEffect(() => {
    startDateEl!.valueAsDate = filterState.startDate;
    endDateEl!.valueAsDate = filterState.endDate;

    startDateEl!.setAttribute('min', '2008-05-28');

    const endMin = new Date(filterState.startDate ?? new Date());
    endMin.setDate(endMin.getDate() + 1);
    endDateEl!.setAttribute('min', endMin.toISOString().split('T')[0]);

    startDateEl!.setAttribute('max', new Date().toISOString().split('T')[0]);
    endDateEl!.setAttribute('max', new Date().toISOString().split('T')[0]);
  });

  // sort dropdown changed
  const onSortChange: JSX.EventHandler<HTMLSelectElement, Event> = (evt) => {
    setFilterState({ sort: evt.currentTarget.value });
  };

  // video name filter input
  const search: JSX.EventHandler<HTMLInputElement, InputEvent> = (evt) => {
    setFilterState({ title: evt.currentTarget.value });
  };

  // show dropdown changed
  const filterByShow: JSX.EventHandler<HTMLSelectElement, Event> = (evt) => {
    setFilterState({ show: evt.currentTarget.value });
  };

  // video clicked handler
  const selectVideo = (video: Video) => {
    if (selectedVideo() === video.identifier) {
      setSelectedVideo(null);
    } else {
      setSelectedVideo(video.identifier);
    }
  };

  // progress bar delete clicked
  const clearProgress = (id: string) => {
    setVideoStore(
      produce((s) => {
        s.videos[id] = undefined!;
      }),
    );
  };

  // reset filters back to default
  const resetFilters = (ev: Event) => {
    setFilterState(Object.assign({}, InitialState));
    ev.preventDefault();
  };

  // link clicked to start random video player
  const playRandom = (ev: Event) => {
    setRandomPlay(true);
    onEnded();
    ev.preventDefault();
  };

  const filteredVideos = createMemo(() => {
    const filteredVids = videos().filter(v =>
      (filterState.show !== 'watched-videos' || v.identifier in videoStore.videos) &&
      (!filterState.show.length || filterState.show === 'watched-videos' || v.subject === filterState.show) &&
      (filterState.startDate == null || v.date.getTime() >= filterState.startDate.getTime()) &&
      (filterState.endDate == null || v.date.getTime() < filterState.endDate.getTime()) &&
      (filterState.eras.some(
        era => era.enabled && v.date.getTime() >= era.startDate.getTime() && v.date.getTime() < era.endDate.getTime())) &&
      (!filterState.title.length || v.title.toLowerCase().includes(filterState.title))
    );

    if (filterState.sort === 'newest-first') {
      filteredVids.sort((a, b) => b.date.getTime() - a.date.getTime());
    } else if (filterState.sort === 'oldest-first') {
      filteredVids.sort((a, b) => a.date.getTime() - b.date.getTime());
    } else if (filterState.sort === 'video-title') {
      filteredVids.sort((a, b) => a.title.localeCompare(b.title));
    }

    return filteredVids;
  });

  // video player callbacks

  const onTimeUpdate = (id: string, time: number, duration: number) => {
    setVideoStore(
      produce((s) => {
        s.videos[id] = [time, duration];
      }),
    );
  };

  const onEnded = () => {
    const vids = filteredVideos();
    if (randomPlay()) {
      const nextVid = vids[Math.floor(Math.random() * vids.length)];
      setSelectedVideo(nextVid.identifier);
    } else {
      const idx = vids.findIndex(vid => vid.identifier === selectedVideo());
      const nextVid = vids[idx + 1];
      if (!nextVid) return;
      setSelectedVideo(nextVid.identifier);
    }

  };

  const onCloseRequested = () => {
    setRandomPlay(false);
    setSelectedVideo(null);
  };

  const areFiltersDefaulted = createMemo(() => {
    return filterState.show != '' ||
      filterState.sort != 'newest-first' ||
      filterState.title != '' ||
      filterState.startDate != null ||
      filterState.endDate != null ||
      filterState.eras.some(era => !era.enabled);
  });

  const getYearRange = (start: Date, end: Date) => {
    const startYear = start.getFullYear();
    const endYear = end.getFullYear();
    return `${startYear < 2008 ? '2008' : startYear}-${endYear > new Date().getFullYear() ? 'present' : endYear}`;
  };

  return (
    <main class="container">
      <Suspense fallback={<div class='loading' aria-busy="true" />}>
        <header class='filters'>
          <select onChange={onSortChange} value={filterState.sort}>
            <option value="newest-first">Show newest first</option>
            <option value="oldest-first">Show oldest first</option>
            <option value="video-title">Sort alphabetically</option>
          </select>
          <input type="search" onInput={search} placeholder='Video Title' value={filterState.title} />
          <Show when={shows().length > 0}>
            <select onChange={filterByShow} value={filterState.show}>
              <option value="">All Shows</option>
              <option value="watched-videos">Watched Videos</option>
              <For each={shows()}>{show =>
                <option value={show}>{show}</option>
              }</For>
            </select>
          </Show>
          <button class='outline secondary' title='Filter by date' onClick={[setShowDateFIlters, true]}>🗓️</button>
        </header>
        <p class="showing-videos">
          Showing {filteredVideos().length} / {videos().length} videos
          <Show when={filteredVideos().length}>
            <a href='' onClick={playRandom}>Random</a>
          </Show>

          <Show when={areFiltersDefaulted()}>
            <a href='' onClick={resetFilters}>Reset filters</a>
          </Show>
        </p>
        <VirtualContainer
          items={filteredVideos()}
          scrollTarget={document.querySelector('#root')! as HTMLElement}
          itemSize={{ height: 60 }}
        >
          {props =>
            <div
              classList={{
                'list-item': true,
                'seen': videoStore.videos[props.item.identifier] !== undefined,
                'odd': props.index % 2 === 0
              }}
              style={props.style}
            >
              <div class='date'>
                {props.item.date.toLocaleDateString()}
              </div>
              <div class='title'>
                <div class='line'>
                  <span class={styles.video} onClick={() => selectVideo(props.item)}>{props.item.title}</span>
                  <Show when={videoStore.videos[props.item.identifier] !== undefined}>
                    <progress
                      value={videoStore.videos[props.item.identifier][0] / videoStore.videos[props.item.identifier][1] * 100}
                      max="100" />
                    <span class='reset-button' onClick={() => clearProgress(props.item.identifier)} title='Reset progress' />
                  </Show>
                </div>
                <div class={styles.desc}>
                  <small>{props.item.description}</small>
                </div>
              </div>
              <div class='subject'>
                {props.item.subject}
              </div>
            </div>}
        </VirtualContainer>
        <Show when={selectedVideo()}>{vid =>
          <VideoPlayer
            id={vid()}
            initialTime={videoStore.videos[vid()]?.[0] ?? undefined}
            onTimeUpdate={onTimeUpdate}
            onEnded={onEnded}
            onCloseRequested={onCloseRequested}
          />
        }</Show>
        <dialog class='date-filter' open={showDateFilters()}>
          <article>
            <header>
              <p>
                <strong>🗓️ Filter by date</strong>
              </p>
            </header>
            <fieldset>
              <legend>Show videos from:</legend>
              <For each={filterState.eras}>{(era, i) =>
                <label>
                  <input type="checkbox" name="english" checked={era.enabled} onClick={() => setFilterState('eras', i(), 'enabled', !era.enabled)} />
                  {era.name} <em>({getYearRange(era.startDate, era.endDate)})</em>
                </label>
              }</For>
              <hr/>

              <label for="start">Start date:</label>
              <input type="date" ref={startDateEl!} onChange={ev => setFilterState('startDate', ev.target.valueAsDate)}/>
              <label for="end">End date:</label>
              <input type="date" ref={endDateEl!} onChange={ev => setFilterState('endDate', ev.target.valueAsDate)}/>
            </fieldset>
            <footer>
              <button onClick={[setShowDateFIlters, false]}>Close</button>
            </footer>
          </article>
        </dialog>
      </Suspense>
    </main>
  );
};

export default App;
