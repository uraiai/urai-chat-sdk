import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vitest/config";

/**
 * One project per environment, rather than one global config.
 *
 * Two reasons this is worth the extra lines:
 *
 * - The headless models are pure, so they run under `node` — no DOM to
 *   build up and tear down per file.
 * - happy-dom's DOMParser drops the first top-level element out of a
 *   DOMPurify sanitize, which breaks any assertion about rendered
 *   markup. Anything that renders markdown gets jsdom; happy-dom is
 *   kept only where it is already proven and never touches DOMPurify.
 *
 * The svelte plugin and the browser resolve condition are also scoped to
 * the one project that needs them; previously they loaded for every file
 * in the repo.
 */
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "core-headless",
          environment: "node",
          include: ["packages/chat-widget-core/tests/headless/**/*.test.ts"],
        },
      },
      {
        test: {
          name: "core",
          environment: "jsdom",
          include: ["packages/chat-widget-core/tests/*.test.ts"],
        },
      },
      {
        test: {
          name: "react",
          environment: "jsdom",
          include: ["packages/chat-widget-react/tests/**/*.test.{ts,tsx}"],
        },
      },
      {
        test: {
          name: "vue",
          environment: "happy-dom",
          include: ["packages/chat-widget-vue/tests/**/*.test.ts"],
        },
      },
      {
        plugins: [svelte()],
        resolve: {
          // Svelte ships separate client/server builds; tests run in a
          // DOM environment and need the client build for mount()/unmount().
          conditions: ["browser"],
        },
        test: {
          name: "svelte",
          environment: "happy-dom",
          include: ["packages/chat-widget-svelte/tests/**/*.test.ts"],
        },
      },
    ],
  },
});
