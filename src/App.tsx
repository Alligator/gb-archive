import { onMount, type Component, createSignal, For, Show, onCleanup } from 'solid-js';
import type { JSX } from 'solid-js';
import styles from './App.module.css';

import { VirtualContainer } from '@minht11/solid-virtual-container';

import videojs from 'video.js';
import Player from 'video.js/dist/types/player';
import 'video.js/dist/video-js.css';
import { createFilterStore, createVideoStore } from './stores';
import { produce } from 'solid-js/store';

const [selectedVideo, setSelectedVideo] = createSignal<Video | null>(null);

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

interface VideoPlayerProps {
  id: string
  initialTime?: number
  onTimeUpdate: (id: string, time: number, duration: number) => void
}

const VideoPlayer: Component<VideoPlayerProps> = props => {
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
    };

    // initialize videojs, use loadmedia so we can specify metadta
    player = videojs(vidEl, videoJsOptions);
    player.loadMedia({
      title: json.metadata.title,
      description: json.metadata.description,
      poster: `https://archive.org/download/${props.id}/${thumb.name}`,
      src: [{ src, type: 'video/mp4' }]
    }, () => {
      // set current playback progress for the video if it exists
      if (props.initialTime && player.duration()! - props.initialTime > 30) {
        player.currentTime(props.initialTime);
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
      props.onTimeUpdate(props.id, player.currentTime()!, player.duration()!);
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
  const [videoStore, setVideoStore] = createVideoStore();

  let scrollTargetElement!: HTMLDivElement;

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

  const onTimeUpdate = (id: string, time: number, duration: number) => {
    setVideoStore(
      produce((s) => {
        s.videos[id] = [time, duration];
      }),
    );
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
                <span class={styles.video} onClick={() => selectVideo(props.item)}>{props.item.title}</span>
                <Show when={videoStore.videos[props.item.identifier] !== undefined}>
                  <progress
                    value={videoStore.videos[props.item.identifier][0] / videoStore.videos[props.item.identifier][1] * 100}
                    max="100" />
                </Show>
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
        <VideoPlayer id={vid().identifier} initialTime={videoStore.videos[vid().identifier][0]} onTimeUpdate={onTimeUpdate} />
      }</Show>
    </main>
  );
};

export default App;
