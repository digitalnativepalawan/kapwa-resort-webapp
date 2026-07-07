import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.ico"],
      manifest: {
        name: "TALA — KAPWA OS Resort Concierge",
        short_name: "TALA",
        description: "Voice concierge for KAPWA OS Boutique Resort, San Vicente, Palawan",
        theme_color: "#1C3A4A",
        background_color: "#E9E2D7",
        display: "standalone",
        start_url: "/",
        icons: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
        ],
      },
      workbox: {
        // Offline-first shell: cache the app shell, but never cache live
        // voice/API calls -- those must always hit the network or fail
        // loudly, not serve stale data to a guest.
        globPatterns: ["**/*.{js,css,html,ico,png,svg}"],
        runtimeCaching: [],
      },
    }),
  ],
  server: { port: 5173 },
});
