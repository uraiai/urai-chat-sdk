// Per-instance event bus. The original embed script kept a module-level
// listener map (one widget per page); the SDK supports multiple widget
// instances, so each controller owns its own Emitter.

/**
 * Why the conversation's thread id changed. `created` is the one a host
 * saving conversations acts on: a new server thread now exists.
 *
 * - `created` — the first message of a new conversation created a thread
 * - `restored` — the visitor's last thread was reloaded from storage
 * - `selected` — the visitor picked a thread in the switcher
 * - `opened` — the host asked for a thread (`threadId` / `openThread`); a
 *   `null` id here means the host cleared it or the thread could not be
 *   opened (an `error` event says which)
 * - `reset` — "New conversation"; the id is `null` until the next send
 * - `user-changed` — `setUser` switched visitor; the id is `null`
 */
export type ThreadChangeReason =
  | "created"
  | "restored"
  | "selected"
  | "opened"
  | "reset"
  | "user-changed";

export type WidgetEvent =
  | { type: "ready" }
  | { type: "opened" }
  | { type: "closed" }
  | { type: "user-message"; content: string }
  | { type: "assistant-reply"; content: string }
  /**
   * A uraiJS tool called `meta.urai.sendCommand(thread_id, payload)`
   * during this turn. `command` is the developer's payload, verbatim —
   * treat it as untrusted input and validate its shape before acting.
   * Delivered only while the turn's stream is open; every open consumer
   * (e.g. multiple tabs) receives its own copy.
   */
  | { type: "command"; command: unknown }
  /**
   * The conversation moved to another thread, or to none. Fires only on a
   * real change. On `created` the id is known before the first message is
   * sent, so a host can save it even if that send then fails.
   */
  | {
      type: "thread-change";
      threadId: string | null;
      previousThreadId: string | null;
      reason: ThreadChangeReason;
    }
  | { type: "error"; error: string }
  | { type: "destroyed" };

export type WidgetEventName = WidgetEvent["type"];
export type WidgetEventListener = (event: WidgetEvent) => void;

export class Emitter {
  private listeners = new Map<WidgetEventName, Set<WidgetEventListener>>();

  on(event: WidgetEventName, listener: WidgetEventListener): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(listener);
    return () => set.delete(listener);
  }

  emit(event: WidgetEvent): void {
    const set = this.listeners.get(event.type);
    if (set) set.forEach((cb) => cb(event));
  }

  clear(): void {
    this.listeners.clear();
  }
}
