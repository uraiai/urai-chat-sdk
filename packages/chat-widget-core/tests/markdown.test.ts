/**
 * Kept explicit even though the `core` project already runs jsdom:
 * happy-dom's DOMParser drops the first top-level element out of a
 * DOMPurify sanitize, which mangles every assertion about rendered
 * markup. The docblock keeps this file correct if it is ever run
 * standalone or moved to another project.
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect } from "vitest";
import { renderMarkdown } from "../src/markdown";

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" fill="red"/></svg>`;

describe("renderMarkdown — inline SVG", () => {
  it("renders an ```svg fence as inline markup, not code", () => {
    const html = renderMarkdown(["Here:", "```svg", SVG, "```"].join("\n"));
    expect(html).toContain('class="ucw-svg"');
    expect(html).toContain("<circle");
    expect(html).not.toContain("<pre");
  });

  it("renders an unlabelled fence whose body is an SVG document", () => {
    const html = renderMarkdown(["```", SVG, "```"].join("\n"));
    expect(html).toContain("<circle");
  });

  it("renders xml/html fences that carry an SVG (with doctype/comments)", () => {
    const body = `<?xml version="1.0"?>\n<!-- drawn by the agent -->\n${SVG}`;
    const html = renderMarkdown(["```xml", body, "```"].join("\n"));
    expect(html).toContain("<circle");
  });

  it("strips scripts and event handlers from the SVG", () => {
    const evil = `<svg viewBox="0 0 10 10"><script>alert(1)</script><circle cx="5" cy="5" r="4" onclick="alert(2)"/></svg>`;
    const html = renderMarkdown(["```svg", evil, "```"].join("\n"));
    expect(html).toContain("<circle");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("onclick");
  });

  it("shows a placeholder while the fence is still streaming", () => {
    const html = renderMarkdown(["```svg", '<svg viewBox="0 0 10 10"><circ'].join("\n"));
    expect(html).toContain("ucw-svg-pending");
    expect(html).not.toContain("<circ");
  });

  it("leaves non-SVG fences as code blocks", () => {
    const html = renderMarkdown(["```html", "<b>hi</b>", "```"].join("\n"));
    expect(html).toContain("<pre");
    expect(html).not.toContain('class="ucw-svg"');
  });

  it("renders SVG in dev mode too", () => {
    const html = renderMarkdown(["```svg", SVG, "```"].join("\n"), { dev: true });
    expect(html).toContain("<circle");
  });

  it("renders multiple SVG fences into their own placeholders", () => {
    const other = SVG.replace("circle", "rect").replace(/cx="5" cy="5" r="4"/, 'width="3" height="3"');
    const html = renderMarkdown(
      ["```svg", SVG, "```", "between", "```svg", other, "```"].join("\n"),
    );
    expect(html).toContain("<circle");
    expect(html).toContain("<rect");
    expect(html).toContain("between");
  });

  it("does not render an SVG fence hidden inside a stripped js-action block", () => {
    const html = renderMarkdown(
      ["```js-action", "// nested", "```svg", SVG, "```", "```"].join("\n"),
    );
    expect(html).not.toContain("<circle");
  });
});

/**
 * The agent writes charts as bare `<svg>` in the message body, with no code
 * fence around them. That markup used to reach the markdown pass, whose
 * DOMPurify HTML profile drops the whole subtree — so the widget showed
 * nothing while the threads chat view, which parses raw HTML into the tree,
 * showed the chart.
 */
describe("renderMarkdown — raw unfenced SVG", () => {
  it("renders an SVG written straight into the prose", () => {
    const html = renderMarkdown(`Here is the chart:\n\n${SVG}\n\nAnd after.`);
    expect(html).toContain('class="ucw-svg"');
    expect(html).toContain("<circle");
    expect(html).toContain("Here is the chart:");
    expect(html).toContain("And after.");
  });

  it("renders an SVG that shares a line with prose", () => {
    const html = renderMarkdown(`before ${SVG} after`);
    expect(html).toContain("<circle");
    expect(html).toContain("before");
    expect(html).toContain("after");
  });

  it("strips scripts and event handlers from raw SVG too", () => {
    const evil = `<svg viewBox="0 0 10 10"><script>alert(1)</script><circle cx="5" cy="5" r="4" onclick="alert(2)"/></svg>`;
    const html = renderMarkdown(`chart:\n\n${evil}`);
    expect(html).toContain("<circle");
    expect(html).not.toContain("alert(1)");
    expect(html).not.toContain("onclick");
  });

  it("keeps the outer element when SVGs are nested", () => {
    const nested = `<svg viewBox="0 0 10 10"><svg><circle cx="5" cy="5" r="4"/></svg></svg>`;
    const html = renderMarkdown(`${nested}\n\ntail`);
    expect(html).toContain("<circle");
    // The trailing prose must survive: taking the first `</svg>` as the end
    // would leave the outer close tag behind as stray text.
    expect(html).toContain("tail");
    expect(html).not.toContain("&lt;/svg&gt;");
  });

  it("shows a pending placeholder while the SVG is still streaming", () => {
    const html = renderMarkdown('intro\n\n<svg viewBox="0 0 10 10"><circ');
    expect(html).toContain("ucw-svg-pending");
    expect(html).toContain("intro");
    expect(html).not.toContain("&lt;circ");
  });

  it("renders several raw SVGs, keeping the prose between them", () => {
    const other = SVG.replace("circle", "rect").replace(
      /cx="5" cy="5" r="4"/,
      'width="3" height="3"',
    );
    const html = renderMarkdown(`${SVG}\n\nbetween\n\n${other}`);
    expect(html).toContain("<circle");
    expect(html).toContain("<rect");
    expect(html).toContain("between");
  });

  it("leaves SVG quoted inside a non-SVG fence as code", () => {
    // The fence body does not *start* with <svg, so it is a quoted sample,
    // not a document to render.
    const html = renderMarkdown(["```html", "<p>hi</p>", SVG, "```"].join("\n"));
    expect(html).toContain("<pre");
    expect(html).not.toContain('class="ucw-svg"');
  });

  it("does not render raw SVG hidden inside a stripped js-action block", () => {
    const html = renderMarkdown(["```js-action", "// draws", SVG, "```"].join("\n"));
    expect(html).not.toContain("<circle");
  });

  it("keeps a code action's own fences inside it when stripping", () => {
    // ```svg carries an info string, so it opens a block rather than closing
    // the js-action one. Ending the strip there spills the rest of the code
    // action into the prose.
    const html = renderMarkdown(
      ["intro", "```js-action", "// nested", "```svg", SVG, "```", "```", "outro"].join("\n"),
    );
    expect(html).not.toContain("<circle");
    expect(html).not.toContain("nested");
    expect(html).toContain("intro");
    expect(html).toContain("outro");
  });

  it("swallows an unterminated js-action block that is still streaming", () => {
    const html = renderMarkdown(["intro", "```js-action", "// half a line", SVG].join("\n"));
    expect(html).not.toContain("<circle");
    expect(html).toContain("intro");
  });
});
