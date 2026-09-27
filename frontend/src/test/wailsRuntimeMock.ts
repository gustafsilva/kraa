import { vi } from "vitest";

// Minimal stand-in for the `Events` namespace exported by @wailsio/runtime.
// Tests import `emit` to simulate events the Go backend would send, and the
// hook under test subscribes through the same `Events.On` mock.
type Handler = (ev: { name: string; data: unknown }) => void;

const listeners = new Map<string, Set<Handler>>();

export const Events = {
  On: vi.fn((name: string, callback: Handler) => {
    let set = listeners.get(name);
    if (!set) {
      set = new Set();
      listeners.set(name, set);
    }
    set.add(callback);
    return () => {
      listeners.get(name)?.delete(callback);
    };
  }),
  Off: vi.fn((...names: string[]) => {
    for (const name of names) listeners.delete(name);
  }),
};

export function emit(name: string, data: unknown) {
  listeners.get(name)?.forEach((callback) => callback({ name, data }));
}

/** Number of live `Events.On` listeners for `name` — lets a test prove a
 * cleanup function actually unsubscribed, instead of just poking `emit`
 * and hoping nothing throws. */
export function listenerCount(name: string): number {
  return listeners.get(name)?.size ?? 0;
}

export function resetWailsMock() {
  listeners.clear();
  Events.On.mockClear();
  Events.Off.mockClear();
}
