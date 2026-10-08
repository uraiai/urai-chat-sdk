import { defineConfig } from "tsup";

export default defineConfig({
  entry: { index: "src/index.ts", ui: "src/ui/index.ts" },
  format: ["esm"],
  dts: true,
  sourcemap: true,
  clean: true,
  target: "es2022",
  external: ["vue", "@uraiai/chat-widget-core"],
  // The stylesheet is generated from the same source the runtime injector
  // uses, so the imported and the auto-injected CSS can never diverge.
  onSuccess: "node scripts/build-css.mjs",
});
