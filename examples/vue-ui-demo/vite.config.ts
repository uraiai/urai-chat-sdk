import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [vue()],
  // 5179 keeps this clear of react-demo (5173), the local chat service
  // (5174), svelte-demo (5175), vue-demo (5177) and react-ui-demo (5178).
  // Add this exact origin to the widget's allowed origins or every request
  // 403s.
  server: { port: 5179 },
});
