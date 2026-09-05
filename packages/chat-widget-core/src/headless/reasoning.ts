/**
 * Reasoning model — the accumulate-then-seal state behind an assistant
 * bubble's "Thoughts" block.
 *
 * Extracted from `ui.ts`; DOM-free. Live reasoning streams into `text`;
 * `seal()` freezes it when the first answer chunk lands, after which
 * further chunks are ignored.
 */

export interface ReasoningSnapshot {
  text: string;
  sealed: boolean;
}

export interface ReasoningModel {
  /** No-op once sealed. */
  append(chunk: string): void;
  /**
   * Idempotent, and a no-op when no reasoning ever arrived — matching
   * the imperative version, which bails when it never built a container.
   */
  seal(): void;
  /** True once `append` has been called at least once, empty chunk included. */
  readonly started: boolean;
  snapshot(): ReasoningSnapshot;
}

export function createReasoning(): ReasoningModel {
  let buf = "";
  let sealed = false;
  // Tracked separately from `buf` because `append("")` must still count
  // as started: the imperative version creates its container on any
  // append, and `seal()` keys off the container's existence.
  let started = false;

  return {
    append(chunk) {
      if (sealed) return;
      buf += chunk;
      started = true;
    },
    seal() {
      if (sealed || !started) return;
      sealed = true;
    },
    get started() {
      return started;
    },
    snapshot() {
      return { text: buf, sealed };
    },
  };
}
