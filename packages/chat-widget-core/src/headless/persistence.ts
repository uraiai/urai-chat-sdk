/**
 * Thread persistence, with the `persistAcrossSessions` gate in one place.
 *
 * `ui.ts` checks that flag at five separate call sites; centralizing it
 * means a caller cannot forget, and it isolates the only `localStorage`
 * access in the headless layer so a non-browser host can no-op it.
 */
import { clearThread, loadThread, saveThread } from "../session";

export interface SessionStore {
  load(): string | null;
  save(threadId: string): void;
  clear(): void;
}

export interface SessionStoreOptions {
  widgetToken: string;
  getUserId(): string;
  /** Re-read per call, since `configure()` can flip it at runtime. */
  isEnabled(): boolean;
}

export function createSessionStore(opts: SessionStoreOptions): SessionStore {
  return {
    load() {
      if (!opts.isEnabled()) return null;
      return loadThread(opts.widgetToken, opts.getUserId());
    },
    save(threadId) {
      if (!opts.isEnabled()) return;
      saveThread(opts.widgetToken, opts.getUserId(), threadId);
    },
    /**
     * Deliberately NOT gated on `isEnabled`, matching `ui.ts`: load and
     * save are gated, clear is not. A widget switched to
     * `persistAcrossSessions: false` must still be able to evict an id
     * an earlier session left behind, or the stale value outlives it.
     */
    clear() {
      clearThread(opts.widgetToken, opts.getUserId());
    },
  };
}

/** A store that remembers nothing — preview mode, and tests. */
export function createNullSessionStore(): SessionStore {
  return { load: () => null, save: () => {}, clear: () => {} };
}
