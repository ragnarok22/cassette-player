# cassette-player

A tactile, browser-based cassette deck with a warm analog-inspired interface. Browse a small tape collection, load a cassette, and use familiar transport controls to move through its tracks.

## Features

- Animated cassette reels, playback, fast-forward, rewind, and eject controls
- Four themed cassettes with their own artwork and track lists
- Seek, volume, playback counter, favorite, shuffle, and Dolby NR controls
- Responsive interface styled after a vintage stereo deck
- Simulated Spotify connection flow for demonstrating provider states
- Accessible labels and keyboard-operable controls

> [!NOTE]
> This project is a front-end interaction demo. It does not play audio, contact Spotify, start OAuth, or send user data.

## Tech Stack

- React 19
- TypeScript
- Vite
- Vitest and Testing Library
- ESLint and Prettier
- Lucide React

## Getting Started

### Prerequisites

- Node.js
- pnpm 11

### Install and Run

```bash
pnpm install
pnpm dev
```

Open the local URL printed by Vite.

## Commands

| Command             | Purpose                                  |
| ------------------- | ---------------------------------------- |
| `pnpm dev`          | Start the development server             |
| `pnpm build`        | Type-check and create a production build |
| `pnpm preview`      | Preview the production build locally     |
| `pnpm test`         | Run the test suite once                  |
| `pnpm typecheck`    | Run TypeScript checks                    |
| `pnpm lint`         | Run ESLint                               |
| `pnpm format`       | Format the project with Prettier         |
| `pnpm format:check` | Check formatting without changing files  |

## Project Structure

```text
src/
├── data/          # Cassette and track library
├── lib/           # Player utilities and unit tests
├── test/          # Test environment setup
├── App.tsx        # Player interface and interaction state
├── App.test.tsx   # Application interaction tests
├── styles.css     # Visual system, layout, and animations
├── main.tsx       # React entry point
└── types.ts       # Shared data types
```

## Production Build

```bash
pnpm build
pnpm preview
```

The generated static files are written to `dist/`.
