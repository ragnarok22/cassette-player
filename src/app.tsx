import {
  useEffect,
  useReducer,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import {
  Bluetooth,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  FastForward,
  Heart,
  Link2,
  ListMusic,
  Pause,
  PanelTopOpen,
  Play,
  Radio,
  Rewind,
  Settings2,
  Shuffle,
  Volume2,
  X,
} from 'lucide-react';
import { tapes as demoTapes } from './data/library';
import { formatTime, getNextIndex, getProgress } from './lib/player';
import {
  beginSpotifyLogin,
  disconnectSpotify,
  getSpotifyConfig,
  initializeSpotifySession,
} from './lib/spotify-auth';
import {
  getSpotifyProfile,
  getSpotifySavedAlbums,
  playSpotifyTrack,
  setSpotifyShuffle,
} from './lib/spotify-api';
import {
  useSpotifyPlayer,
  type SpotifyPlaybackTrack,
} from './lib/use-spotify-player';
import type { Tape } from './types';

type MotionDirection = 'forward' | 'backward' | null;

type PlayerState = {
  tapeIndex: number;
  trackIndex: number;
  motion: MotionDirection;
  ejected: boolean;
};

type PlayerAction =
  | { type: 'cue-start'; direction: 1 | -1 }
  | { type: 'cue-cancel' }
  | { type: 'cue-complete'; direction: 1 | -1; trackCount: number }
  | { type: 'select-tape'; tapeIndex: number }
  | { type: 'sync-track'; tapeIndex: number; trackIndex: number }
  | { type: 'toggle-eject' }
  | { type: 'close-deck' };

type SpotifySessionStatus =
  'checking' | 'unconfigured' | 'disconnected' | 'connected' | 'error';

type SpotifyLibraryStatus = 'idle' | 'loading' | 'ready' | 'error';

type SpotifyState = {
  sessionStatus: SpotifySessionStatus;
  accessToken: string | null;
  spotifyTapes: Tape[];
  libraryStatus: SpotifyLibraryStatus;
  profileName: string | null;
  spotifyError: string | null;
};

type SpotifyAction =
  | { type: 'session-initialized'; accessToken: string | null }
  | {
      type: 'session-failed';
      sessionStatus: 'error' | 'unconfigured';
      error: string;
    }
  | { type: 'library-loaded'; spotifyTapes: Tape[]; profileName: string }
  | { type: 'library-failed'; error: string }
  | { type: 'login-started' }
  | {
      type: 'disconnected';
      sessionStatus: 'disconnected' | 'unconfigured';
    }
  | { type: 'error-changed'; error: string | null };

const initialPlayerState: PlayerState = {
  tapeIndex: 0,
  trackIndex: 0,
  motion: null,
  ejected: false,
};

function playerReducer(state: PlayerState, action: PlayerAction): PlayerState {
  switch (action.type) {
    case 'cue-start':
      if (state.ejected || state.motion) return state;
      return {
        ...state,
        motion: action.direction === 1 ? 'forward' : 'backward',
      };
    case 'cue-complete':
      return {
        ...state,
        trackIndex: getNextIndex(
          state.trackIndex,
          action.trackCount,
          action.direction,
        ),
        motion: null,
      };
    case 'cue-cancel':
      return { ...state, motion: null };
    case 'select-tape':
      return {
        ...state,
        tapeIndex: action.tapeIndex,
        trackIndex: 0,
        ejected: false,
        motion: null,
      };
    case 'sync-track':
      return {
        ...state,
        tapeIndex: action.tapeIndex,
        trackIndex: action.trackIndex,
        ejected: false,
      };
    case 'toggle-eject':
      return { ...state, ejected: !state.ejected, motion: null };
    case 'close-deck':
      return { ...state, ejected: false };
  }
}

function createInitialSpotifyState(configured: boolean): SpotifyState {
  return {
    sessionStatus: configured ? 'checking' : 'unconfigured',
    accessToken: null,
    spotifyTapes: [],
    libraryStatus: 'idle',
    profileName: null,
    spotifyError: null,
  };
}

function spotifyReducer(
  state: SpotifyState,
  action: SpotifyAction,
): SpotifyState {
  switch (action.type) {
    case 'session-initialized':
      return {
        ...state,
        accessToken: action.accessToken,
        sessionStatus: action.accessToken ? 'connected' : 'disconnected',
        libraryStatus: action.accessToken
          ? state.libraryStatus === 'idle'
            ? 'loading'
            : state.libraryStatus
          : 'idle',
      };
    case 'session-failed':
      return {
        ...state,
        sessionStatus: action.sessionStatus,
        spotifyError: action.error,
      };
    case 'library-loaded':
      return {
        ...state,
        spotifyTapes: action.spotifyTapes,
        profileName: action.profileName,
        libraryStatus: 'ready',
      };
    case 'library-failed':
      return {
        ...state,
        libraryStatus: 'error',
        spotifyError: action.error,
      };
    case 'login-started':
      return { ...state, sessionStatus: 'checking', spotifyError: null };
    case 'disconnected':
      return {
        sessionStatus: action.sessionStatus,
        accessToken: null,
        spotifyTapes: [],
        libraryStatus: 'idle',
        profileName: null,
        spotifyError: null,
      };
    case 'error-changed':
      return state.spotifyError === action.error
        ? state
        : { ...state, spotifyError: action.error };
  }
}

function Screw({ className = '' }: { className?: string }) {
  return <span aria-hidden="true" className={`screw ${className}`} />;
}

function AlbumArt({
  tape,
  compact = false,
}: {
  tape: Tape;
  compact?: boolean;
}) {
  return (
    <div
      className={`album-art ${tape.coverClass} ${compact ? 'is-compact' : ''}`}
    >
      {tape.artworkUrl ? (
        <img className="album-art__image" src={tape.artworkUrl} alt="" />
      ) : (
        <>
          <span className="album-art__sun" />
          <span className="album-art__line line-one" />
          <span className="album-art__line line-two" />
          <span className="album-art__title">{tape.title}</span>
          <span className="album-art__artist">{tape.artist}</span>
        </>
      )}
    </div>
  );
}

function Cassette({
  tape,
  playing,
  motion,
  ejected,
}: {
  tape: Tape;
  playing: boolean;
  motion: MotionDirection;
  ejected: boolean;
}) {
  const cassetteStyle = {
    '--tape-accent': tape.accent,
    '--tape-ink': tape.ink,
  } as CSSProperties;

  const spinning = playing || motion !== null;

  return (
    <div
      className={`cassette ${spinning ? 'is-spinning' : ''} ${motion ? `is-${motion}` : ''} ${ejected ? 'is-ejected' : ''}`}
      style={cassetteStyle}
      aria-label={`Casete ${tape.title} de ${tape.artist}`}
    >
      <div className="cassette__shell">
        <Screw className="cassette__screw cassette__screw--tl" />
        <Screw className="cassette__screw cassette__screw--tr" />
        <Screw className="cassette__screw cassette__screw--bl" />
        <Screw className="cassette__screw cassette__screw--br" />

        <div className="cassette__label">
          <div className="cassette__label-top">
            <span>STEREO</span>
            <strong>{tape.title}</strong>
            <span>{tape.year}</span>
          </div>
          <div className="cassette__rule" />
          <div className="cassette__window">
            <div className="reel reel--left">
              <i />
            </div>
            <div className="cassette__tape-window">
              <span className="tape-roll tape-roll--left" />
              <span className="tape-line" />
              <span className="tape-roll tape-roll--right" />
            </div>
            <div className="reel reel--right">
              <i />
            </div>
          </div>
          <div className="cassette__track-label">
            <span>NOISE REDUCTION</span>
            <b>{tape.artist}</b>
            <span>60 μs EQ</span>
          </div>
        </div>
        <div className="cassette__bottom">
          <span className="cassette__side">{tape.side}</span>
          <div className="cassette__slots">
            <i />
            <i />
            <i />
          </div>
          <span className="cassette__type">TYPE II · CrO₂</span>
        </div>
      </div>
    </div>
  );
}

function TransportButton({
  label,
  active = false,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      className={`transport-button ${active ? 'is-active' : ''}`}
      onClick={onClick}
      aria-label={label}
      title={label}
      type="button"
    >
      {children}
    </button>
  );
}

function ProviderModal({
  error,
  libraryStatus,
  onConnect,
  onClose,
  onDisconnect,
  playerStatus,
  profileName,
  sessionStatus,
}: {
  error: string | null;
  libraryStatus: SpotifyLibraryStatus;
  onConnect: () => void;
  onClose: () => void;
  onDisconnect: () => void;
  playerStatus: string;
  profileName: string | null;
  sessionStatus: SpotifySessionStatus;
}) {
  const connected = sessionStatus === 'connected';
  const busy = sessionStatus === 'checking';
  const unconfigured = sessionStatus === 'unconfigured';
  const detail = connected
    ? playerStatus === 'ready'
      ? `${profileName ?? 'Cuenta Premium'} · reproductor listo`
      : libraryStatus === 'loading'
        ? 'Sincronizando álbumes guardados'
        : 'Preparando el reproductor del navegador'
    : unconfigured
      ? 'Faltan variables en .env.local'
      : busy
        ? 'Comprobando la sesión guardada'
        : 'Cuenta Premium requerida';

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <dialog
        open
        className="provider-modal"
        aria-labelledby="provider-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button
          className="modal-close"
          onClick={onClose}
          aria-label="Cerrar"
          type="button"
        >
          <X size={18} />
        </button>
        <span className="eyebrow">SOURCE / AUX</span>
        <h2 id="provider-title">
          {unconfigured ? 'Configura Spotify' : 'Conecta tu estantería'}
        </h2>
        <p>
          Tus álbumes guardados se convierten en casetes y Spotify reproduce el
          audio directamente en este navegador.
        </p>
        <button
          className={`provider-option ${connected ? 'is-connected' : ''}`}
          onClick={connected ? onDisconnect : onConnect}
          disabled={busy || unconfigured}
          type="button"
        >
          <span className="spotify-mark" aria-hidden="true">
            ≋
          </span>
          <span>
            <strong>
              {connected
                ? 'Spotify conectado'
                : busy
                  ? 'Comprobando Spotify'
                  : 'Continuar con Spotify'}
            </strong>
            <small>
              {connected ? `${detail} · pulsa para desconectar` : detail}
            </small>
          </span>
          {connected ? (
            <span className="connected-check">✓</span>
          ) : (
            <ChevronRight size={20} />
          )}
        </button>
        <div className={`provider-note ${error ? 'is-error' : ''}`}>
          <Radio size={16} />
          <span>
            {error ??
              (unconfigured
                ? 'Añade VITE_SPOTIFY_CLIENT_ID y VITE_SPOTIFY_REDIRECT_URI.'
                : 'Spotify Premium es obligatorio para reproducir en el navegador.')}
          </span>
        </div>
      </dialog>
    </div>
  );
}

function App() {
  const [playerState, dispatch] = useReducer(playerReducer, initialPlayerState);
  const spotifyConfigured = getSpotifyConfig() !== null;
  const [spotifyState, spotifyDispatch] = useReducer(
    spotifyReducer,
    spotifyConfigured,
    createInitialSpotifyState,
  );
  const {
    sessionStatus,
    accessToken,
    spotifyTapes,
    libraryStatus,
    profileName,
    spotifyError,
  } = spotifyState;
  const [modalOpen, setModalOpen] = useState(false);
  const [favorite, setFavorite] = useState(false);
  const [dolby, setDolby] = useState(true);
  const [volume, setVolume] = useState(72);
  const motionTimer = useRef<number | null>(null);
  const playbackController = useRef<AbortController | null>(null);
  const requestedTrackUri = useRef<string | null>(null);
  const ignoredTrackUri = useRef<string | null>(null);
  const connected = sessionStatus === 'connected' && accessToken !== null;
  const spotifyPlayer = useSpotifyPlayer(connected, handleSpotifyTrackChange);
  const shuffle = spotifyPlayer.shuffle;

  const { tapeIndex, trackIndex, motion, ejected } = playerState;
  const library = connected ? spotifyTapes : demoTapes;
  const visibleLibraryStatus =
    libraryStatus === 'loading' && spotifyTapes.length > 0
      ? 'ready'
      : libraryStatus;
  const tape = library[tapeIndex] ?? demoTapes[0];
  const track = tape.tracks[trackIndex] ?? tape.tracks[0];
  const playableTape =
    connected && tape.source === 'spotify' && library[tapeIndex] === tape;
  const currentTrackMatches =
    playableTape && spotifyPlayer.currentTrack?.uri === track.spotifyUri;
  const isPlaying = currentTrackMatches && spotifyPlayer.isPlaying && !ejected;
  const currentTime = currentTrackMatches ? spotifyPlayer.position : 0;
  const duration =
    currentTrackMatches && spotifyPlayer.duration > 0
      ? spotifyPlayer.duration
      : track.duration;
  const progress = getProgress(currentTime, duration);
  const remaining = `-${formatTime(duration - currentTime)}`;

  useEffect(() => {
    if (!spotifyConfigured) return;
    let cancelled = false;

    void initializeSpotifySession()
      .then((token) => {
        if (cancelled) return;
        spotifyDispatch({ type: 'session-initialized', accessToken: token });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        spotifyDispatch({
          type: 'session-failed',
          sessionStatus: 'error',
          error:
            error instanceof Error
              ? error.message
              : 'Spotify rechazó la sesión.',
        });
      });

    return () => {
      cancelled = true;
    };
  }, [spotifyConfigured]);

  useEffect(() => {
    if (!connected) return;
    const controller = new AbortController();

    void Promise.all([
      getSpotifySavedAlbums(controller.signal),
      getSpotifyProfile(controller.signal),
    ])
      .then(([albums, profile]) => {
        spotifyDispatch({
          type: 'library-loaded',
          spotifyTapes: albums,
          profileName: profile.display_name ?? profile.id,
        });
        dispatch({ type: 'select-tape', tapeIndex: 0 });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        spotifyDispatch({
          type: 'library-failed',
          error:
            error instanceof Error
              ? error.message
              : 'No se pudo cargar tu biblioteca.',
        });
      });

    return () => controller.abort();
  }, [connected]);

  useEffect(() => {
    return () => {
      clearMotionTimer();
      cancelPlaybackOperation();
    };
  }, []);

  function handleSpotifyTrackChange(
    currentTrack: SpotifyPlaybackTrack,
    playing: boolean,
  ) {
    if (ignoredTrackUri.current === currentTrack.uri) {
      ignoredTrackUri.current = null;
      if (playing) void spotifyPlayer.pause();
      return;
    }
    if (requestedTrackUri.current === currentTrack.uri) {
      requestedTrackUri.current = null;
    }
    if (!playing) return;
    for (const [nextTapeIndex, item] of spotifyTapes.entries()) {
      const nextTrackIndex = item.tracks.findIndex(
        (candidate) => candidate.spotifyUri === currentTrack.uri,
      );
      if (nextTrackIndex >= 0) {
        dispatch({
          type: 'sync-track',
          tapeIndex: nextTapeIndex,
          trackIndex: nextTrackIndex,
        });
        return;
      }
    }
  }

  function clearMotionTimer() {
    if (!motionTimer.current) return;
    window.clearTimeout(motionTimer.current);
    motionTimer.current = null;
  }

  function cancelPlaybackOperation() {
    playbackController.current?.abort();
    playbackController.current = null;
    if (requestedTrackUri.current) {
      ignoredTrackUri.current = requestedTrackUri.current;
      requestedTrackUri.current = null;
    }
  }

  function beginPlaybackOperation() {
    cancelPlaybackOperation();
    ignoredTrackUri.current = null;
    const controller = new AbortController();
    playbackController.current = controller;
    return controller;
  }

  function isCurrentPlaybackOperation(controller: AbortController) {
    return (
      playbackController.current === controller && !controller.signal.aborted
    );
  }

  function finishPlaybackOperation(controller: AbortController) {
    if (playbackController.current === controller) {
      playbackController.current = null;
    }
  }

  function showSpotifyConnection(message?: string) {
    if (message) spotifyDispatch({ type: 'error-changed', error: message });
    setModalOpen(true);
  }

  async function connect() {
    spotifyDispatch({ type: 'login-started' });
    try {
      await beginSpotifyLogin();
    } catch (error) {
      spotifyDispatch({
        type: 'session-failed',
        sessionStatus: spotifyConfigured ? 'error' : 'unconfigured',
        error:
          error instanceof Error ? error.message : 'No se pudo abrir Spotify.',
      });
    }
  }

  function disconnect() {
    clearMotionTimer();
    cancelPlaybackOperation();
    void spotifyPlayer.pause();
    disconnectSpotify();
    spotifyDispatch({
      type: 'disconnected',
      sessionStatus: spotifyConfigured ? 'disconnected' : 'unconfigured',
    });
    dispatch({ type: 'select-tape', tapeIndex: 0 });
  }

  async function startTrack(
    nextTape: Tape,
    nextTrackIndex: number,
    controller: AbortController,
  ) {
    const nextTrack = nextTape.tracks[nextTrackIndex];
    if (
      spotifyPlayer.status !== 'ready' ||
      !spotifyPlayer.deviceId ||
      !nextTape.spotifyUri ||
      !nextTrack?.spotifyUri
    ) {
      if (isCurrentPlaybackOperation(controller)) {
        showSpotifyConnection(
          'El reproductor de Spotify todavía no está listo.',
        );
        finishPlaybackOperation(controller);
      }
      return;
    }

    try {
      spotifyDispatch({ type: 'error-changed', error: null });
      requestedTrackUri.current = nextTrack.spotifyUri;
      await playSpotifyTrack(
        spotifyPlayer.deviceId,
        nextTape.spotifyUri,
        nextTrack.spotifyUri,
        controller.signal,
      );
    } catch (error) {
      if (controller.signal.aborted) return;
      requestedTrackUri.current = null;
      showSpotifyConnection(
        error instanceof Error ? error.message : 'No se pudo iniciar la pista.',
      );
    } finally {
      finishPlaybackOperation(controller);
    }
  }

  async function togglePlayback() {
    if (ejected) return;
    if (!playableTape) {
      showSpotifyConnection();
      return;
    }
    if (spotifyPlayer.status !== 'ready') {
      showSpotifyConnection('El reproductor de Spotify todavía no está listo.');
      return;
    }

    const controller = beginPlaybackOperation();
    try {
      spotifyDispatch({ type: 'error-changed', error: null });
      await spotifyPlayer.activate();
      if (!isCurrentPlaybackOperation(controller)) return;
      if (!currentTrackMatches) {
        await startTrack(tape, trackIndex, controller);
      } else if (spotifyPlayer.isPlaying) {
        await spotifyPlayer.pause();
      } else {
        await spotifyPlayer.resume();
      }
    } catch (error) {
      if (controller.signal.aborted) return;
      showSpotifyConnection(
        error instanceof Error ? error.message : 'Spotify no pudo reproducir.',
      );
    } finally {
      finishPlaybackOperation(controller);
    }
  }

  function cue(direction: 1 | -1) {
    if (ejected || motion) return;
    if (!playableTape || spotifyPlayer.status !== 'ready') {
      showSpotifyConnection();
      return;
    }

    const controller = beginPlaybackOperation();
    void spotifyPlayer.activate().catch((error: unknown) => {
      if (!isCurrentPlaybackOperation(controller)) return;
      clearMotionTimer();
      dispatch({ type: 'cue-cancel' });
      cancelPlaybackOperation();
      showSpotifyConnection(
        error instanceof Error ? error.message : 'Spotify no pudo reproducir.',
      );
    });
    const nextTrackIndex = getNextIndex(
      trackIndex,
      tape.tracks.length,
      direction,
    );
    dispatch({ type: 'cue-start', direction });
    motionTimer.current = window.setTimeout(() => {
      if (!isCurrentPlaybackOperation(controller)) return;
      dispatch({
        type: 'cue-complete',
        direction,
        trackCount: tape.tracks.length,
      });
      motionTimer.current = null;
      void startTrack(tape, nextTrackIndex, controller);
    }, 720);
  }

  function selectTape(index: number) {
    clearMotionTimer();
    cancelPlaybackOperation();
    if (connected) void spotifyPlayer.pause();
    dispatch({ type: 'select-tape', tapeIndex: index });
    setFavorite(false);
  }

  function toggleEject() {
    clearMotionTimer();
    cancelPlaybackOperation();
    if (!ejected && connected) void spotifyPlayer.pause();
    dispatch({ type: 'toggle-eject' });
  }

  function seek(time: number) {
    if (!currentTrackMatches || ejected) return;
    void spotifyPlayer.seek(time);
  }

  function changeVolume(nextVolume: number) {
    setVolume(nextVolume);
    if (connected) void spotifyPlayer.setVolume(nextVolume / 100);
  }

  async function toggleShuffle() {
    if (!spotifyPlayer.deviceId || spotifyPlayer.status !== 'ready') {
      showSpotifyConnection();
      return;
    }
    const nextShuffle = !spotifyPlayer.shuffle;
    try {
      await setSpotifyShuffle(spotifyPlayer.deviceId, nextShuffle);
    } catch (error) {
      showSpotifyConnection(
        error instanceof Error
          ? error.message
          : 'No se pudo cambiar la mezcla.',
      );
    }
  }

  const providerError =
    spotifyError ??
    spotifyPlayer.error ??
    (spotifyPlayer.autoplayBlocked
      ? 'El navegador bloqueó el inicio automático. Pulsa PLAY de nuevo.'
      : null);

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Cassette Player, inicio">
          <span className="brand__mark">
            <Rewind size={18} strokeWidth={2.4} />
          </span>
          <span>
            CASSETTE <b>PLAYER</b>
          </span>
        </a>
        <div className="topbar__middle" aria-hidden="true">
          PLAYBACK DEPT. / UNIT 04
        </div>
        <nav className="topbar__actions" aria-label="Acciones principales">
          <button
            className="text-button"
            type="button"
            onClick={() => setModalOpen(true)}
          >
            <Link2 size={15} />{' '}
            {connected
              ? spotifyPlayer.status === 'ready'
                ? 'SPOTIFY ACTIVO'
                : 'PREPARANDO SPOTIFY'
              : sessionStatus === 'checking'
                ? 'COMPROBANDO FUENTE'
                : 'CONECTAR FUENTE'}
          </button>
          <button className="icon-button" aria-label="Ayuda" type="button">
            <CircleHelp size={17} />
          </button>
        </nav>
      </header>

      <section className="hero" id="top">
        <div className="hero__intro">
          <span className="eyebrow">NOW IN THE DECK</span>
          <h1>
            La música se hizo
            <br />
            para <em>tocarla.</em>
          </h1>
          <p>
            Una colección digital con alma analógica. Elige un casete, baja PLAY
            y deja que giren los carretes.
          </p>
        </div>

        <div className="status-card">
          <span className={`status-led ${isPlaying ? 'is-on' : ''}`} />
          <div>
            <small>
              {ejected
                ? 'DECK OPEN'
                : connected && visibleLibraryStatus === 'loading'
                  ? 'SYNCING LIBRARY'
                  : connected && visibleLibraryStatus === 'error'
                    ? 'SOURCE ERROR'
                    : isPlaying
                      ? 'TAPE RUNNING'
                      : connected
                        ? 'TAPE READY'
                        : 'DEMO READY'}
            </small>
            <strong>
              {ejected
                ? 'Elige un casete'
                : connected && visibleLibraryStatus === 'loading'
                  ? 'Cargando álbumes'
                  : connected && library.length === 0
                    ? 'Sin álbumes guardados'
                    : `${tape.side} / ${trackIndex + 1}`}
            </strong>
          </div>
          <span className="status-card__number">
            {String(tapeIndex + 1).padStart(2, '0')}
          </span>
        </div>
      </section>

      <section className="player-area" aria-label="Reproductor de casete">
        <div className="deck-shadow" />
        <div className="deck">
          <Screw className="deck__screw deck__screw--tl" />
          <Screw className="deck__screw deck__screw--tr" />
          <Screw className="deck__screw deck__screw--bl" />
          <Screw className="deck__screw deck__screw--br" />

          <div className="deck__topline">
            <div>
              <b>RR–420</b>
              <span>STEREO CASSETTE DECK</span>
            </div>
            <div className="deck__topline-right">
              <span>AUTO REVERSE</span>
              <i>∞</i>
            </div>
          </div>

          <div className="deck__face">
            <div className="deck__left-controls">
              <button
                type="button"
                className={`square-control ${dolby ? 'is-pressed' : ''}`}
                onClick={() => setDolby((value) => !value)}
                aria-pressed={dolby}
              >
                <Settings2 size={16} />
                <span>DOLBY NR</span>
              </button>
              <div className="level-meter" aria-label="Nivel de señal">
                <span>L</span>
                <div className="level-meter__track">
                  {Array.from({ length: 10 }, (_, index) => (
                    <i
                      key={index}
                      className={isPlaying && index < 7 ? 'is-lit' : ''}
                    />
                  ))}
                </div>
                <span>R</span>
                <div className="level-meter__track">
                  {Array.from({ length: 10 }, (_, index) => (
                    <i
                      key={index}
                      className={isPlaying && index < 5 ? 'is-lit' : ''}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className={`tape-bay ${ejected ? 'is-open' : ''}`}>
              <div className="tape-bay__inside">
                <span>INSERT TAPE</span>
                <div className="bay-spindles">
                  <i />
                  <i />
                </div>
              </div>
              <Cassette
                tape={tape}
                playing={isPlaying}
                motion={motion}
                ejected={ejected}
              />
              <div className="tape-bay__glass" />
            </div>

            <div className="deck__right-controls">
              <span className="counter-label">TAPE COUNTER</span>
              <div className="counter-display">
                <span>{formatTime(currentTime)}</span>
                <small>{remaining}</small>
              </div>
              <label className="volume-control">
                <span>
                  <Volume2 size={14} /> OUTPUT
                </span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={volume}
                  onChange={(event) => changeVolume(Number(event.target.value))}
                  style={{ '--range-progress': `${volume}%` } as CSSProperties}
                />
              </label>
            </div>
          </div>

          <div className="progress-wrap">
            <div className="progress-meta">
              <span>
                {String(trackIndex + 1).padStart(2, '0')} — {track.title}
              </span>
              <span>{formatTime(duration)}</span>
            </div>
            <input
              className="progress-input"
              type="range"
              min="0"
              max={duration}
              value={currentTime}
              onChange={(event) => seek(Number(event.target.value))}
              style={{ '--range-progress': `${progress}%` } as CSSProperties}
              aria-label="Posición de reproducción"
              disabled={ejected || !currentTrackMatches}
            />
          </div>

          <div className="transport-row">
            <div className="transport-labels" aria-hidden="true">
              <span>POWER</span>
              <span>REW</span>
              <span>PLAY</span>
              <span>F.FWD</span>
              <span>EJECT</span>
            </div>
            <button
              className="power-button"
              aria-label="Encendido"
              type="button"
            >
              <span />
            </button>
            <TransportButton
              label="Pista anterior, rebobinar"
              onClick={() => cue(-1)}
            >
              <Rewind size={22} fill="currentColor" />
            </TransportButton>
            <TransportButton
              label={isPlaying ? 'Pausar' : 'Reproducir'}
              active={isPlaying}
              onClick={() => void togglePlayback()}
            >
              {isPlaying ? (
                <Pause size={23} fill="currentColor" />
              ) : (
                <Play size={23} fill="currentColor" />
              )}
            </TransportButton>
            <TransportButton
              label="Pista siguiente, avance rápido"
              onClick={() => cue(1)}
            >
              <FastForward size={22} fill="currentColor" />
            </TransportButton>
            <TransportButton
              label={ejected ? 'Cerrar casetera' : 'Expulsar casete'}
              onClick={toggleEject}
            >
              <PanelTopOpen size={22} />
            </TransportButton>
          </div>
        </div>

        <div className="now-playing">
          <div className="now-playing__track">
            <span className="eyebrow">PLAYING NOW</span>
            <h2>{track.title}</h2>
            <p>
              {track.artist} · {tape.title}
            </p>
          </div>
          <div className="now-playing__actions">
            <button
              type="button"
              className={shuffle ? 'is-active' : ''}
              onClick={() => void toggleShuffle()}
              aria-label="Mezclar"
              aria-pressed={shuffle}
            >
              <Shuffle size={18} />
            </button>
            <button
              type="button"
              className={favorite ? 'is-active' : ''}
              onClick={() => setFavorite((value) => !value)}
              aria-label="Favorito"
              aria-pressed={favorite}
            >
              <Heart size={19} fill={favorite ? 'currentColor' : 'none'} />
            </button>
            <button type="button" aria-label="Cola de reproducción">
              <ListMusic size={19} />
            </button>
          </div>
        </div>
      </section>

      <section className="shelf-section" aria-labelledby="shelf-title">
        <div className="section-heading">
          <div>
            <span className="eyebrow">YOUR TAPE SHELF</span>
            <h2 id="shelf-title">Elige qué poner</h2>
          </div>
          <div className="shelf-controls" aria-hidden="true">
            <ChevronLeft size={18} />
            <span>{String(library.length).padStart(2, '0')} CASSETTES</span>
            <ChevronRight size={18} />
          </div>
        </div>

        <div className="tape-grid">
          {connected && visibleLibraryStatus === 'loading' ? (
            <div className="tape-grid__state" role="status">
              <Radio size={22} />
              <strong>Sincronizando tu estantería</strong>
              <span>Buscando los álbumes guardados en Spotify.</span>
            </div>
          ) : connected && visibleLibraryStatus === 'error' ? (
            <div className="tape-grid__state is-error" role="alert">
              <Radio size={22} />
              <strong>No pudimos cargar tus álbumes</strong>
              <span>Abre la conexión para revisar el error.</span>
            </div>
          ) : connected && library.length === 0 ? (
            <div className="tape-grid__state" role="status">
              <Radio size={22} />
              <strong>Tu estantería está vacía</strong>
              <span>Guarda un álbum en Spotify y vuelve a conectar.</span>
            </div>
          ) : (
            library.map((item, index) => (
              <button
                className={`tape-card ${index === tapeIndex && !ejected ? 'is-selected' : ''}`}
                key={item.id}
                onClick={() => selectTape(index)}
                type="button"
                aria-label={`Cargar ${item.title} de ${item.artist}`}
              >
                <div className="tape-card__case">
                  <AlbumArt tape={item} />
                  <div className="tape-card__spine">
                    <span>{item.artist}</span>
                    <b>{item.title}</b>
                    <small>{item.year}</small>
                  </div>
                </div>
                <div className="tape-card__caption">
                  <span>{String(index + 1).padStart(2, '0')}</span>
                  <div>
                    <strong>{item.title}</strong>
                    <small>{item.artist}</small>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </section>

      <section className="provider-strip">
        <div className="provider-strip__icon">
          <Bluetooth size={23} />
        </div>
        <div>
          <span className="eyebrow">DIGITAL SOURCE / ANALOG SOUL</span>
          <h2>
            {connected && visibleLibraryStatus === 'loading'
              ? 'Rebobinando tu biblioteca.'
              : connected && spotifyPlayer.status === 'ready'
                ? 'Tu biblioteca está lista.'
                : connected
                  ? 'Preparando el reproductor.'
                  : 'Tus álbumes también caben aquí.'}
          </h2>
        </div>
        <button type="button" onClick={() => setModalOpen(true)}>
          {connected ? 'GESTIONAR CONEXIÓN' : 'CONECTAR SPOTIFY'}{' '}
          <ChevronRight size={17} />
        </button>
      </section>

      <footer>
        <span>© 2026 CASSETTE PLAYER AUDIO CLUB</span>
        <span>MADE WITH TAPE HISS &amp; PATIENCE</span>
        <span>PARAMARIBO · 05°N</span>
      </footer>

      {modalOpen && (
        <ProviderModal
          error={providerError}
          libraryStatus={visibleLibraryStatus}
          onConnect={() => void connect()}
          onClose={() => setModalOpen(false)}
          onDisconnect={disconnect}
          playerStatus={spotifyPlayer.status}
          profileName={profileName}
          sessionStatus={sessionStatus}
        />
      )}
    </main>
  );
}

export default App;
