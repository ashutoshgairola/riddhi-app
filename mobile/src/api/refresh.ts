/**
 * Data-refresh signal — a minimal pub/sub the api layer's mutations fire
 * (`bumpData()`) so every mounted `useApiData` refetches and screens pick
 * up the change without any navigation. Deliberately not a cache/queryKey
 * system: the app's dataset is small and refetch-everything keeps the
 * mock-mode and backend-mode paths identical.
 */
type Listener = () => void;

const listeners = new Set<Listener>();

/** Notify all mounted `useApiData` hooks that server/mock data changed. */
export function bumpData(): void {
  for (const listener of [...listeners]) listener();
}

export function subscribeData(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
