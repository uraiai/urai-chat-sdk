/**
 * Thread-list helpers — filtering, recency grouping and relative time
 * for the conversation switcher.
 *
 * Extracted from `ui.ts`; DOM-free. Each function takes `now` so tests
 * can pin the clock without fake timers; the default preserves the
 * original behaviour exactly.
 */
import type { ThreadSummary } from "../transport";

/** Case-insensitive substring match over title and last-message preview. */
export function filterThreads(
  items: readonly ThreadSummary[],
  query: string,
): ThreadSummary[] {
  if (!query.trim()) return [...items];
  const q = query.toLowerCase();
  return items.filter(
    (t) =>
      t.title.toLowerCase().includes(q) ||
      (t.last_message_preview ?? "").toLowerCase().includes(q),
  );
}

export type ThreadGroup = [label: string, threads: ThreadSummary[]];

/**
 * Buckets threads into Today / Past week / Older by last activity.
 * Empty buckets are dropped, and the order is fixed.
 */
export function groupByRecency(
  items: readonly ThreadSummary[],
  now: number = Date.now(),
): ThreadGroup[] {
  const ONE_DAY = 24 * 60 * 60 * 1000;
  const groups: Record<string, ThreadSummary[]> = {
    Today: [],
    "Past week": [],
    Older: [],
  };
  const order = ["Today", "Past week", "Older"];
  for (const t of items) {
    const when = new Date(t.last_message_at ?? t.updated_at).getTime();
    const age = now - when;
    if (age < ONE_DAY) groups["Today"].push(t);
    else if (age < 7 * ONE_DAY) groups["Past week"].push(t);
    else groups["Older"].push(t);
  }
  return order
    .map((k): ThreadGroup => [k, groups[k]])
    .filter(([, g]) => g.length > 0);
}

/** Hand-rolled "3h ago" formatter. Future timestamps read as "just now". */
export function relativeTime(iso: string, now: number = Date.now()): string {
  const then = new Date(iso).getTime();
  const diff = now - then;
  if (diff < 0) return "just now";
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(mo / 12)}y ago`;
}
