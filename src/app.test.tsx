import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './app';
import type { Tape } from './types';

const spotifyMocks = vi.hoisted(() => ({
  activate: vi.fn().mockResolvedValue(undefined),
  beginLogin: vi.fn().mockResolvedValue(undefined),
  disconnect: vi.fn(),
  getConfig: vi.fn(),
  getProfile: vi.fn(),
  getSavedAlbums: vi.fn(),
  initializeSession: vi.fn(),
  pause: vi.fn().mockResolvedValue(undefined),
  playTrack: vi.fn().mockResolvedValue(undefined),
  resume: vi.fn().mockResolvedValue(undefined),
  seek: vi.fn().mockResolvedValue(undefined),
  setShuffle: vi.fn().mockResolvedValue(undefined),
  setVolume: vi.fn().mockResolvedValue(undefined),
  usePlayer: vi.fn(),
}));

vi.mock('./lib/spotify-auth', () => ({
  beginSpotifyLogin: spotifyMocks.beginLogin,
  disconnectSpotify: spotifyMocks.disconnect,
  getSpotifyConfig: spotifyMocks.getConfig,
  initializeSpotifySession: spotifyMocks.initializeSession,
}));

vi.mock('./lib/spotify-api', () => ({
  getSpotifyProfile: spotifyMocks.getProfile,
  getSpotifySavedAlbums: spotifyMocks.getSavedAlbums,
  playSpotifyTrack: spotifyMocks.playTrack,
  setSpotifyShuffle: spotifyMocks.setShuffle,
}));

vi.mock('./lib/use-spotify-player', () => ({
  useSpotifyPlayer: spotifyMocks.usePlayer,
}));

const spotifyTape: Tape = {
  id: 'spotify-sessions',
  title: 'Spotify Sessions',
  artist: 'Mira Sol',
  year: '1991',
  side: 'A',
  label: 'Spotify',
  accent: '#2e7a73',
  ink: '#182b29',
  coverClass: 'cover-spotify',
  source: 'spotify',
  spotifyUri: 'spotify:album:spotify-sessions',
  tracks: [
    {
      id: 'open-water',
      title: 'Open Water',
      artist: 'Mira Sol',
      duration: 236,
      spotifyUri: 'spotify:track:open-water',
    },
    {
      id: 'slow-motion',
      title: 'In Slow Motion',
      artist: 'Mira Sol',
      duration: 214,
      spotifyUri: 'spotify:track:slow-motion',
    },
  ],
};

describe('cassette player', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    spotifyMocks.activate.mockResolvedValue(undefined);
    spotifyMocks.pause.mockResolvedValue(undefined);
    spotifyMocks.playTrack.mockResolvedValue(undefined);
    spotifyMocks.resume.mockResolvedValue(undefined);
    spotifyMocks.seek.mockResolvedValue(undefined);
    spotifyMocks.setShuffle.mockResolvedValue(undefined);
    spotifyMocks.setVolume.mockResolvedValue(undefined);
    spotifyMocks.getConfig.mockReturnValue(null);
    spotifyMocks.initializeSession.mockResolvedValue(null);
    spotifyMocks.getSavedAlbums.mockResolvedValue([]);
    spotifyMocks.getProfile.mockResolvedValue({
      display_name: 'Mira',
      id: 'mira',
    });
    spotifyMocks.usePlayer.mockReturnValue({
      activate: spotifyMocks.activate,
      autoplayBlocked: false,
      currentTrack: null,
      deviceId: 'browser-device',
      duration: 0,
      error: null,
      isPlaying: false,
      pause: spotifyMocks.pause,
      position: 0,
      resume: spotifyMocks.resume,
      seek: spotifyMocks.seek,
      setVolume: spotifyMocks.setVolume,
      shuffle: false,
      status: 'ready',
    });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('opens Spotify configuration instead of simulating playback', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: 'Reproducir' }));

    expect(
      screen.getByRole('dialog', { name: 'Configura Spotify' }),
    ).toBeVisible();
    expect(screen.getByText(/VITE_SPOTIFY_CLIENT_ID/)).toBeInTheDocument();
  });

  it('loads saved albums and sends playback to the browser device', async () => {
    spotifyMocks.getConfig.mockReturnValue({
      clientId: 'client-id',
      redirectUri: 'http://127.0.0.1:5173/',
    });
    spotifyMocks.initializeSession.mockResolvedValue('access-token');
    spotifyMocks.getSavedAlbums.mockResolvedValue([spotifyTape]);
    const user = userEvent.setup();
    render(<App />);

    await screen.findByRole('button', {
      name: 'Cargar Spotify Sessions de Mira Sol',
    });
    expect(spotifyMocks.initializeSession).toHaveBeenCalledTimes(1);
    expect(spotifyMocks.getSavedAlbums).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'Reproducir' }));

    expect(spotifyMocks.activate).toHaveBeenCalledOnce();
    expect(spotifyMocks.playTrack).toHaveBeenCalledWith(
      'browser-device',
      'spotify:album:spotify-sessions',
      'spotify:track:open-water',
      expect.any(AbortSignal),
    );
  });

  it('preserves the 720 ms cassette cue before starting the next track', async () => {
    spotifyMocks.getConfig.mockReturnValue({
      clientId: 'client-id',
      redirectUri: 'http://127.0.0.1:5173/',
    });
    spotifyMocks.initializeSession.mockResolvedValue('access-token');
    spotifyMocks.getSavedAlbums.mockResolvedValue([spotifyTape]);
    render(<App />);

    await screen.findByRole('button', {
      name: 'Cargar Spotify Sessions de Mira Sol',
    });
    vi.useFakeTimers();
    fireEvent.click(
      screen.getByRole('button', { name: 'Pista siguiente, avance rápido' }),
    );
    expect(screen.getByRole('heading', { name: 'Open Water' })).toBeVisible();

    act(() => vi.advanceTimersByTime(720));

    expect(
      screen.getByRole('heading', { name: 'In Slow Motion' }),
    ).toBeVisible();
    expect(spotifyMocks.playTrack).toHaveBeenCalledWith(
      'browser-device',
      'spotify:album:spotify-sessions',
      'spotify:track:slow-motion',
      expect.any(AbortSignal),
    );
  });

  it('does not start a track after playback is cancelled', async () => {
    spotifyMocks.getConfig.mockReturnValue({
      clientId: 'client-id',
      redirectUri: 'http://127.0.0.1:5173/',
    });
    spotifyMocks.initializeSession.mockResolvedValue('access-token');
    spotifyMocks.getSavedAlbums.mockResolvedValue([spotifyTape]);
    let finishActivation!: () => void;
    spotifyMocks.activate.mockReturnValue(
      new Promise<void>((resolve) => {
        finishActivation = resolve;
      }),
    );
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole('button', {
      name: 'Cargar Spotify Sessions de Mira Sol',
    });

    await user.click(screen.getByRole('button', { name: 'Reproducir' }));
    await user.click(screen.getByRole('button', { name: 'Expulsar casete' }));
    finishActivation();

    await waitFor(() => expect(spotifyMocks.activate).toHaveBeenCalledOnce());
    expect(spotifyMocks.playTrack).not.toHaveBeenCalled();
  });

  it('aborts an in-flight track request when the deck is opened', async () => {
    spotifyMocks.getConfig.mockReturnValue({
      clientId: 'client-id',
      redirectUri: 'http://127.0.0.1:5173/',
    });
    spotifyMocks.initializeSession.mockResolvedValue('access-token');
    spotifyMocks.getSavedAlbums.mockResolvedValue([spotifyTape]);
    let finishPlayback!: () => void;
    spotifyMocks.playTrack.mockReturnValue(
      new Promise<void>((resolve) => {
        finishPlayback = resolve;
      }),
    );
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole('button', {
      name: 'Cargar Spotify Sessions de Mira Sol',
    });

    await user.click(screen.getByRole('button', { name: 'Reproducir' }));
    await waitFor(() => expect(spotifyMocks.playTrack).toHaveBeenCalledOnce());
    const signal = spotifyMocks.playTrack.mock.calls[0][3] as AbortSignal;
    await user.click(screen.getByRole('button', { name: 'Expulsar casete' }));

    expect(signal.aborted).toBe(true);
    finishPlayback();
  });
});
