import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [svelte()],
  resolve: {
    // Svelte ships separate client/server builds; tests run in happy-dom
    // and need the client build for mount()/unmount().
    conditions: ["browser"],
  },
  test: {
    environment: "happy-dom",
    include: ["packages/*/tests/**/*.test.{ts,tsx}"],
  },
});
