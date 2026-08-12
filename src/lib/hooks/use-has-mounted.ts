import { useSyncExternalStore } from "react";

const emptySubscribe = () => () => {};

// Guarantees the first client render matches the server render exactly, even
// for components that read persisted (localStorage-backed) zustand state.
// Use this to gate any markup that depends on a persisted store so it always
// renders the "default" state on the very first paint, then switches to the
// real value once mounted — avoiding React hydration mismatches.
//
// Implemented via useSyncExternalStore (constant client snapshot `true`,
// server snapshot `false`) rather than a `useEffect` + `setState` pair, so it
// doesn't trigger an extra render pass or the "no setState in effect" lint rule.
export function useHasMounted() {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );
}
