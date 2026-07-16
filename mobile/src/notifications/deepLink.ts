import type { ScreenKind } from '../app/navContext';
import type { NotifViewType } from '../api/types';

/** Screens a notification tap is allowed to deep-link into. */
const ALLOWED: ScreenKind[] = ['budgets', 'goals', 'reports', 'chat', 'tx-detail', 'goal-detail', 'sync', 'subscriptions'];

/** Screens that require a string id to render. */
const ID_SCREENS: ScreenKind[] = ['tx-detail', 'goal-detail'];

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
  // ID_SCREENS (tx-detail, goal-detail) require a string id to render; an
  // id-less payload resolves to null so the caller falls back to a safe screen
  // instead of pushing a detail without an id.
  if (ID_SCREENS.includes(screen as ScreenKind)) {
    return typeof id === 'string' ? { kind: screen as ScreenKind, data: { id } } : null;
  }
  return { kind: screen as ScreenKind };
}

/** Screen a notification of a given type opens when it has no deep-link
 * payload (legacy rows). Every type resolves to a target so all cards are
 * tappable. */
const TYPE_FALLBACK: Record<NotifViewType, ScreenKind> = {
  budget: 'budgets',
  goal: 'goals',
  tx: 'txns',
  report: 'reports',
  security: 'settings',
  munshi: 'chat',
};

export function fallbackTargetForType(type: NotifViewType): NotifNavTarget {
  return { kind: TYPE_FALLBACK[type] };
}
