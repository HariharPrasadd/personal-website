import { cp, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

// Excalidraw's fonts live in its package, so copy them into our self-hosted build.
function copyExcalidrawFonts(): Plugin {
  return {
    name: "copy-excalidraw-fonts",
    async closeBundle() {
      const source = resolve("node_modules/@excalidraw/excalidraw/dist/prod/fonts");
      const destination = resolve("dist/fonts");
      await mkdir(destination, { recursive: true });
      await cp(source, destination, { recursive: true });
    },
  };
}

export default defineConfig({
  plugins: [react(), copyExcalidrawFonts()],
});
