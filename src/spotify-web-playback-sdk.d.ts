export {};

declare global {
  interface Window {
    Spotify?: Spotify.Spotify;
    onSpotifyWebPlaybackSDKReady?: () => void;
  }

  namespace Spotify {
    type PlayerInit = {
      getOAuthToken: (callback: (token: string) => void) => void;
      name: string;
      volume?: number;
    };

    type WebPlaybackError = {
      message: string;
    };

    type WebPlaybackArtist = {
      name: string;
    };

    type WebPlaybackTrack = {
      album: {
        images: { url: string }[];
        name: string;
      };
      artists: WebPlaybackArtist[];
      name: string;
      uri: string;
    };

    type WebPlaybackState = {
      duration: number;
      paused: boolean;
      position: number;
      shuffle: boolean;
      track_window: {
        current_track: WebPlaybackTrack;
      };
    };

    class Player {
      constructor(options: PlayerInit);
      activateElement(): Promise<void>;
      addListener(
        event: 'ready' | 'not_ready',
        callback: (value: { device_id: string }) => void,
      ): boolean;
      addListener(
        event: 'player_state_changed',
        callback: (state: WebPlaybackState | null) => void,
      ): boolean;
      addListener(event: 'autoplay_failed', callback: () => void): boolean;
      addListener(
        event:
          | 'initialization_error'
          | 'authentication_error'
          | 'account_error'
          | 'playback_error',
        callback: (error: WebPlaybackError) => void,
      ): boolean;
      connect(): Promise<boolean>;
      disconnect(): void;
      getCurrentState(): Promise<WebPlaybackState | null>;
      pause(): Promise<void>;
      removeListener(event: string): boolean;
      resume(): Promise<void>;
      seek(positionMs: number): Promise<void>;
      setVolume(volume: number): Promise<void>;
    }

    type Spotify = {
      Player: typeof Player;
    };
  }
}
