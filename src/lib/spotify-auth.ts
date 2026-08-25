const SPOTIFY_AUTH_URL = 'https://accounts.spotify.com/authorize';
const SPOTIFY_TOKEN_URL = 'https://accounts.spotify.com/api/token';
const SESSION_KEY = 'cassette-player.spotify-session.v1';
const VERIFIER_KEY = 'cassette-player.spotify-verifier';
const STATE_KEY = 'cassette-player.spotify-state';
const TOKEN_EXPIRY_BUFFER_MS = 60_000;

export const spotifyScopes = [
  'streaming',
  'user-read-private',
  'user-read-email',
  'user-library-read',
  'user-read-playback-state',
  'user-modify-playback-state',
];

export type SpotifyConfig = {
  clientId: string;
  redirectUri: string;
};

type SpotifyTokenResponse = {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
  token_type: string;
};

type SpotifyTokenError = {
  error?: string;
  error_description?: string;
};

type StoredSpotifySession = {
  accessToken: string;
  expiresAt: number;
  refreshToken: string;
  scope: string;
};

let initializationPromise: Promise<string | null> | null = null;
let refreshPromise: Promise<string | null> | null = null;
let sessionGeneration = 0;

export class SpotifyAuthError extends Error {
  constructor(
    message: string,
    public code?: string,
  ) {
    super(message);
    this.name = 'SpotifyAuthError';
  }
}

function clearStoredSession() {
  sessionGeneration += 1;
  localStorage.removeItem(SESSION_KEY);
}

export function getSpotifyConfig(): SpotifyConfig | null {
  const clientId = import.meta.env.VITE_SPOTIFY_CLIENT_ID?.trim();
  const redirectUri = import.meta.env.VITE_SPOTIFY_REDIRECT_URI?.trim();

  if (!clientId || !redirectUri) return null;
  return { clientId, redirectUri };
}

function randomString(length: number) {
  const alphabet =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  const values = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(values, (value) => alphabet[value % alphabet.length]).join(
    '',
  );
}

function base64UrlEncode(input: ArrayBuffer) {
  return btoa(String.fromCharCode(...new Uint8Array(input)))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

async function createCodeChallenge(verifier: string) {
  const encoded = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', encoded);
  return base64UrlEncode(digest);
}

export async function createSpotifyAuthorizationUrl(
  config: SpotifyConfig,
  verifier: string,
  state: string,
) {
  const url = new URL(SPOTIFY_AUTH_URL);
  url.search = new URLSearchParams({
    client_id: config.clientId,
    response_type: 'code',
    redirect_uri: config.redirectUri,
    state,
    scope: spotifyScopes.join(' '),
    code_challenge_method: 'S256',
    code_challenge: await createCodeChallenge(verifier),
  }).toString();
  return url.toString();
}

export async function beginSpotifyLogin() {
  const config = getSpotifyConfig();
  if (!config) {
    throw new SpotifyAuthError(
      'Spotify no está configurado. Añade las variables de entorno requeridas.',
    );
  }

  const verifier = randomString(96);
  const state = randomString(32);
  sessionStorage.setItem(VERIFIER_KEY, verifier);
  sessionStorage.setItem(STATE_KEY, state);
  window.location.assign(
    await createSpotifyAuthorizationUrl(config, verifier, state),
  );
}

function readStoredSession(): StoredSpotifySession | null {
  const value = localStorage.getItem(SESSION_KEY);
  if (!value) return null;

  try {
    const session = JSON.parse(value) as StoredSpotifySession;
    if (
      !session.accessToken ||
      !session.refreshToken ||
      !Number.isFinite(session.expiresAt)
    ) {
      clearStoredSession();
      return null;
    }
    return session;
  } catch {
    clearStoredSession();
    return null;
  }
}

function storeSession(
  response: SpotifyTokenResponse,
  previousRefreshToken = '',
) {
  if (!response.access_token || !Number.isFinite(response.expires_in)) {
    throw new SpotifyAuthError('Spotify devolvió una sesión no válida.');
  }

  const refreshToken = response.refresh_token ?? previousRefreshToken;
  if (!refreshToken) {
    throw new SpotifyAuthError('Spotify no devolvió un token de renovación.');
  }

  const session: StoredSpotifySession = {
    accessToken: response.access_token,
    expiresAt: Date.now() + response.expires_in * 1000,
    refreshToken,
    scope: response.scope,
  };
  sessionGeneration += 1;
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  return session.accessToken;
}

async function requestToken(body: URLSearchParams) {
  const response = await fetch(SPOTIFY_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const responseOk = response.ok;
  const payload = (await response.json().catch(() => null)) as
    SpotifyTokenResponse | SpotifyTokenError | null;

  if (!responseOk) {
    const message =
      payload && 'error_description' in payload
        ? payload.error_description
        : undefined;
    throw new SpotifyAuthError(
      message ?? 'No se pudo completar la conexión con Spotify.',
      payload && 'error' in payload ? payload.error : undefined,
    );
  }

  if (!payload || !('access_token' in payload)) {
    throw new SpotifyAuthError('Spotify devolvió una sesión no válida.');
  }

  return payload;
}

function cleanCallbackUrl() {
  const url = new URL(window.location.href);
  url.searchParams.delete('code');
  url.searchParams.delete('state');
  url.searchParams.delete('error');
  window.history.replaceState(
    {},
    '',
    `${url.pathname}${url.search}${url.hash}`,
  );
}

async function exchangeCallbackCode(
  config: SpotifyConfig,
  code: string,
  verifier: string,
) {
  const response = await requestToken(
    new URLSearchParams({
      client_id: config.clientId,
      grant_type: 'authorization_code',
      code,
      redirect_uri: config.redirectUri,
      code_verifier: verifier,
    }),
  );
  return storeSession(response);
}

async function initializeSession() {
  const config = getSpotifyConfig();
  if (!config) return null;

  const params = new URLSearchParams(window.location.search);
  const error = params.get('error');
  const code = params.get('code');
  if (error || code) {
    const expectedState = sessionStorage.getItem(STATE_KEY);
    const returnedState = params.get('state');
    const verifier = sessionStorage.getItem(VERIFIER_KEY);

    try {
      if (!expectedState || returnedState !== expectedState || !verifier) {
        throw new SpotifyAuthError(
          'La respuesta de Spotify no superó la validación de seguridad.',
        );
      }
      if (error) {
        throw new SpotifyAuthError(
          error === 'access_denied'
            ? 'Cancelaste la conexión con Spotify.'
            : `Spotify rechazó la conexión: ${error}`,
        );
      }
      return await exchangeCallbackCode(config, code!, verifier);
    } finally {
      sessionStorage.removeItem(STATE_KEY);
      sessionStorage.removeItem(VERIFIER_KEY);
      cleanCallbackUrl();
    }
  }

  return getValidSpotifyAccessToken();
}

export function initializeSpotifySession() {
  initializationPromise ??= initializeSession();
  return initializationPromise;
}

export function refreshSpotifyAccessToken() {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    const config = getSpotifyConfig();
    const session = readStoredSession();
    if (!config || !session) return null;
    const generation = sessionGeneration;

    try {
      const response = await requestToken(
        new URLSearchParams({
          client_id: config.clientId,
          grant_type: 'refresh_token',
          refresh_token: session.refreshToken,
        }),
      );
      if (generation !== sessionGeneration) return null;
      return storeSession(response, session.refreshToken);
    } catch (error) {
      if (
        generation === sessionGeneration &&
        error instanceof SpotifyAuthError &&
        error.code === 'invalid_grant'
      ) {
        clearStoredSession();
      }
      throw error;
    }
  })().finally(() => {
    refreshPromise = null;
  });

  return refreshPromise;
}

export function getValidSpotifyAccessToken() {
  const session = readStoredSession();
  if (!session) return Promise.resolve(null);
  if (session.expiresAt > Date.now() + TOKEN_EXPIRY_BUFFER_MS) {
    return Promise.resolve(session.accessToken);
  }
  return refreshSpotifyAccessToken();
}

export function disconnectSpotify() {
  clearStoredSession();
  sessionStorage.removeItem(STATE_KEY);
  sessionStorage.removeItem(VERIFIER_KEY);
  initializationPromise = null;
}
