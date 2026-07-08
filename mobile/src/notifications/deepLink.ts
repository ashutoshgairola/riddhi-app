import type { ScreenKind } from '../app/navContext';

/** Screens a notification tap is allowed to deep-link into. */
const ALLOWED: ScreenKind[] = ['budgets', 'goals', 'reports', 'chat', 'tx-detail', 'sync'];

export interface NotifNavTarget {
  kind: ScreenKind;
  data?: { id: string };
}

/**
 * Maps a notification's `data` payload (`{ screen, id? }`, as set by the
 * backend NotificationsService) to a nav target. Returns null when the
 * payload is missing/malformed or names a screen not in the allow-list, so
 * an unexpected push can never navigate somewhere invalid.
 */
export function mapNotificationToScreen(data: unknown): NotifNavTarget | null {
  if (!data || typeof data !== 'object') return null;
  const screen = (data as Record<string, unknown>).screen;
  if (typeof screen !== 'string' || !ALLOWED.includes(screen as ScreenKind)) {
    return null;
  }
  const id = (data as Record<string, unknown>).id;
  if (screen === 'tx-detail' && typeof id === 'string') {
    return { kind: 'tx-detail', data: { id } };
  }
  return { kind: screen as ScreenKind };
}
