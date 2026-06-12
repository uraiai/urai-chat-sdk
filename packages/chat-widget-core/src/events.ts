// Per-instance event bus. The original embed script kept a module-level
// listener map (one widget per page); the SDK supports multiple widget
// instances, so each controller owns its own Emitter.

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
