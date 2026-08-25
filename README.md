# cassette-player

A tactile browser cassette deck that turns saved Spotify albums into a personal tape shelf. Connect a Spotify Premium account, load an album, and control real playback through the animated deck.

## Features

- Spotify Authorization Code with PKCE; no client secret or backend required
- Browser playback through the Spotify Web Playback SDK
- Saved Spotify albums mapped to cassettes with artwork and track lists
- Real play, pause, seek, volume, shuffle, rewind, fast-forward, and eject controls
- Automatic token refresh and persisted local sessions
- Static preview cassettes before Spotify is connected
- Responsive analog-inspired interface with accessible controls

## Requirements

- Node.js
- pnpm 11
- A Spotify Premium account
- A Spotify Developer application with Web Playback SDK enabled

Spotify development-mode applications currently require the app owner to have Premium and are limited to a small allowlist of users. Review Spotify's developer terms before public or commercial use.

## Spotify Setup

1. Create an application in the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard).
2. Enable the Web Playback SDK for the application.
3. Register `http://127.0.0.1:5173/` as a redirect URI. Spotify does not allow `localhost` redirect URIs.
4. Create the local environment file:

```bash
cp .env.example .env.local
```

5. Add the application's public Client ID to `.env.local`:

```dotenv
VITE_SPOTIFY_CLIENT_ID=your_spotify_client_id
VITE_SPOTIFY_REDIRECT_URI=http://127.0.0.1:5173/
VITE_SITE_URL=http://127.0.0.1:5173/
```

Do not add a Spotify client secret. PKCE is designed for browser applications where secrets cannot be stored safely.

For a self-hosted deployment, replace the redirect and site values with the exact public HTTPS URL, and register the redirect URL in Spotify's dashboard. `VITE_SITE_URL` is used to generate absolute canonical and social-sharing metadata.

## Run Locally

```bash
pnpm install
pnpm dev
```

Open `http://127.0.0.1:5173/`, select **Conectar Spotify**, and authorize the application.

## Commands

| Command             | Purpose                                  |
| ------------------- | ---------------------------------------- |
| `pnpm dev`          | Start the fixed local development server |
| `pnpm build`        | Type-check and create a production build |
| `pnpm preview`      | Preview the production build locally     |
| `pnpm test`         | Run the test suite once                  |
| `pnpm typecheck`    | Run TypeScript checks                    |
| `pnpm lint`         | Run ESLint                               |
| `pnpm format`       | Format the project with Prettier         |
| `pnpm format:check` | Check formatting without changing files  |

## Architecture

- `src/app.tsx` owns the cassette UI and coordinates authentication, catalog, and playback state.
- `src/lib/spotify-auth.ts` implements PKCE, callback validation, token storage, and refresh.
- `src/lib/spotify-api.ts` loads saved albums and sends Spotify Web API playback commands.
- `src/lib/use-spotify-player.ts` manages the Web Playback SDK and translates SDK events into UI state.
- `src/data/library.ts` provides the disconnected preview catalog.
- `src/styles.css` contains the layout, visual system, and cassette animations.

Access and refresh tokens are stored in browser local storage for this self-hosted client application. Disconnecting Spotify removes the stored session.

## Production Build

```bash
pnpm build
pnpm preview
```

The generated static files are written to `dist/`.
