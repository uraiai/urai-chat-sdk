import { describe, it, expect } from "vitest";
import {
  filterThreads,
  groupByRecency,
  relativeTime,
  threadPreview,
} from "../../src/headless/thread-list";
import type { ThreadSummary } from "../../src/transport";

const NOW = Date.parse("2026-06-15T12:00:00.000Z");
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

function thread(over: Partial<ThreadSummary> & { id: string }): ThreadSummary {
  return {
    title: "Untitled",
    created_at: new Date(NOW).toISOString(),
    updated_at: new Date(NOW).toISOString(),
    last_message_at: null,
    last_message_preview: null,
    ...over,
  };
}

/** A thread whose last activity was `ms` before NOW. */
function aged(id: string, ms: number): ThreadSummary {
  return thread({ id, last_message_at: new Date(NOW - ms).toISOString() });
}

describe("groupByRecency", () => {
  it("buckets on the 24h and 7d boundaries", () => {
    const groups = groupByRecency(
      [
        aged("just-under-a-day", DAY - 60_000),
        aged("just-over-a-day", DAY + 60_000),
        aged("just-under-a-week", 7 * DAY - HOUR),
        aged("just-over-a-week", 7 * DAY + HOUR),
      ],
      NOW,
    );
    expect(groups.map(([label, items]) => [label, items.map((t) => t.id)])).toEqual([
      ["Today", ["just-under-a-day"]],
      ["Past week", ["just-over-a-day", "just-under-a-week"]],
      ["Older", ["just-over-a-week"]],
    ]);
  });

  it("drops empty buckets and keeps a fixed order", () => {
    const groups = groupByRecency([aged("old", 30 * DAY)], NOW);
    expect(groups.map(([label]) => label)).toEqual(["Older"]);
  });

  it("falls back to updated_at when there is no last message", () => {
    const t = thread({
      id: "no-messages",
      updated_at: new Date(NOW - 2 * DAY).toISOString(),
    });
    expect(groupByRecency([t], NOW)[0][0]).toBe("Past week");
  });

  it("returns nothing for an empty list", () => {
    expect(groupByRecency([], NOW)).toEqual([]);
  });
});

describe("relativeTime", () => {
  it("formats each bucket", () => {
    const at = (ms: number) => relativeTime(new Date(NOW - ms).toISOString(), NOW);
    expect(at(5_000)).toBe("5s ago");
    expect(at(59_000)).toBe("59s ago");
    expect(at(60_000)).toBe("1m ago");
    expect(at(59 * 60_000)).toBe("59m ago");
    expect(at(HOUR)).toBe("1h ago");
    expect(at(23 * HOUR)).toBe("23h ago");
    expect(at(DAY)).toBe("1d ago");
    expect(at(29 * DAY)).toBe("29d ago");
    expect(at(30 * DAY)).toBe("1mo ago");
    // Months are a flat 30 days, so the year boundary lands at 360 days,
    // not 365. Pinned as-is: Phase 1 preserves behaviour exactly.
    expect(at(359 * DAY)).toBe("11mo ago");
    expect(at(360 * DAY)).toBe("1y ago");
  });

  it("reads a future timestamp as 'just now' rather than negative", () => {
    expect(relativeTime(new Date(NOW + HOUR).toISOString(), NOW)).toBe("just now");
  });
});

describe("filterThreads", () => {
  const items = [
    thread({ id: "a", title: "Refund request", last_message_preview: "posted it" }),
    thread({ id: "b", title: "Shipping", last_message_preview: "Where is my REFUND?" }),
    thread({ id: "c", title: "Hello" }),
  ];

  it("returns everything for a blank or whitespace query", () => {
    expect(filterThreads(items, "").map((t) => t.id)).toEqual(["a", "b", "c"]);
    expect(filterThreads(items, "   ").map((t) => t.id)).toEqual(["a", "b", "c"]);
  });

  it("matches title and preview, case-insensitively", () => {
    expect(filterThreads(items, "refund").map((t) => t.id)).toEqual(["a", "b"]);
  });

  it("tolerates a null preview", () => {
    expect(filterThreads(items, "hello").map((t) => t.id)).toEqual(["c"]);
  });

  it("returns a copy, never the input array", () => {
    expect(filterThreads(items, "")).not.toBe(items);
  });
});

describe("threadPreview", () => {
  it("passes plain prose through", () => {
    expect(threadPreview("Where is my refund?")).toBe("Where is my refund?");
  });

  it("returns null for null, empty or marker-only previews", () => {
    expect(threadPreview(null)).toBeNull();
    expect(threadPreview("")).toBeNull();
    expect(
      threadPreview(
        '<urai-tool-call id="a"></urai-tool-call> <urai-tool-call id="b"></urai-tool-call>',
      ),
    ).toBeNull();
  });

  it("strips closed, self-closing and unclosed markers", () => {
    expect(
      threadPreview(
        '<urai-tool-call id="a"></urai-tool-call> <urai-tool-call id="b"/>\n\nPlant 4 has the most volume.',
      ),
    ).toBe("Plant 4 has the most volume.");
    expect(threadPreview('<urai-tool-call id="a"> You are right, sorry.')).toBe(
      "You are right, sorry.",
    );
  });

  it("drops a marker truncated by the excerpt length", () => {
    expect(
      threadPreview('Checking now. <urai-tool-call id="a"></urai-tool-call> <urai-tool-call id="122d10d0-7ef6-4'),
    ).toBe("Checking now.");
    expect(threadPreview("Checking now. <urai-to")).toBe("Checking now.");
    expect(threadPreview('Done <urai-tool-call id="a"></urai-tool-c')).toBe("Done");
  });

  it("leaves other angle-bracket text alone", () => {
    expect(threadPreview("x <b> y")).toBe("x <b> y");
    expect(threadPreview("a < b")).toBe("a < b");
  });

  it("filterThreads does not match marker text", () => {
    const items = [
      thread({
        id: "a",
        title: "Alerts",
        last_message_preview: '<urai-tool-call id="a"></urai-tool-call> All clear.',
      }),
    ];
    expect(filterThreads(items, "urai")).toEqual([]);
    expect(filterThreads(items, "clear").map((t) => t.id)).toEqual(["a"]);
  });
});
