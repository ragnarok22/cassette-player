import {
  useEffect,
  useMemo,
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
import { tapes } from './data/library';
import { formatTime, getNextIndex, getProgress } from './lib/player';
import type { Tape } from './types';

type MotionDirection = 'forward' | 'backward' | null;

type PlayerState = {
  tapeIndex: number;
  trackIndex: number;
  isPlaying: boolean;
  currentTime: number;
  motion: MotionDirection;
  ejected: boolean;
};

type PlayerAction =
  | { type: 'toggle-play' }
  | { type: 'tick'; duration: number; trackCount: number }
  | { type: 'cue-start'; direction: 1 | -1 }
  | { type: 'cue-complete'; direction: 1 | -1; trackCount: number }
  | { type: 'select-tape'; tapeIndex: number }
  | { type: 'toggle-eject' }
  | { type: 'seek'; time: number };

const initialPlayerState: PlayerState = {
  tapeIndex: 0,
  trackIndex: 0,
  isPlaying: false,
  currentTime: 42,
  motion: null,
  ejected: false,
};

function playerReducer(state: PlayerState, action: PlayerAction): PlayerState {
  switch (action.type) {
    case 'toggle-play':
      return state.ejected ? state : { ...state, isPlaying: !state.isPlaying };
    case 'tick': {
      if (!state.isPlaying || state.ejected || state.motion) return state;
      if (state.currentTime + 1 >= action.duration) {
        return {
          ...state,
          trackIndex: getNextIndex(state.trackIndex, action.trackCount, 1),
          currentTime: 0,
        };
      }
      return { ...state, currentTime: state.currentTime + 1 };
    }
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
        currentTime: 0,
        motion: null,
      };
    case 'select-tape':
      return {
        ...state,
        tapeIndex: action.tapeIndex,
        trackIndex: 0,
        currentTime: 0,
        ejected: false,
      };
    case 'toggle-eject':
      return { ...state, ejected: !state.ejected, isPlaying: false };
    case 'seek':
      return { ...state, currentTime: action.time };
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
      <span className="album-art__sun" />
      <span className="album-art__line line-one" />
      <span className="album-art__line line-two" />
      <span className="album-art__title">{tape.title}</span>
      <span className="album-art__artist">{tape.artist}</span>
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
  connected,
  onConnect,
  onClose,
}: {
  connected: boolean;
  onConnect: () => void;
  onClose: () => void;
}) {
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
        <h2 id="provider-title">Conecta tu estantería</h2>
        <p>
          Trae tus álbumes y playlists. Nosotros ponemos el mecanismo, las
          etiquetas y el delicioso sonido del botón al bajar.
        </p>
        <button
          className={`provider-option ${connected ? 'is-connected' : ''}`}
          onClick={onConnect}
          type="button"
        >
          <span className="spotify-mark" aria-hidden="true">
            ≋
          </span>
          <span>
            <strong>
              {connected ? 'Spotify conectado' : 'Continuar con Spotify'}
            </strong>
            <small>
              {connected
                ? 'Biblioteca sincronizada'
                : 'Álbumes, playlists y favoritos'}
            </small>
          </span>
          {connected ? (
            <span className="connected-check">✓</span>
          ) : (
            <ChevronRight size={20} />
          )}
        </button>
        <div className="provider-note">
          <Radio size={16} />
          <span>
            Modo demostración: no se enviarán datos ni se abrirá OAuth.
          </span>
        </div>
      </dialog>
    </div>
  );
}

function App() {
  const [playerState, dispatch] = useReducer(playerReducer, initialPlayerState);
  const [connected, setConnected] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [favorite, setFavorite] = useState(false);
  const [dolby, setDolby] = useState(true);
  const [shuffle, setShuffle] = useState(false);
  const [volume, setVolume] = useState(72);
  const motionTimer = useRef<number | null>(null);

  const { tapeIndex, trackIndex, isPlaying, currentTime, motion, ejected } =
    playerState;

  const tape = tapes[tapeIndex];
  const track = tape.tracks[trackIndex];
  const progress = getProgress(currentTime, track.duration);

  useEffect(() => {
    if (!isPlaying || ejected || motion) return;

    const interval = window.setInterval(() => {
      dispatch({
        type: 'tick',
        duration: track.duration,
        trackCount: tape.tracks.length,
      });
    }, 1000);

    return () => window.clearInterval(interval);
  }, [ejected, isPlaying, motion, tape.tracks.length, track.duration]);

  useEffect(() => {
    return () => {
      if (motionTimer.current) window.clearTimeout(motionTimer.current);
    };
  }, []);

  const remaining = useMemo(
    () => `-${formatTime(track.duration - currentTime)}`,
    [currentTime, track.duration],
  );

  function cue(direction: 1 | -1) {
    if (ejected || motion) return;
    dispatch({ type: 'cue-start', direction });
    motionTimer.current = window.setTimeout(() => {
      dispatch({
        type: 'cue-complete',
        direction,
        trackCount: tape.tracks.length,
      });
    }, 720);
  }

  function selectTape(index: number) {
    dispatch({ type: 'select-tape', tapeIndex: index });
    setFavorite(false);
  }

  function toggleEject() {
    dispatch({ type: 'toggle-eject' });
  }

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
            {connected ? 'SPOTIFY ACTIVO' : 'CONECTAR FUENTE'}
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
                : isPlaying
                  ? 'TAPE RUNNING'
                  : 'TAPE READY'}
            </small>
            <strong>
              {ejected ? 'Elige un casete' : `${tape.side} / ${trackIndex + 1}`}
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
                  onChange={(event) => setVolume(Number(event.target.value))}
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
              <span>{formatTime(track.duration)}</span>
            </div>
            <input
              className="progress-input"
              type="range"
              min="0"
              max={track.duration}
              value={currentTime}
              onChange={(event) =>
                dispatch({ type: 'seek', time: Number(event.target.value) })
              }
              style={{ '--range-progress': `${progress}%` } as CSSProperties}
              aria-label="Posición de reproducción"
              disabled={ejected}
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
              onClick={() => dispatch({ type: 'toggle-play' })}
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
              onClick={() => setShuffle((value) => !value)}
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
            <span>04 CASSETTES</span>
            <ChevronRight size={18} />
          </div>
        </div>

        <div className="tape-grid">
          {tapes.map((item, index) => (
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
          ))}
        </div>
      </section>

      <section className="provider-strip">
        <div className="provider-strip__icon">
          <Bluetooth size={23} />
        </div>
        <div>
          <span className="eyebrow">DIGITAL SOURCE / ANALOG SOUL</span>
          <h2>
            {connected
              ? 'Tu biblioteca está lista.'
              : 'Tus playlists también caben aquí.'}
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
          connected={connected}
          onConnect={() => setConnected((value) => !value)}
          onClose={() => setModalOpen(false)}
        />
      )}
    </main>
  );
}

export default App;
