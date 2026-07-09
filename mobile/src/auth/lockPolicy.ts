/**
 * lockPolicy — the app-lock invariant `biometric ⟹ PIN`, as a pure decision.
 * Biometric may never be the only on-device unlock factor; a device with
 * biometric on but no PIN must create one before it can enter the app.
 */
export interface LockMethods {
  pin: boolean;
  biometric: boolean;
}

/** True when biometric is enabled but no PIN exists — a backup PIN is required. */
export function needsPinBackfill(m: LockMethods): boolean {
  return m.biometric && !m.pin;
}
