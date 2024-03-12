import { onMount, type Component, createSignal, onCleanup, createResource, createEffect } from 'solid-js';
import type { JSX } from 'solid-js';
import styles from './App.module.css';
import { debounce } from '@solid-primitives/scheduled';

import videojs from 'video.js';
import Player from 'video.js/dist/types/player';
import 'video.js/dist/video-js.css';

import 'videojs-mobile-ui/dist/videojs-mobile-ui.css';
import 'videojs-mobile-ui';

interface VideoPlayerProps {
  id: string
  initialTime?: number
  onTimeUpdate: (id: string, time: number, duration: number) => void
  onEnded?: () => void
  onCloseRequested: () => void
}

const fetchMeta = async (id: string) => {
  const resp = await fetch(`https://archive.org/metadata/${id}`);
  return resp.json();
};

export const VideoPlayer: Component<VideoPlayerProps> = props => {
  const [embiggen, setEmbiggen] = createSignal(false);
  const [videoId, setVideoId] = createSignal('');

  const [meta] = createResource(videoId, fetchMeta);

  let vidEl: HTMLVideoElement;
  let player: Player;

  function reloadPlayer() {
    console.log('reloading player');
    const lastTime = player.currentTime();
    player.load();
    player.currentTime(lastTime);
    player.play();
  }

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
      player.play();
    });
  });

  const onDialogClick: JSX.EventHandler<HTMLDialogElement, Event> = (evt) => {
    if (evt.target === evt.currentTarget) {
      props.onCloseRequested();
    }
  };

  onMount(() => {
    // initialize the video player
    const videoJsOptions = {
      autoplay: true, // 'any' doesn't work, muted videos when autoplay next
      controls: true,
      bigPlayButton: false,
      controlBar: {
        pictureInPictureToggle: false,
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
              else props.onCloseRequested();
              break;
            }
          }
        },
      },
    };

    // initialize videojs, use loadmedia so we can specify metadta
    player = videojs(vidEl, videoJsOptions);

    if (window.matchMedia('(pointer: coarse)').matches) {
      // @ts-expect-error // videojs plugin
      player.mobileUi();
    }

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

    // if it looks like its never coming back, reload it
    const keepAlive = debounce(reloadPlayer, 30000);
    player.on('playing', () => {
      console.log('video playing');
      keepAlive.clear();
    });

    player.on('waiting', () => {
      console.log('video waiting');
      keepAlive();
    });

    player.on('pause', () =>{
      console.log('video pause');
      keepAlive.clear();
    });

    // add the embiggen button to the player
    const Button = videojs.getComponent('Button');
    const cb = player.getChild('controlBar');

    const embiggenButton = new Button(player, {
      // @ts-expect-error // its fine, videojs types are broke
      clickHandler: () => setEmbiggen(!embiggen()),
      controlText: 'Embiggen',
    });
    embiggenButton.addClass('embiggen-button');
    cb?.addChild(embiggenButton, {}, cb.children_.length - 1);

    // add the buffer status button to the player
    const bufferStatusButton = new Button(player, {
      // @ts-expect-error // its fine, videojs types are broke
      clickHandler: reloadPlayer,
      controlText: 'Reload video',
    });
    bufferStatusButton.addClass('status-button');
    cb?.addChild(bufferStatusButton, {}, cb.children_.length - 3);
    const updateBuffer = () => bufferStatusButton.el().innerHTML = (player.bufferedEnd() - (player.currentTime() ?? 0)).toFixed(1) + 's';
    player.on('progress', updateBuffer);
    player.on('timeupdate', updateBuffer);

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