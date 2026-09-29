/**
 * Sub-agent cards — one per `delegate` tool call, the assistant handing a
 * sub-task to a sub-agent (a child thread on the server).
 *
 * The visitor sees only that it happened: the task's first line, where it
 * got to, and how many steps it took once that is known. The sub-agent's
 * thread, cost and answer text never reach the widget — the server does
 * not send them, and there is nothing here to link to.
 *
 * DOM-free and shared by every view, so the imperative widget and the
 * React one build the same list from history and from a live turn.
 */
import type { DelegateStatus, MessageDelegate, ToolCallCompletedEvent } from "../transport";

/** The tool name whose calls get a card. */
export const DELEGATE_TOOL = "delegate";

/** The settled statuses a completion can report, `running` excluded. */
const SETTLED: ReadonlySet<string> = new Set<DelegateStatus>([
  "completed",
  "no_output",
  "failed",
  "timeout",
  "cancelled",
  "error",
]);

/**
 * The status a `tool_call_completed` event settles a card on. The server
 * sends `status` for a delegate call; an older one — or a call that failed
 * before the sub-agent ran — sends only `ok`, and `ok: false` with nothing
 * else is an error.
 */
export function delegateCompletionStatus(
  call: Pick<ToolCallCompletedEvent, "ok" | "status">,
): DelegateStatus {
  if (call.status && SETTLED.has(call.status)) return call.status as DelegateStatus;
  return call.ok ? "completed" : "error";
}

/** Whether a card is still waiting on its sub-agent. */
export function isDelegateRunning(d: Pick<MessageDelegate, "status">): boolean {
  return d.status === "running";
}

/** English status text, for views without a label system of their own. */
export function delegateStatusLabel(status: DelegateStatus): string {
  switch (status) {
    case "running":
      return "Running";
    case "completed":
      return "Done";
    case "no_output":
      return "No result file";
    case "failed":
      return "Failed";
    case "timeout":
      return "Timed out";
    case "cancelled":
      return "Stopped";
    case "error":
    default:
      return "Error";
  }
}

/** `3 steps`, or `null` when the count is not known (zero, or live). */
export function delegateStepsLabel(steps: number): string | null {
  if (!Number.isFinite(steps) || steps <= 0) return null;
  return steps === 1 ? "1 step" : `${steps} steps`;
}

/** The task's first line, trimmed. The server already cuts it; this is belt and braces. */
function firstLine(label: unknown): string {
  if (typeof label !== "string") return "";
  return (label.split(/\r?\n/).find((l) => l.trim().length > 0) ?? "").trim();
}

export interface DelegateListModel {
  /**
   * A `tool_call_started` event. Only a `delegate` call adds a card; any
   * other returns false. A repeat of a known id is ignored.
   */
  start(call: { id: string; fn_name: string; label?: string }): boolean;
  /**
   * A `tool_call_completed` event. Settles the card with that id; returns
   * false when there is none — the call was some other tool.
   */
  complete(call: Pick<ToolCallCompletedEvent, "id" | "ok" | "status">): boolean;
  /** The cards in call order. A fresh array of fresh objects every call. */
  snapshot(): MessageDelegate[];
}

/**
 * A turn's cards. Seed it with the `delegates` a history message carries;
 * a live turn starts empty and fills from the stream's tool-call events.
 */
export function createDelegateList(seed?: MessageDelegate[] | null): DelegateListModel {
  const cards = new Map<string, MessageDelegate>();
  for (const d of seed ?? []) {
    if (d && typeof d.id === "string" && !cards.has(d.id)) {
      cards.set(d.id, {
        id: d.id,
        label: firstLine(d.label),
        status: d.status,
        steps: typeof d.steps === "number" ? d.steps : 0,
      });
    }
  }

  return {
    start({ id, fn_name, label }) {
      if (fn_name !== DELEGATE_TOOL || cards.has(id)) return false;
      cards.set(id, { id, label: firstLine(label), status: "running", steps: 0 });
      return true;
    },
    complete(call) {
      const card = cards.get(call.id);
      if (!card) return false;
      card.status = delegateCompletionStatus(call);
      return true;
    },
    snapshot() {
      return Array.from(cards.values(), (d) => ({ ...d }));
    },
  };
}
