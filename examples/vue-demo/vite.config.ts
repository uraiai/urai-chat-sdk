import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [vue()],
  // 5177, not 5174: the local Urai chat service runs on 5174. Add this
  // exact origin to the widget's allowed origins or every request 403s.
  server: { port: 5177 },
});
