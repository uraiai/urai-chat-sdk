import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  // 5178 keeps this clear of react-demo (5173), vue-demo (5174) and
  // svelte-demo (5175). Add this exact origin to the widget's allowed
  // origins or every request 403s.
  server: { port: 5178 },
});
