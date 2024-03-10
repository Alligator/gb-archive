import { type Component, createSignal, For, Show, createResource, createEffect, createMemo, Suspense } from 'solid-js';
import type { JSX, ResourceFetcher } from 'solid-js';
import styles from './App.module.css';

import { VirtualContainer } from '@minht11/solid-virtual-container';

import 'video.js/dist/video-js.css';
import { createFilterStore, createVideoStore } from './stores';
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
    date: new Date(v.date),
    subject: Array.isArray(v.subject) ? v.subject[1] : v.subject,
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
  const [shows, setShows] = createSignal<string[]>([]);
  const [filterState, setFilterState] = createFilterStore();
  const [videoStore, setVideoStore] = createVideoStore();
  const [videos, /*{ mutate, refetch }*/] = createResource(fetchVideos, { initialValue: [] });

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
    setFilterState({ show: '', sort: 'newest-first', title: '' });
    ev.preventDefault();
  };

  const filteredVideos = createMemo(() => {

    const filteredVids = videos().filter(v =>
      (filterState.show !== 'watched-videos' || v.identifier in videoStore.videos) &&
      (!filterState.show.length || filterState.show === 'watched-videos' || v.subject === filterState.show) &&
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
    const idx = vids.findIndex(vid => vid.identifier === selectedVideo());
    const nextVid = vids[idx + 1];
    if (!nextVid) return;
    setSelectedVideo(nextVid.identifier);
  };

  return (
    <main class="container">
      <Suspense fallback={<div class='loading' aria-busy="true" />}>
        <header>
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
        </header>
        <p>
          Showing {filteredVideos().length} / {videos().length} videos 
          <Show when={filterState.show != '' || filterState.sort != 'newest-first' || filterState.title != ''}>
            (<a href='' onClick={resetFilters}>Reset filters</a>)
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
            onCloseRequested={() => setSelectedVideo(null)}
          />
        }</Show>
      </Suspense>
    </main>
  );
};

export default App;
