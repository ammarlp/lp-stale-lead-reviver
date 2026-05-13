import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function relativeTime(ms?: number | string | null): string {
  if (ms == null) return 'unknown';
  const n = typeof ms === 'string' ? Number(ms) : ms;
  if (!Number.isFinite(n) || n <= 0) return 'unknown';
  const diff = Date.now() - n;
  const days = Math.floor(diff / 86_400_000);
  if (days < 1) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}
