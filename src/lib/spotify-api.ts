import type { Tape, Track } from '../types';
import {
  getValidSpotifyAccessToken,
  refreshSpotifyAccessToken,
} from './spotify-auth';

const SPOTIFY_API_URL = 'https://api.spotify.com/v1';

type SpotifyArtist = {
  name: string;
};

type SpotifyTrack = {
  artists: SpotifyArtist[];
  duration_ms: number;
  id: string;
  name: string;
  track_number: number;
  uri: string;
};

type SpotifyPage<T> = {
  items: T[];
  next: string | null;
};

type SpotifyAlbum = {
  artists: SpotifyArtist[];
  copyrights?: { text: string }[];
  id: string;
  images: { url: string; width: number | null }[];
  name: string;
  release_date: string;
  tracks: SpotifyPage<SpotifyTrack>;
  uri: string;
};

type SpotifySavedAlbum = {
  album: SpotifyAlbum;
};

export type SpotifyProfile = {
  display_name: string | null;
  id: string;
};

export class SpotifyApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = 'SpotifyApiError';
  }
}

async function spotifyFetch<T>(
  pathOrUrl: string,
  options: RequestInit = {},
  retryUnauthorized = true,
): Promise<T> {
  const token = await getValidSpotifyAccessToken();
  if (!token) throw new SpotifyApiError('Conecta Spotify para continuar.', 401);

  const response = await fetch(
    pathOrUrl.startsWith('https://')
      ? pathOrUrl
      : `${SPOTIFY_API_URL}${pathOrUrl}`,
    {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        ...options.headers,
      },
    },
  );

  if (response.status === 401 && retryUnauthorized) {
    const refreshedToken = await refreshSpotifyAccessToken();
    if (refreshedToken) {
      return spotifyFetch<T>(pathOrUrl, options, false);
    }
  }

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      error?: { message?: string };
    } | null;
    throw new SpotifyApiError(
      payload?.error?.message ?? `Spotify respondió con ${response.status}.`,
      response.status,
    );
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

function getAlbumColors(id: string) {
  const palettes = [
    ['#df582e', '#272019'],
    ['#db2f39', '#f4e7c7'],
    ['#2e7a73', '#182b29'],
    ['#8e9d52', '#282d1c'],
    ['#d69d34', '#302319'],
    ['#546f9e', '#182238'],
  ] as const;
  const hash = Array.from(id).reduce(
    (value, character) => value + character.charCodeAt(0),
    0,
  );
  return palettes[hash % palettes.length];
}

function mapTrack(track: SpotifyTrack): Track {
  return {
    id: track.id,
    title: track.name,
    artist: track.artists.map((artist) => artist.name).join(', '),
    duration: Math.max(0, Math.round(track.duration_ms / 1000)),
    spotifyUri: track.uri,
  };
}

async function getAllAlbumTracks(
  initialPage: SpotifyPage<SpotifyTrack>,
  signal?: AbortSignal,
) {
  const tracks = [...initialPage.items];
  let next = initialPage.next;

  while (next) {
    const page: SpotifyPage<SpotifyTrack> = await spotifyFetch(next, {
      signal,
    });
    tracks.push(...page.items);
    next = page.next;
  }

  return tracks;
}

async function mapAlbum(
  album: SpotifyAlbum,
  index: number,
  signal?: AbortSignal,
): Promise<Tape> {
  const [accent, ink] = getAlbumColors(album.id);
  const tracks = await getAllAlbumTracks(album.tracks, signal);
  const artwork = [...album.images].sort(
    (left, right) => (right.width ?? 0) - (left.width ?? 0),
  )[0]?.url;

  return {
    id: album.id,
    title: album.name,
    artist: album.artists.map((artist) => artist.name).join(', '),
    year: album.release_date.slice(0, 4),
    side: index % 2 === 0 ? 'A' : 'B',
    label: album.copyrights?.[0]?.text ?? 'Spotify',
    accent,
    ink,
    coverClass: 'cover-spotify',
    artworkUrl: artwork,
    source: 'spotify',
    spotifyUri: album.uri,
    tracks: tracks.map(mapTrack),
  };
}

export async function getSpotifySavedAlbums(signal?: AbortSignal) {
  const savedAlbums: SpotifySavedAlbum[] = [];
  let next: string | null = '/me/albums?limit=50&offset=0';

  while (next) {
    const page: SpotifyPage<SpotifySavedAlbum> = await spotifyFetch(next, {
      signal,
    });
    savedAlbums.push(...page.items);
    next = page.next;
  }

  const albums = await Promise.all(
    savedAlbums.map(({ album }, index) => mapAlbum(album, index, signal)),
  );
  return albums.filter((album) => album.tracks.length > 0);
}

export function getSpotifyProfile(signal?: AbortSignal) {
  return spotifyFetch<SpotifyProfile>('/me', { signal });
}

export async function playSpotifyTrack(
  deviceId: string,
  contextUri: string,
  trackUri: string,
  signal?: AbortSignal,
) {
  await spotifyFetch<void>(
    `/me/player/play?device_id=${encodeURIComponent(deviceId)}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      signal,
      body: JSON.stringify({
        context_uri: contextUri,
        offset: { uri: trackUri },
        position_ms: 0,
      }),
    },
  );
}

export function setSpotifyShuffle(deviceId: string, enabled: boolean) {
  return spotifyFetch<void>(
    `/me/player/shuffle?state=${enabled}&device_id=${encodeURIComponent(deviceId)}`,
    { method: 'PUT' },
  );
}
