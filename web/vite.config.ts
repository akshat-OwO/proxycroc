import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";

// No `nitro` and no `@cloudflare/vite-plugin`: Alchemy's `Cloudflare.Website.Vite`
// drives the Cloudflare build itself and is incompatible with both.
export default defineConfig({
  plugins: [tanstackStart(), viteReact()],
  // Provided by the workerd runtime, never bundled.
  build: { rollupOptions: { external: ["cloudflare:workers"] } },
});
