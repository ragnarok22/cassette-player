import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getSpotifySavedAlbums, playSpotifyTrack } from './spotify-api';

vi.mock('./spotify-auth', () => ({
  getValidSpotifyAccessToken: vi.fn().mockResolvedValue('access-token'),
  refreshSpotifyAccessToken: vi.fn().mockResolvedValue('refreshed-token'),
}));

function savedAlbum(id: string, name: string) {
  return {
    album: {
      artists: [{ name: 'Mira Sol' }],
      id,
      images: [{ url: `https://images.test/${id}.jpg`, width: 640 }],
      name,
      release_date: '1991-05-01',
      tracks: {
        items: [
          {
            artists: [{ name: 'Mira Sol' }],
            duration_ms: 214000,
            id: `${id}-track`,
            name: 'In Slow Motion',
            track_number: 1,
            uri: `spotify:track:${id}-track`,
          },
        ],
        next: null,
      },
      uri: `spotify:album:${id}`,
    },
  };
}

describe('Spotify API', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('maps saved albums to playable cassettes', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            items: [savedAlbum('album-id', 'Soft Focus')],
            next: null,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );

    await expect(getSpotifySavedAlbums()).resolves.toMatchObject([
      {
        artist: 'Mira Sol',
        artworkUrl: 'https://images.test/album-id.jpg',
        source: 'spotify',
        spotifyUri: 'spotify:album:album-id',
        title: 'Soft Focus',
        tracks: [
          {
            duration: 214,
            spotifyUri: 'spotify:track:album-id-track',
            title: 'In Slow Motion',
          },
        ],
      },
    ]);
  });

  it('loads every page of saved albums', async () => {
    const secondPageUrl =
      'https://api.spotify.com/v1/me/albums?limit=50&offset=50';
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          items: [savedAlbum('first-album', 'First Album')],
          next: secondPageUrl,
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          items: [savedAlbum('second-album', 'Second Album')],
          next: null,
        }),
      );
    vi.stubGlobal('fetch', fetchMock);

    const albums = await getSpotifySavedAlbums();

    expect(albums.map((album) => album.title)).toEqual([
      'First Album',
      'Second Album',
    ]);
    expect(fetchMock.mock.calls[1][0]).toBe(secondPageUrl);
  });

  it('starts the selected track directly on the browser device', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);

    await playSpotifyTrack(
      'device-id',
      'spotify:album:album-id',
      'spotify:track:track-id',
    );

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][0]).toContain(
      '/me/player/play?device_id=device-id',
    );
    expect(fetchMock.mock.calls[0][1]?.body).toContain(
      'spotify:track:track-id',
    );
  });
});
