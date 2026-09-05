// Emits dist/styles.css from the same source the runtime injector uses,
// so the imported and the auto-injected stylesheet can never diverge.
import { mkdir, writeFile } from "node:fs/promises";
import { stylesheet } from "../dist/ui.js";

await mkdir(new URL("../dist/", import.meta.url), { recursive: true });
await writeFile(
  new URL("../dist/styles.css", import.meta.url),
  `.urai-root { --urai-styles: 1; }\n${stylesheet()}\n`,
  "utf8",
);
console.log("CSS  dist/styles.css");
