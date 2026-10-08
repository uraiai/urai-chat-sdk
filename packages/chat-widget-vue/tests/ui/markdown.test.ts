/**
 * Markdown, SVG, math and tool-call markers in the Vue view.
 *
 * The Vue view renders through the core pipeline (`marked` + DOMPurify +
 * KaTeX MathML), so these mirror the React view's markdown tests against a
 * different renderer: the same inputs must come out drawn, and the same
 * dangerous ones must not.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { enableAutoUnmount } from "@vue/test-utils";
import { h } from "vue";
import { makeFakeTransport } from "@uraiai/chat-test-support";
import { splitStableTail } from "../../src/ui";
import { frame, mountChat, startTurn } from "./helpers";

beforeEach(() => localStorage.clear());
enableAutoUnmount(afterEach);

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" width="100"><circle cx="5" cy="5" r="4" fill="red"/></svg>`;

/**
 * Send a turn, stream `text` back as the assistant's reply, and return the
 * rendered message body — scoped to the markdown part, because the chrome
 * draws its own icon SVGs.
 */
async function say(
  text: string,
  behavior?: Record<string, unknown>,
  extra: Record<string, unknown> = {},
): Promise<HTMLElement> {
  const transport = makeFakeTransport();
  const { wrapper } = mountChat({ transport, props: { behavior, ...extra } });
  const s = await startTurn(wrapper, transport, "chart me");
  s.onChunk?.(text);
  await frame();
  const body = document.querySelector<HTMLElement>('[data-urai-part="markdown"]');
  if (!body) throw new Error("no rendered message body");
  return body;
}

describe("Vue view — inline SVG", () => {
  it("renders raw SVG written straight into the prose", async () => {
    const body = await say(`Here is the chart:\n\n${SVG}\n\nAnd after.`);
    expect(body.querySelectorAll("svg circle")).toHaveLength(1);
    expect(body.textContent).toContain("Here is the chart:");
    expect(body.textContent).toContain("And after.");
  });

  it("renders an ```svg fence as a drawing, not as code", async () => {
    const body = await say(["```svg", SVG, "```"].join("\n"));
    expect(body.querySelectorAll("svg circle")).toHaveLength(1);
    expect(body.querySelector("pre")).toBeNull();
  });

  it("keeps the drawing but drops script and event handlers", async () => {
    const evil = `<svg viewBox="0 0 10 10"><script>globalThis.__pwned = 1</script><circle cx="5" cy="5" r="4" onclick="globalThis.__pwned = 2"/></svg>`;
    const body = await say(`chart:\n\n${evil}`);
    expect(body.querySelectorAll("svg circle")).toHaveLength(1);
    expect(body.querySelector("script")).toBeNull();
    expect(body.querySelector("[onclick]")).toBeNull();
    expect(body.innerHTML).not.toContain("__pwned");
  });

  it("drops foreignObject, which would smuggle arbitrary HTML back in", async () => {
    const smuggle = `<svg viewBox="0 0 10 10"><foreignObject><iframe src="https://evil.test"></iframe></foreignObject><circle cx="5" cy="5" r="4"/></svg>`;
    const body = await say(smuggle);
    expect(body.querySelector("iframe")).toBeNull();
    expect(body.querySelector("foreignObject")).toBeNull();
  });

  it("does not let an SVG link carry a javascript: url", async () => {
    const link = `<svg viewBox="0 0 10 10"><a href="javascript:globalThis.__pwned=3"><circle cx="5" cy="5" r="4"/></a></svg>`;
    const body = await say(link);
    for (const a of Array.from(body.querySelectorAll("a"))) {
      expect(a.getAttribute("href") ?? "").not.toContain("javascript:");
      expect(a.getAttribute("xlink:href") ?? "").not.toContain("javascript:");
    }
  });

  it("keeps the attributes a real chart is drawn with", async () => {
    const chart = [
      '<svg viewBox="0 0 750 400" width="100%" height="400" xmlns="http://www.w3.org/2000/svg">',
      '<text x="375" y="30" text-anchor="middle" font-size="18" font-weight="bold" fill="#2c3e50">Monthly Spend</text>',
      '<line x1="60" y1="284" x2="710" y2="284" stroke="#e2e8f0" stroke-width="1" stroke-dasharray="4,4"/>',
      '<rect x="69" y="284" width="27" height="55" rx="4" ry="4" fill="#3498db" opacity="0.85"><title>2023-11: $118.04</title></rect>',
      '<text x="83" y="358" transform="rotate(25, 83, 358)" fill="#64748b">2023-11</text>',
      "</svg>",
    ].join("");
    const body = await say(chart);

    const svg = body.querySelector("svg")!;
    expect(svg.getAttribute("viewBox")).toBe("0 0 750 400");

    const label = body.querySelector("text")!;
    expect(label.getAttribute("text-anchor")).toBe("middle");
    expect(label.getAttribute("font-size")).toBe("18");
    expect(label.getAttribute("font-weight")).toBe("bold");
    expect(label.getAttribute("fill")).toBe("#2c3e50");

    const grid = body.querySelector("line")!;
    expect(grid.getAttribute("stroke-width")).toBe("1");
    expect(grid.getAttribute("stroke-dasharray")).toBe("4,4");

    const bar = body.querySelector("rect")!;
    expect(bar.getAttribute("rx")).toBe("4");
    expect(bar.getAttribute("opacity")).toBe("0.85");
    expect(bar.querySelector("title")?.textContent).toContain("$118.04");

    const rotated = body.querySelectorAll("text")[1];
    expect(rotated.getAttribute("transform")).toBe("rotate(25, 83, 358)");
  });

  it("still renders ordinary prose and code fences", async () => {
    const body = await say("# Title\n\nsome **text**\n\n```js\nconst a = 1;\n```");
    expect(body.querySelector("h1")?.textContent).toBe("Title");
    expect(body.querySelector("strong")?.textContent).toBe("text");
    expect(body.querySelector("pre")).not.toBeNull();
  });

  it("drops raw HTML that could run script", async () => {
    const body = await say('hello <img src=x onerror="globalThis.__pwned = 1"> <script>x()</script>');
    expect(body.querySelector("[onerror]")).toBeNull();
    expect(body.querySelector("script")).toBeNull();
  });
});

describe("Vue view — tool-call markers", () => {
  const text = [
    "Let me check.",
    '<urai-tool-call id="c1" ord="1"></urai-tool-call>',
    "Done.",
  ].join("\n\n");

  it("renders no card for the marker by default", async () => {
    const body = await say(text);
    expect(body.querySelector('[data-urai-part="tool-call-card"]')).toBeNull();
    expect(body.querySelector("urai-tool-call")).toBeNull();
    expect(body.textContent).toContain("Let me check.");
    expect(body.textContent).toContain("Done.");
  });

  it("renders the card once tool calls are opted in", async () => {
    const body = await say(text, { showToolCalls: true });
    const card = body.querySelector('[data-urai-part="tool-call-card"]')!;
    expect(card).toBeTruthy();
    expect(body.textContent).toContain("Working");
    // In order: text, card, text.
    expect(body.textContent!.indexOf("Let me check.")).toBeLessThan(
      body.textContent!.indexOf("Working"),
    );
    expect(body.textContent!.indexOf("Working")).toBeLessThan(body.textContent!.indexOf("Done."));
  });

  it("lets the ToolCallCard slot replace the card", async () => {
    const body = await say(text, { showToolCalls: true }, {
      components: {
        ToolCallCard: (p: { id?: string }) => h("div", { "data-testid": "my-card" }, `call ${p.id}`),
      },
    });
    expect(body.querySelector('[data-testid="my-card"]')?.textContent).toBe("call c1");
  });
});

describe("Vue view — math", () => {
  it("renders single-dollar inline math as MathML, not raw TeX", async () => {
    const body = await say("Insertion: $O(\\log N)$ — fast.");
    const math = body.querySelector("math");
    expect(math).not.toBeNull();
    expect(math?.getAttribute("display")).not.toBe("block");
    expect(body.textContent).not.toContain("$O(");
  });

  it("renders \\[…\\] as display math", async () => {
    const body = await say("Sum:\n\n\\[ \\sum_{i=1}^n i \\]\n\nDone.");
    expect(body.querySelector('math[display="block"]')).not.toBeNull();
  });

  it("leaves prices as prose", async () => {
    const body = await say("It costs $5 and $10.");
    expect(body.querySelector("math")).toBeNull();
    expect(body.textContent).toContain("$5 and $10");
  });

  it("does not render math inside code", async () => {
    const body = await say("`$x$` stays code");
    expect(body.querySelector("math")).toBeNull();
    expect(body.querySelector("code")?.textContent).toBe("$x$");
  });

  it("still sanitizes raw HTML alongside the math", async () => {
    const body = await say('$x$ <img src=x onerror="globalThis.__pwned = 1">');
    expect(body.querySelector("math")).not.toBeNull();
    expect(body.querySelector("[onerror]")).toBeNull();
  });
});

describe("Vue view — streaming split", () => {
  it("renders the settled prefix and the live tail as separate blocks", async () => {
    const body = await say("First paragraph.\n\nSecond, still stream");
    const blocks = body.querySelectorAll(".urai-markdown-block");
    expect(blocks.length).toBe(2);
    expect(blocks[0].textContent).toContain("First paragraph.");
    expect(blocks[1].textContent).toContain("Second, still stream");
  });

  it("never splits inside an open code fence", () => {
    const { stable, tail } = splitStableTail("intro\n\n```js\nconst a = 1;\n\nconst b = 2;");
    expect(stable).toBe("intro\n\n");
    expect(tail).toBe("```js\nconst a = 1;\n\nconst b = 2;");
  });
});
