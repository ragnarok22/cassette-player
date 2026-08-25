export function formatTime(seconds: number) {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const remainder = safeSeconds % 60;
  return `${minutes}:${remainder.toString().padStart(2, '0')}`;
}

export function getNextIndex(
  current: number,
  total: number,
  direction: 1 | -1,
) {
  if (total <= 0) return 0;
  return (current + direction + total) % total;
}

export function getProgress(current: number, duration: number) {
  if (duration <= 0) return 0;
  return Math.min(100, Math.max(0, (current / duration) * 100));
}
