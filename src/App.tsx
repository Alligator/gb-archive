import { onMount, type Component, createSignal, For, Show, onCleanup, createResource, createEffect } from 'solid-js';
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
  onEnded?: () => void
}

const fetchMeta = async (id: string) => {
  const resp = await fetch(`https://archive.org/metadata/${id}`);
  return resp.json();
};

const VideoPlayer: Component<VideoPlayerProps> = props => {
  const [embiggen, setEmbiggen] = createSignal(false);
  const [videoId, setVideoId] = createSignal('');

  const [meta] = createResource(videoId, fetchMeta);

  let vidEl: HTMLVideoElement;
  let player: Player;

  // we need a signal to pass into createResource so do this seemingly unnecessary thing here
  createEffect(() => {
    setVideoId(props.id);
  });

  // video id updated, load it into the player
  createEffect(() => {
    if (!meta()) return;

    const video = meta().files.find((item: { format: string; }) => item.format === 'MPEG4');
    const thumb = meta().files.find((item: { format: string; }) => item.format === 'Thumbnail');
    const src = `https://archive.org/download/${props.id}/${video.name}`;

    player.loadMedia({
      title: `(${meta().metadata.date}) ${meta().metadata.title}`,
      description: meta().metadata.description,
      poster: thumb ? `https://archive.org/download/${props.id}/${thumb.name}` : undefined,
      src: [{ src, type: 'video/mp4' }]
    }, () => {
      player.focus();
    });
  });

  const onDialogClick: JSX.EventHandler<HTMLDialogElement, Event> = (evt) => {
    if (evt.target === evt.currentTarget) {
      setSelectedVideo(null);
    }
  };

  onMount(() => {
    // initialize the video player
    const videoJsOptions = {
      autoplay: true, // 'any' doesn't work, muted videos when autoplay next
      controls: true,
      controlBar: {
        skipButtons: {
          backward: 5,
          forward: 5,
        }
      },
      userActions: {
        hotkeys: function (this: Player, event: KeyboardEvent) {
          switch (event.key) {
            case ' ': {
              if (this.paused()) {
                this.play();
              } else {
                this.pause();
              }
              break;
            }

            case 'm': {
              this.muted(!this.muted());
              break;
            }

            case 'f': {
              if (this.isFullscreen()) {
                this.exitFullscreen();
              } else {
                this.requestFullscreen();
              }
              break;
            }

            case 'e': {
              setEmbiggen(!embiggen());
              break;
            }

            case 'ArrowLeft':
            case 'ArrowRight': {
              const currentTime = this.currentTime();
              if (typeof currentTime !== 'undefined') {
                const skipTime = event.key === 'ArrowLeft' ? -5 : 5;
                this.currentTime(Math.max(currentTime + skipTime, 0));
              }
              break;
            }

            case 'Escape': {
              if (embiggen()) setEmbiggen(false);
              else setSelectedVideo(null);
              break;
            }
          }
        },
      },
    };

    // initialize videojs, use loadmedia so we can specify metadta
    player = videojs(vidEl, videoJsOptions);

    // eslint-disable-next-line solid/reactivity
    player.on('ended', () => props.onEnded?.());

    // eslint-disable-next-line solid/reactivity
    player.on('timeupdate', () => {
      if (Number.isNaN(player.currentTime())) return;
      if (Number.isNaN(player.duration())) return;
      props.onTimeUpdate(videoId(), player.currentTime()!, player.duration()!);
    });

    // set current playback progress for the video if it exists
    player.on('loadedmetadata', () => {
      if (props.initialTime && player.duration()! - props.initialTime > 30) {
        player.currentTime(props.initialTime);
      }
    });

    // add the embiggen button to the player
    const Button = videojs.getComponent('Button');
    const embiggenButton = new Button(player, {
      // @ts-expect-error // its fine, videojs types are broke
      clickHandler: () => setEmbiggen(!embiggen()),
      controlText: 'Embiggen',
    });
    embiggenButton.addClass('embiggen-button');
    const cb = player.getChild('controlBar');
    cb?.addChild(embiggenButton, {}, cb.children_.length - 1);
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

    if (filterState.show === 'watched-videos') {
      filteredVids = filteredVids.filter(v => v.identifier in videoStore.videos);
    }
    else if (filterState.show !== '') {
      filteredVids = filteredVids.filter(v => v.subject === filterState.show);
    }

    if (filterState.title !== '') {
      filteredVids = filteredVids.filter(v => v.title.toLowerCase().includes(filterState.title));
    }

    if (filterState.sort === 'newest-first') {
      filteredVids.sort((a, b) => b.date.getTime() - a.date.getTime());
    } else if (filterState.sort === 'oldest-first') {
      filteredVids.sort((a, b) => a.date.getTime() - b.date.getTime());
    } else if (filterState.sort === 'video-title') {
      filteredVids.sort((a, b) => a.title.localeCompare(b.title));

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

  const onEnded = () => {
    const vids = filteredVideos();
    const idx = vids.findIndex(vid => vid.identifier === selectedVideo()?.identifier);
    const nextVid = vids[idx + 1];
    if (!nextVid) return;
    setSelectedVideo(nextVid);
  };

  const clearProgress = (id: string) => {
    setVideoStore(
      produce((s) => {
        s.videos[id] = undefined!;
      }),
    );
  };

  return (
    <main class="container">
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
                <div class='line'>
                  <span class={styles.video} onClick={() => selectVideo(props.item)}>{props.item.title}</span>
                  <Show when={videoStore.videos[props.item.identifier] !== undefined}>
                    <progress
                      value={videoStore.videos[props.item.identifier][0] / videoStore.videos[props.item.identifier][1] * 100}
                      max="100" />
                    <span class='reset' onClick={() => clearProgress(props.item.identifier)} title='Reset progress' />
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
      </div>
      <Show when={selectedVideo()}>{vid =>
        <VideoPlayer id={vid().identifier} initialTime={videoStore.videos[vid().identifier]?.[0] ?? undefined} onTimeUpdate={onTimeUpdate} onEnded={onEnded} />
      }</Show>
    </main>
  );
};

export default App;
