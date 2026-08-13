import { useSyncExternalStore } from "react";

// The wall clock is an external system, so it's read through
// useSyncExternalStore rather than a useEffect that writes to state — same
// reasoning as useHasMounted, and it keeps Date.now() out of render bodies
// (which the react-hooks/purity rule rightly rejects).
//
// The snapshot is cached at module level and only advances on a tick:
// getSnapshot MUST return a stable value between notifications, or React
// sees a new value on every render and loops forever.

let snapshot: number | null = null;

function getSnapshot() {
  if (snapshot === null) snapshot = Date.now();
  return snapshot;
}

// Null on the server: anything time-dependent would otherwise be baked into
// prerendered HTML and go stale the moment it's cached.
function getServerSnapshot(): number | null {
  return null;
}

/**
 * Current time in ms, refreshed every `intervalMs`, or null during SSR.
 *
 * The default of a minute suits countdowns measured in days — a return
 * window closing does not need second-level precision.
 */
export function useNow(intervalMs = 60_000) {
  return useSyncExternalStore(
    (onStoreChange) => {
      const timer = setInterval(() => {
        snapshot = Date.now();
        onStoreChange();
      }, intervalMs);
      return () => clearInterval(timer);
    },
    getSnapshot,
    getServerSnapshot
  );
}
