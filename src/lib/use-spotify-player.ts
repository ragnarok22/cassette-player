import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { getValidSpotifyAccessToken } from './spotify-auth';

type SpotifyPlayerStatus = 'idle' | 'loading' | 'ready' | 'offline' | 'error';

export type SpotifyPlaybackTrack = {
  album: string;
  artist: string;
  artworkUrl?: string;
  title: string;
  uri: string;
};

type SpotifyPlaybackState = {
  autoplayBlocked: boolean;
  currentTrack: SpotifyPlaybackTrack | null;
  deviceId: string | null;
  duration: number;
  error: string | null;
  isPlaying: boolean;
  position: number;
  shuffle: boolean;
  status: SpotifyPlayerStatus;
};

const initialState: SpotifyPlaybackState = {
  autoplayBlocked: false,
  currentTrack: null,
  deviceId: null,
  duration: 0,
  error: null,
  isPlaying: false,
  position: 0,
  shuffle: false,
  status: 'idle',
};

let sdkPromise: Promise<Spotify.Spotify> | null = null;

function loadSpotifySdk() {
  if (window.Spotify) return Promise.resolve(window.Spotify);
  if (sdkPromise) return sdkPromise;

  const loading = new Promise<Spotify.Spotify>((resolve, reject) => {
    const timeout = window.setTimeout(
      () => reject(new Error('Spotify tardó demasiado en cargar.')),
      15_000,
    );
    window.onSpotifyWebPlaybackSDKReady = () => {
      window.clearTimeout(timeout);
      if (window.Spotify) resolve(window.Spotify);
      else reject(new Error('Spotify no pudo inicializar el reproductor.'));
    };

    if (!document.querySelector('script[data-spotify-sdk]')) {
      const script = document.createElement('script');
      script.src = 'https://sdk.scdn.co/spotify-player.js';
      script.async = true;
      script.dataset.spotifySdk = 'true';
      script.addEventListener('error', () => {
        window.clearTimeout(timeout);
        reject(new Error('No se pudo descargar el reproductor de Spotify.'));
      });
      document.body.appendChild(script);
    }
  });
  sdkPromise = loading.catch((error: unknown) => {
    sdkPromise = null;
    document.querySelector('script[data-spotify-sdk]')?.remove();
    throw error;
  });

  return sdkPromise;
}

function mapPlaybackState(state: Spotify.WebPlaybackState) {
  const track = state.track_window.current_track;
  return {
    currentTrack: {
      album: track.album.name,
      artist: track.artists.map((artist) => artist.name).join(', '),
      artworkUrl: track.album.images[0]?.url,
      title: track.name,
      uri: track.uri,
    },
    duration: Math.max(0, state.duration / 1000),
    isPlaying: !state.paused,
    position: Math.max(0, state.position / 1000),
    shuffle: state.shuffle,
  };
}

function subscribeToPlayerEvents(
  player: Spotify.Player,
  listeners: {
    onAutoplayFailed: () => void;
    onError: (error: Spotify.WebPlaybackError) => void;
    onNotReady: (value: { device_id: string }) => void;
    onPlayerStateChanged: (state: Spotify.WebPlaybackState | null) => void;
    onReady: (value: { device_id: string }) => void;
  },
) {
  const {
    onAutoplayFailed,
    onError,
    onNotReady,
    onPlayerStateChanged,
    onReady,
  } = listeners;

  player.addListener('ready', onReady);
  player.addListener('not_ready', onNotReady);
  player.addListener('player_state_changed', onPlayerStateChanged);
  player.addListener('autoplay_failed', onAutoplayFailed);
  player.addListener('initialization_error', onError);
  player.addListener('authentication_error', onError);
  player.addListener('account_error', onError);
  player.addListener('playback_error', onError);

  return () => {
    player.removeListener('ready', onReady);
    player.removeListener('not_ready', onNotReady);
    player.removeListener('player_state_changed', onPlayerStateChanged);
    player.removeListener('autoplay_failed', onAutoplayFailed);
    player.removeListener('initialization_error', onError);
    player.removeListener('authentication_error', onError);
    player.removeListener('account_error', onError);
    player.removeListener('playback_error', onError);
  };
}

export function useSpotifyPlayer(
  enabled: boolean,
  onTrackChange?: (track: SpotifyPlaybackTrack, isPlaying: boolean) => void,
) {
  const playerRef = useRef<Spotify.Player | null>(null);
  const [state, setState] = useState(initialState);
  const notifyTrackChange = useEffectEvent(
    (track: SpotifyPlaybackTrack, isPlaying: boolean) => {
      onTrackChange?.(track, isPlaying);
    },
  );

  useEffect(() => {
    let cancelled = false;
    let effectPlayer: Spotify.Player | null = null;
    let teardownPlayerEvents: (() => void) | null = null;

    const reportError = (error: unknown) => {
      if (cancelled) return;
      setState((current) => ({
        ...current,
        error:
          error instanceof Error
            ? error.message
            : 'Spotify no pudo inicializarse.',
        isPlaying: false,
        status: 'error',
      }));
    };
    const onReady = ({ device_id: deviceId }: { device_id: string }) => {
      setState((current) => ({
        ...current,
        deviceId,
        error: null,
        status: 'ready',
      }));
    };
    const onNotReady = () => {
      setState((current) => ({
        ...current,
        isPlaying: false,
        status: 'offline',
      }));
    };
    const onPlayerStateChanged = (
      playbackState: Spotify.WebPlaybackState | null,
    ) => {
      if (!playbackState) return;
      const nextState = mapPlaybackState(playbackState);
      setState((current) => ({
        ...current,
        ...nextState,
        autoplayBlocked: false,
      }));
      notifyTrackChange(nextState.currentTrack, nextState.isPlaying);
    };
    const onAutoplayFailed = () => {
      setState((current) => ({
        ...current,
        autoplayBlocked: true,
        isPlaying: false,
      }));
    };
    const onError = ({ message }: Spotify.WebPlaybackError) => {
      reportError(new Error(message));
    };

    if (!enabled) {
      playerRef.current?.disconnect();
      playerRef.current = null;
    } else {
      void loadSpotifySdk()
        .then((spotify) => {
          if (cancelled) return;

          setState((current) => ({
            ...current,
            error: null,
            status: 'loading',
          }));

          effectPlayer = new spotify.Player({
            name: 'Cassette Player',
            volume: 0.72,
            getOAuthToken: (callback) => {
              void getValidSpotifyAccessToken()
                .then((token) => callback(token ?? ''))
                .catch((error: unknown) => {
                  callback('');
                  reportError(error);
                });
            },
          });
          playerRef.current = effectPlayer;

          teardownPlayerEvents = subscribeToPlayerEvents(effectPlayer, {
            onAutoplayFailed,
            onError,
            onNotReady,
            onPlayerStateChanged,
            onReady,
          });
          return effectPlayer.connect().then((connected) => {
            if (!connected) {
              throw new Error('No se pudo conectar el reproductor de Spotify.');
            }
          });
        })
        .catch((error: unknown) => {
          if (cancelled) return;
          setState((current) => ({
            ...current,
            error:
              error instanceof Error
                ? error.message
                : 'Spotify no pudo inicializarse.',
            isPlaying: false,
            status: 'error',
          }));
        });
    }

    return () => {
      cancelled = true;
      teardownPlayerEvents?.();
      effectPlayer?.disconnect();
      if (playerRef.current === effectPlayer) {
        playerRef.current = null;
      }
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !state.isPlaying) return;
    const interval = window.setInterval(() => {
      void playerRef.current?.getCurrentState().then((playbackState) => {
        if (!playbackState) return;
        setState((current) => ({
          ...current,
          ...mapPlaybackState(playbackState),
        }));
      });
    }, 1000);
    return () => window.clearInterval(interval);
  }, [enabled, state.isPlaying]);

  return {
    ...state,
    activate: () => playerRef.current?.activateElement() ?? Promise.resolve(),
    pause: () => playerRef.current?.pause() ?? Promise.resolve(),
    resume: () => playerRef.current?.resume() ?? Promise.resolve(),
    seek: (seconds: number) =>
      playerRef.current?.seek(Math.max(0, seconds) * 1000) ?? Promise.resolve(),
    setVolume: (volume: number) =>
      playerRef.current?.setVolume(Math.min(1, Math.max(0, volume))) ??
      Promise.resolve(),
  };
}
