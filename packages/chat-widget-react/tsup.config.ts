import { defineConfig } from "tsup";

export default defineConfig({
  entry: { index: "src/index.tsx", ui: "src/ui/index.tsx" },
  format: ["esm"],
  dts: true,
  sourcemap: true,
  clean: true,
  target: "es2022",
  external: ["react", "react-dom", "@uraiai/chat-widget-core"],
  // The "use client" banner has to land on every emitted file. With
  // splitting on it only reaches the entry chunks, and RSC then breaks
  // on the shared one — the most common packaging bug in this space.
  splitting: false,
  banner: { js: '"use client";' },
  // The stylesheet is generated rather than imported, which keeps
  // esbuild out of the CSS path entirely.
  onSuccess: "node scripts/build-css.mjs",
});
