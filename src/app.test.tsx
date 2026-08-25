import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from './app';

describe('cassette player', () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('plays and cues the next track with a rewind transition', () => {
    vi.useFakeTimers();
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'Reproducir' }));
    expect(screen.getByRole('button', { name: 'Pausar' })).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: 'Pista siguiente, avance rápido' }),
    );
    act(() => vi.advanceTimersByTime(720));

    expect(
      screen.getByRole('heading', { name: 'Palms on the Freeway' }),
    ).toBeInTheDocument();
  });

  it('opens the provider connection panel', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: 'CONECTAR FUENTE' }));

    expect(
      screen.getByRole('dialog', { name: 'Conecta tu estantería' }),
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: /Continuar con Spotify/ }),
    ).toBeVisible();
  });
});
