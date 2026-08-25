# Repository Instructions

## Tooling

- This is a single-package React + TypeScript Vite app. Use `pnpm`; `package.json` pins pnpm 11.24.0 and `pnpm-lock.yaml` is authoritative.
- Run locally with `pnpm dev`. `pnpm build` runs `tsc -b` before Vite and writes the ignored `dist/` directory; never edit `dist/` directly.
- No environment variables, backend, database, or external service is required.

## Architecture

- `src/main.tsx` mounts the app; `src/app.tsx` contains the UI and in-memory player state.
- `src/data/library.ts` is the static cassette/track catalog. Pure counter, navigation, and progress logic lives in `src/lib/player.ts`.
- `src/styles.css` owns the layout, responsive rules, and cassette animations; its class names are coupled directly to `src/app.tsx`.
- The player is deliberately a visual interaction demo: it has no audio element, persistence, network calls, or real Spotify OAuth. The provider modal only toggles local state.

## Conventions

- Use kebab-case for new or renamed file names. Keep ecosystem-required conventional names such as `AGENTS.md`, `README.md`, and `package.json` unchanged.
- Keep user-facing product copy in Spanish unless the task explicitly changes the product language.

## Verification

- Run the full suite with `pnpm test`; Vitest uses jsdom and loads jest-dom matchers from `src/test/setup.ts`.
- Run one test file with `pnpm exec vitest run src/lib/player.test.ts`. Do not use `pnpm test -- <path>` for filtering; it runs the full suite in this repository.
- Transport tests use fake timers and currently advance the 720 ms cue transition; update the matching assertion when changing that timing.
- Before finishing code changes, run `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm format:check`. Use `pnpm build` when build output or bundling could be affected.
