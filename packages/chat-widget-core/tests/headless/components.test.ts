import { describe, it, expect } from "vitest";
import { parseDisplayComponent } from "../../src/headless/components";
import { hydrateHistory } from "../../src/headless/messages";

describe("parseDisplayComponent", () => {
  it("accepts a displayComponent command, defaulting props to {}", () => {
    expect(
      parseDisplayComponent({
        command: "displayComponent",
        component: "OrderCard",
        props: { orderId: "o-1", total: 42 },
      }),
    ).toEqual({ component: "OrderCard", props: { orderId: "o-1", total: 42 } });
    expect(
      parseDisplayComponent({ command: "displayComponent", component: "ui.Map:v2" }),
    ).toEqual({ component: "ui.Map:v2", props: {} });
  });

  it("ignores every other command", () => {
    expect(parseDisplayComponent({ command: "navigate", url: "/x" })).toBeNull();
    expect(parseDisplayComponent("displayComponent")).toBeNull();
    expect(parseDisplayComponent(null)).toBeNull();
    expect(parseDisplayComponent([{ command: "displayComponent" }])).toBeNull();
  });

  it("rejects a name that is not a plain identifier", () => {
    for (const component of ["", "1Card", "<img>", "a b", "x".repeat(101), 7]) {
      expect(
        parseDisplayComponent({ command: "displayComponent", component }),
      ).toBeNull();
    }
    expect(
      parseDisplayComponent({ command: "displayComponent", component: "x".repeat(100) }),
    ).not.toBeNull();
  });

  it("rejects props that are not an object", () => {
    for (const props of [null, [], "x", 3]) {
      expect(
        parseDisplayComponent({ command: "displayComponent", component: "Card", props }),
      ).toBeNull();
    }
  });
});

describe("hydrateHistory: components", () => {
  it("keeps an assistant turn whose only output is a component", () => {
    const rows = hydrateHistory([
      {
        id: "m1",
        thread_id: "t1",
        message_idx: 1,
        role: "assistant",
        content: "",
        reasoning: null,
        created_at: "2026-01-01T00:00:00Z",
        components: [{ id: "c1", component: "OrderCard", props: { orderId: "o-1" } }],
      },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].components).toEqual([
      { id: "c1", component: "OrderCard", props: { orderId: "o-1" } },
    ]);
  });
});
