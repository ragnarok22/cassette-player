import { describe, expect, it } from 'vitest';
import { formatTime, getNextIndex, getProgress } from './player';

describe('player helpers', () => {
  it('formats tape counter time', () => {
    expect(formatTime(0)).toBe('0:00');
    expect(formatTime(245)).toBe('4:05');
  });

  it('wraps track navigation in both directions', () => {
    expect(getNextIndex(3, 4, 1)).toBe(0);
    expect(getNextIndex(0, 4, -1)).toBe(3);
  });

  it('clamps progress to the visible rail', () => {
    expect(getProgress(30, 120)).toBe(25);
    expect(getProgress(150, 120)).toBe(100);
    expect(getProgress(-10, 120)).toBe(0);
  });
});
