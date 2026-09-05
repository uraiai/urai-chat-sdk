/**
 * jsdom, not the repo-default happy-dom: happy-dom's DOMParser drops the
 * first top-level element out of a DOMPurify sanitize, which mangles every
 * assertion about the rendered markup.
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
