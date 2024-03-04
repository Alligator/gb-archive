import { onMount, type Component, createSignal, For, Show, createEffect, onCleanup } from 'solid-js';
import { SetStoreFunction, createStore } from 'solid-js/store';
import type { JSX } from 'solid-js';
import styles from './App.module.css';

import { VirtualContainer } from '@minht11/solid-virtual-container';

import videojs from 'video.js';
import Player from 'video.js/dist/types/player';
import 'video.js/dist/video-js.css';

const [selectedVideo, setSelectedVideo] = createSignal<Video | null>(null);

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

const VideoPlayer: Component<{ id: string }> = props => {
  const [embiggen, setEmbiggen] = createSignal(false);

  const onDialogClick: JSX.EventHandler<HTMLDialogElement, Event> = (evt) => {
    if (evt.target === evt.currentTarget) {
      setSelectedVideo(null);
    }
  };

  let vidEl: HTMLVideoElement;
  let player: Player;

  // FIXME: this all shouldn't be in onmount, the async stuff can be handled some other way i think
  onMount(async () => {
    // grab the metadata and then find the download url
    const resp = await fetch(`https://archive.org/metadata/${props.id}`);
    const json = await resp.json();
    const video = json.files.find((item: { format: string; }) => item.format === 'MPEG4');
    const thumb = json.files.find((item: { format: string; }) => item.format === 'Thumbnail');
    const src = `https://archive.org/download/${props.id}/${video.name}`;

    // initialize the video player
    const videoJsOptions = {
      autoplay: true,
      controls: true,
      // sources: [{src, type: 'video/mp4'}]
    };

    // initialize videojs, use loadmedia so we can specify metadta
    player = videojs(vidEl, videoJsOptions);
    player.loadMedia({
      title: json.metadata.title,
      description: json.metadata.description,
      poster: `https://archive.org/download/${props.id}/${thumb.name}`,
      src: [{src, type: 'video/mp4'}]
    }, () => {
      // set current playback progress for the video if it exists
      const progress = window.localStorage.getItem(props.id);
      if (progress) {
        player.currentTime(progress);
      }
    });

    // for some reason the title bar is shown even while the video is playing???
    player.on('play', () => {
      document.querySelector('.vjs-title-bar')?.classList.add('hidden');
    });

    player.on('pause', () => {
      document.querySelector('.vjs-title-bar')?.classList.remove('hidden');
    });

    // during playback, update localstorage
    player.on('timeupdate', () => {
      window.localStorage.setItem(props.id, player.currentTime()!.toString());
    });

    // add the embiggen button to the player
    const Button = videojs.getComponent('Button');
    const embiggenButton = new Button(player, {
      // @ts-expect-error // its fine, videojs types are broke
      clickHandler: () => {
        setEmbiggen(!embiggen());
      }
    });
    embiggenButton.addClass('embiggen-button');

    // @ts-expect-error // here too
    player.controlBar.addChild(embiggenButton, {}, player.controlBar.children_.length - 1);
  });

  onCleanup(() => {
    player.dispose();
  });

  return <dialog open onClick={onDialogClick} class={embiggen() ? styles['dialog-embiggen'] : ''} >
    <article>
      <video class="video-js vjs-fill" ref={vidEl!} />
    </article>
  </dialog>;
};

const App: Component = () => {
  const [videos, setVideos] = createSignal<Video[]>([]);
  const [shows, setShows] = createSignal<string[]>([]);
  const [filterState, setFilterState] = createFilterStore();

  let scrollTargetElement!: HTMLTableRowElement;

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

  const onSortChange: JSX.EventHandler<HTMLSelectElement, Event> = (evt) => {
    setFilterState({ sort: evt.currentTarget.value });
  };

  return (
    <main class="container">
      <header>
        <select onChange={onSortChange} value={filterState.sort}>
          <option value="newest-first">Show newest first</option>
          <option value="oldest-first">Show oldest first</option>
        </select>
        <input type="search" onInput={search} value={filterState.title} />
        <Show when={shows().length > 0}>
          <select onChange={filterByShow} value={filterState.show}>
            <option value="">(none)</option>
            <For each={shows()}>{show =>
              <option value={show}>{show}</option>
            }</For>
          </select>
        </Show>
      </header>
      <div class="virtual-parent" ref={scrollTargetElement}>
        <VirtualContainer
          items={filteredVideos()}
          scrollTarget={scrollTargetElement}
          itemSize={{ height: 60 }}
        >
          {props => <div class='list-item' style={props.style}>
            <div class='date'>
              {props.item.date.toLocaleDateString()}
            </div>
            <div class='title'>
              <span class={styles.video} onClick={() => selectVideo(props.item)}>{props.item.title}</span>
              <div class={styles.desc}>
                <small>{props.item.description}</small>
              </div>
            </div>
            <div class='subject'>
              {props.item.subject}
            </div>
          </div>}
        </VirtualContainer>
      </div>
      <Show when={selectedVideo()}>{vid =>
        <VideoPlayer id={vid().identifier} />
      }</Show>
    </main>
  );
};

export default App;
