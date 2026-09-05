import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    headless: "src/headless/index.ts",
    markdown: "src/markdown.ts",
    theme: "src/theme/index.ts",
  },
  format: ["esm"],
  dts: true,
  sourcemap: true,
  clean: true,
  target: "es2022",
  // Separate entries, not one bundle with tree-shaking hopes: a consumer
  // of `./headless` must not pay for ui.ts (1300 lines) or styles.ts
  // (19KB of CSS string), and `markdown.ts` instantiates `new Marked()`
  // at module scope, which defeats shaking through a prebuilt dist.
  splitting: true,
  // Previously inlined, so an app already using `marked` shipped it
  // twice. Both stay in `dependencies`.
  external: ["marked", "dompurify"],
});
