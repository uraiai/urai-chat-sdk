/**
 * Tool-activity model — the state behind the live status row on a
 * streaming assistant bubble.
 *
 * Extracted from `ui.ts` so the imperative widget and any future view
 * share one implementation. This module is DOM-free; callers render
 * `snapshot()` however they like.
 */

/**
 * Tool names arrive from the server as the raw function name, usually
 * in snake_case (e.g. `web_search`, `run_code`); the widget surfaces
 * these to the visitor verbatim aside from a small known-name map and
 * a generic snake-to-words fallback.
 */
export function prettyToolName(fnName: string): string {
  const KNOWN: Record<string, string> = {
    web_search: "Searching the web",
    write: "Writing a script",
    execute: "Running code",
    run_code: "Running code",
  };
  if (KNOWN[fnName]) return KNOWN[fnName];
  const words = fnName.replace(/[_-]+/g, " ").trim();
  return words ? `Using ${words}` : "Using a tool";
}

export interface ToolActivityEntry {
  fnName: string;
  summary?: string;
  completed: boolean;
}

export interface ToolActivitySnapshot {
  /** Label for the most recent entry — its summary, or the pretty name. */
  label: string;
  completed: boolean;
}

export interface ToolActivityModel {
  start(id: string, fnName: string): void;
  complete(id: string): void;
  setSummary(id: string, summary: string): void;
  clear(): void;
  /**
   * The row's current content, or null when there is nothing to show.
   * Reflects only the **most recent** entry: crowding multiple names
   * into a small widget panel reads worse than a single rolling label.
   */
  snapshot(): ToolActivitySnapshot | null;
}

export function createToolActivity(): ToolActivityModel {
  // Entries stay in the map even after `complete` so an async summary
  // arriving later can still replace the generic label. `clear()` is
  // what evicts them — called on stream done/error.
  const entries = new Map<string, ToolActivityEntry>();
  const order: string[] = [];

  return {
    start(id, fnName) {
      if (!entries.has(id)) order.push(id);
      entries.set(id, { fnName, completed: false });
    },
    complete(id) {
      const entry = entries.get(id);
      if (!entry) return;
      entry.completed = true;
    },
    setSummary(id, summary) {
      const entry = entries.get(id);
      if (!entry) return; // late summary for a turn we already cleared
      entry.summary = summary;
    },
    clear() {
      entries.clear();
      order.length = 0;
    },
    snapshot() {
      if (entries.size === 0) return null;
      const latestId = order[order.length - 1];
      const entry = entries.get(latestId);
      return {
        label: entry?.summary ?? prettyToolName(entry?.fnName ?? ""),
        completed: entry?.completed ?? false,
      };
    },
  };
}
