import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSpotifyPlayer } from './use-spotify-player';

const authMocks = vi.hoisted(() => ({
  getToken: vi.fn(),
}));
vi.mock('./spotify-auth', () => ({
  getValidSpotifyAccessToken: authMocks.getToken,
}));

type Listener = (value: unknown) => void;

class MockSpotifyPlayer {
  listeners = new Map<string, Listener>();
  activateElement = vi.fn().mockResolvedValue(undefined);
  connect = vi.fn().mockResolvedValue(true);
  disconnect = vi.fn();
  getCurrentState = vi.fn().mockResolvedValue(null);
  pause = vi.fn().mockResolvedValue(undefined);
  resume = vi.fn().mockResolvedValue(undefined);
  seek = vi.fn().mockResolvedValue(undefined);
  setVolume = vi.fn().mockResolvedValue(undefined);

  addListener(event: string, listener: Listener) {
    this.listeners.set(event, listener);
    return true;
  }

  removeListener = vi.fn((event: string, listener?: Listener) => {
    if (listener && this.listeners.get(event) !== listener) return false;
    return this.listeners.delete(event);
  });

  emit(event: string, value: unknown) {
    this.listeners.get(event)?.(value);
  }
}

let player: MockSpotifyPlayer;
let playerOptions: Spotify.PlayerInit;

describe('Spotify Web Playback SDK adapter', () => {
  beforeEach(() => {
    authMocks.getToken.mockReset().mockResolvedValue('access-token');
    player = new MockSpotifyPlayer();
    const Player = vi.fn(function MockPlayerConstructor(
      options: Spotify.PlayerInit,
    ) {
      playerOptions = options;
      return player;
    });
    window.Spotify = {
      Player,
    } as unknown as Spotify.Spotify;
  });

  afterEach(() => {
    cleanup();
    Object.defineProperty(window, 'Spotify', {
      configurable: true,
      value: undefined,
      writable: true,
    });
  });

  it('maps SDK events and disconnects during cleanup', async () => {
    const onTrackChange = vi.fn();
    const { result, unmount } = renderHook(() =>
      useSpotifyPlayer(true, onTrackChange),
    );

    await waitFor(() => expect(player.connect).toHaveBeenCalledOnce());
    act(() => player.emit('ready', { device_id: 'browser-device' }));
    expect(result.current.status).toBe('ready');
    expect(result.current.deviceId).toBe('browser-device');

    act(() =>
      player.emit('player_state_changed', {
        duration: 214000,
        paused: false,
        position: 42000,
        shuffle: true,
        track_window: {
          current_track: {
            album: { images: [], name: 'Soft Focus' },
            artists: [{ name: 'Mira Sol' }],
            name: 'In Slow Motion',
            uri: 'spotify:track:slow-motion',
          },
        },
      }),
    );

    expect(result.current).toMatchObject({
      duration: 214,
      isPlaying: true,
      position: 42,
      shuffle: true,
    });
    expect(onTrackChange).toHaveBeenCalledWith(
      expect.objectContaining({ uri: 'spotify:track:slow-motion' }),
      true,
    );

    const registeredListeners = [...player.listeners];
    unmount();
    for (const [event, listener] of registeredListeners) {
      expect(player.removeListener).toHaveBeenCalledWith(event, listener);
    }
    expect(player.disconnect).toHaveBeenCalledOnce();
  });

  it('reports a connection failure instead of remaining loading', async () => {
    player.connect.mockResolvedValue(false);

    const { result } = renderHook(() => useSpotifyPlayer(true));

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toMatch(/conectar/i);
  });

  it('settles the SDK token callback and reports refresh failures', async () => {
    authMocks.getToken.mockRejectedValueOnce(new Error('Refresh failed'));
    const { result } = renderHook(() => useSpotifyPlayer(true));
    await waitFor(() => expect(player.connect).toHaveBeenCalledOnce());
    const callback = vi.fn();

    act(() => playerOptions.getOAuthToken(callback));

    await waitFor(() => expect(callback).toHaveBeenCalledWith(''));
    expect(result.current).toMatchObject({
      error: 'Refresh failed',
      status: 'error',
    });
  });
});
