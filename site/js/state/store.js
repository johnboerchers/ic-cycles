// A tiny observable store. The state object is replaced on every change, never mutated, so a
// listener can tell what changed by comparing groups by reference (state.params !== prev.params).

export function createStore(initial) {
  let state = initial;
  const listeners = new Set();

  function set(patch) {
    const prev = state;
    state = { ...state, ...patch };
    for (const fn of listeners) fn(state, prev);
  }

  return {
    get: () => state,
    set,
    // Merges `patch` into one group of the state, such as "playback" or "options".
    merge: (key, patch) => set({ [key]: { ...state[key], ...patch } }),
    // Listeners must not call set() themselves.
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}
