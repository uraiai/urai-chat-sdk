/**
 * SVG rendering in the React view.
 *
 * The agent writes charts as bare `<svg>` in the message body, not inside a
 * ```svg fence. The view runs `rehype-raw` (so the markup reaches the tree)
 * followed by `rehype-sanitize`, which is what has to be taught that SVG is
 * allowed — while still refusing script, event handlers and foreign content,
 * because this renders on a customer's page.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen, act, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { makeFakeTransport, type FakeTransport } from "@uraiai/chat-test-support";
import { UraiChat } from "../src/ui";

beforeEach(() => localStorage.clear());
afterEach(cleanup);

const TOKEN = "11111111-2222-3333-4444-555555555555";

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" width="100"><circle cx="5" cy="5" r="4" fill="red"/></svg>`;

function mount() {
  const transport = makeFakeTransport();
  const utils = render(
    <UraiChat widgetToken={TOKEN} userId="visitor-1" transport={transport} open />,
  );
  return { transport, ...utils };
}

async function frame() {
  await act(async () => {
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
  });
}

/**
 * Send a turn, stream `text` back as the assistant's reply, and return the
 * rendered message body.
 *
 * Scoped to the markdown part rather than the whole container on purpose:
 * the widget chrome draws its own icon SVGs, so a bare `container.querySelector("svg")`
 * finds a send-button icon and every assertion below it passes for the
 * wrong reason.
 */
async function say(text: string): Promise<HTMLElement> {
  const { transport, container } = mount();
  await screen.findByRole("textbox");
  await userEvent.type(screen.getByRole("textbox"), "chart me{Enter}");
  await waitFor(() => expect(transport.lastStreamHandlers()).toBeTruthy());
  const h = transport.lastStreamHandlers() as NonNullable<
    ReturnType<FakeTransport["lastStreamHandlers"]>
  >;
  await act(async () => h.onChunk?.(text));
  await frame();
  const body = container.querySelector<HTMLElement>('[data-urai-part="markdown"]');
  if (!body) throw new Error("no rendered message body");
  return body;
}

describe("React view — inline SVG", () => {
  it("renders raw SVG written straight into the prose", async () => {
    const container = await say(`Here is the chart:\n\n${SVG}\n\nAnd after.`);
    expect(container.querySelectorAll("svg circle")).toHaveLength(1);
    expect(container.textContent).toContain("Here is the chart:");
    expect(container.textContent).toContain("And after.");
  });

  it("renders an ```svg fence as a drawing, not as code", async () => {
    const container = await say(["```svg", SVG, "```"].join("\n"));
    expect(container.querySelectorAll("svg circle")).toHaveLength(1);
    expect(container.querySelector("pre")).toBeNull();
  });

  it("keeps the drawing but drops script and event handlers", async () => {
    const evil = `<svg viewBox="0 0 10 10"><script>globalThis.__pwned = 1</script><circle cx="5" cy="5" r="4" onclick="globalThis.__pwned = 2"/></svg>`;
    const container = await say(`chart:\n\n${evil}`);
    expect(container.querySelectorAll("svg circle")).toHaveLength(1);
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("[onclick]")).toBeNull();
    expect(container.innerHTML).not.toContain("__pwned");
  });

  it("drops foreignObject, which would smuggle arbitrary HTML back in", async () => {
    const smuggle = `<svg viewBox="0 0 10 10"><foreignObject><iframe src="https://evil.test"></iframe></foreignObject><circle cx="5" cy="5" r="4"/></svg>`;
    const container = await say(smuggle);
    expect(container.querySelector("iframe")).toBeNull();
    expect(container.querySelector("foreignObject")).toBeNull();
  });

  it("does not let an SVG link carry a javascript: url", async () => {
    const link = `<svg viewBox="0 0 10 10"><a href="javascript:globalThis.__pwned=3"><circle cx="5" cy="5" r="4"/></a></svg>`;
    const container = await say(link);
    const a = container.querySelector("svg a");
    expect(a?.getAttribute("href") ?? "").not.toContain("javascript:");
  });

  /**
   * hast property names, not attribute names: `stroke-width` arrives as
   * `strokeWidth`. Naming one wrong in the schema strips it silently, and
   * the chart still "renders" — just with no axes, no labels and no fill.
   * This is a slice of a chart the agent actually produced.
   */
  it("keeps the attributes a real chart is drawn with", async () => {
    const chart = [
      '<svg viewBox="0 0 750 400" width="100%" height="400" xmlns="http://www.w3.org/2000/svg" style="background-color: #fcfcfc; font-family: Helvetica">',
      '<text x="375" y="30" text-anchor="middle" font-size="18" font-weight="bold" fill="#2c3e50">Monthly Spend</text>',
      '<line x1="60" y1="284" x2="710" y2="284" stroke="#e2e8f0" stroke-width="1" stroke-dasharray="4,4"/>',
      '<rect x="69" y="284" width="27" height="55" rx="4" ry="4" fill="#3498db" opacity="0.85"><title>2023-11: $118.04</title></rect>',
      '<text x="83" y="358" transform="rotate(25, 83, 358)" fill="#64748b">2023-11</text>',
      "</svg>",
    ].join("");
    const container = await say(chart);

    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("viewBox")).toBe("0 0 750 400");
    expect(svg.getAttribute("style")).toContain("background-color");

    const label = container.querySelector("text")!;
    expect(label.getAttribute("text-anchor")).toBe("middle");
    expect(label.getAttribute("font-size")).toBe("18");
    expect(label.getAttribute("font-weight")).toBe("bold");
    expect(label.getAttribute("fill")).toBe("#2c3e50");

    const grid = container.querySelector("line")!;
    expect(grid.getAttribute("stroke-width")).toBe("1");
    // hast parses dasharray as a list and re-serializes it space-separated;
    // SVG accepts either separator, so this is the same dashes on screen.
    expect(grid.getAttribute("stroke-dasharray")).toBe("4 4");

    const bar = container.querySelector("rect")!;
    expect(bar.getAttribute("rx")).toBe("4");
    expect(bar.getAttribute("opacity")).toBe("0.85");
    // The <title> is the hover tooltip on each bar.
    expect(bar.querySelector("title")?.textContent).toContain("$118.04");

    const rotated = container.querySelectorAll("text")[1];
    expect(rotated.getAttribute("transform")).toBe("rotate(25, 83, 358)");
  });

  it("still renders ordinary prose and code fences", async () => {
    const container = await say("# Title\n\nsome **text**\n\n```js\nconst a = 1;\n```");
    expect(container.querySelector("h1")?.textContent).toBe("Title");
    expect(container.querySelector("strong")?.textContent).toBe("text");
    expect(container.querySelector("pre")).not.toBeNull();
  });
});
