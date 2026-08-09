/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  base: "./",
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: "auto",
      manifest: false, // we ship our own public/manifest.webmanifest
      // woff2 included so the installed app keeps its type offline rather than falling back
      workbox: { globPatterns: ["**/*.{js,css,html,svg,webmanifest,woff2}"] },
    }),
  ],
  test: {
    environment: "jsdom",
    setupFiles: "./src/test-setup.ts",
    restoreMocks: true,
    // The component tests drive real user gestures through jsdom and routinely take 5-9s
    // each. Against Vitest's 5s default they fail in a different place on every run, which
    // trains you to re-run instead of reading the failure. Raised so a red test means a
    // broken test.
    testTimeout: 20_000,
  },
});
