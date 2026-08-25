import { beforeEach, describe, expect, it, vi } from 'vitest';

const SESSION_KEY = 'cassette-player.spotify-session.v1';
const VERIFIER_KEY = 'cassette-player.spotify-verifier';
const STATE_KEY = 'cassette-player.spotify-state';

describe('Spotify authentication', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    window.history.replaceState({}, '', '/');
    vi.restoreAllMocks();
    vi.resetModules();
    vi.stubEnv('VITE_SPOTIFY_CLIENT_ID', 'client-id');
    vi.stubEnv('VITE_SPOTIFY_REDIRECT_URI', 'http://127.0.0.1:5173/');
  });

  it('builds a PKCE authorization request with playback scopes', async () => {
    const { createSpotifyAuthorizationUrl } = await import('./spotify-auth');
    const url = new URL(
      await createSpotifyAuthorizationUrl(
        {
          clientId: 'client-id',
          redirectUri: 'http://127.0.0.1:5173/',
        },
        'a'.repeat(96),
        'secure-state',
      ),
    );

    expect(url.origin).toBe('https://accounts.spotify.com');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('code_challenge')).toBeTruthy();
    expect(url.searchParams.get('state')).toBe('secure-state');
    expect(url.searchParams.get('scope')).toContain('streaming');
    expect(url.searchParams.get('scope')).toContain('user-library-read');
  });

  it('validates the callback and stores a renewable session', async () => {
    sessionStorage.setItem(VERIFIER_KEY, 'verifier');
    sessionStorage.setItem(STATE_KEY, 'expected-state');
    window.history.replaceState(
      {},
      '',
      '/?code=authorization-code&state=expected-state',
    );
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: 'access-token',
          expires_in: 3600,
          refresh_token: 'refresh-token',
          scope: 'streaming user-library-read',
          token_type: 'Bearer',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const { initializeSpotifySession } = await import('./spotify-auth');

    await expect(initializeSpotifySession()).resolves.toBe('access-token');
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(window.location.search).toBe('');
    expect(JSON.parse(localStorage.getItem(SESSION_KEY) ?? '{}')).toMatchObject(
      {
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      },
    );
    expect(sessionStorage.getItem(VERIFIER_KEY)).toBeNull();
    expect(sessionStorage.getItem(STATE_KEY)).toBeNull();
  });

  it('does not restore a session when disconnecting during refresh', async () => {
    localStorage.setItem(
      SESSION_KEY,
      JSON.stringify({
        accessToken: 'expired-token',
        expiresAt: 0,
        refreshToken: 'refresh-token',
        scope: 'streaming',
      }),
    );
    let resolveRefresh!: (response: Response) => void;
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            resolveRefresh = resolve;
          }),
      ),
    );
    const { disconnectSpotify, refreshSpotifyAccessToken } =
      await import('./spotify-auth');

    const refresh = refreshSpotifyAccessToken();
    await vi.waitFor(() => expect(resolveRefresh).toBeTypeOf('function'));
    disconnectSpotify();
    resolveRefresh(
      Response.json({
        access_token: 'new-access-token',
        expires_in: 3600,
        refresh_token: 'new-refresh-token',
        scope: 'streaming',
        token_type: 'Bearer',
      }),
    );

    await expect(refresh).resolves.toBeNull();
    expect(localStorage.getItem(SESSION_KEY)).toBeNull();
  });

  it('validates state and cleans storage after an authorization error', async () => {
    sessionStorage.setItem(VERIFIER_KEY, 'verifier');
    sessionStorage.setItem(STATE_KEY, 'expected-state');
    window.history.replaceState(
      {},
      '',
      '/?error=access_denied&state=unexpected-state',
    );
    const { initializeSpotifySession } = await import('./spotify-auth');

    await expect(initializeSpotifySession()).rejects.toThrow(
      'validación de seguridad',
    );
    expect(window.location.search).toBe('');
    expect(sessionStorage.getItem(VERIFIER_KEY)).toBeNull();
    expect(sessionStorage.getItem(STATE_KEY)).toBeNull();
  });

  it('discards a session when Spotify rejects its refresh token', async () => {
    localStorage.setItem(
      SESSION_KEY,
      JSON.stringify({
        accessToken: 'expired-token',
        expiresAt: 0,
        refreshToken: 'invalid-refresh-token',
        scope: 'streaming',
      }),
    );
    let statusChecked = false;
    const response = {
      get ok() {
        statusChecked = true;
        return false;
      },
      json: vi.fn(async () => {
        if (!statusChecked) throw new Error('Body read before status check');
        return {
          error: 'invalid_grant',
          error_description: 'Refresh token revoked',
        };
      }),
    } as unknown as Response;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
    const { refreshSpotifyAccessToken } = await import('./spotify-auth');

    await expect(refreshSpotifyAccessToken()).rejects.toThrow(
      'Refresh token revoked',
    );
    expect(localStorage.getItem(SESSION_KEY)).toBeNull();
  });
});
