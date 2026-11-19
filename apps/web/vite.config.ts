import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Dev mode: run the server with OFFICE_DEV_ORIGIN=http://localhost:5173 and open
// http://localhost:5173/?token=<token printed by the server>.
const serverPort = process.env.OFFICE_PORT ?? "4317";

export default defineConfig({
  plugins: [react()],
  build: { outDir: "dist", emptyOutDir: true, chunkSizeWarningLimit: 1500 },
  server: {
    proxy: {
      "/api": { target: `http://127.0.0.1:${serverPort}`, changeOrigin: true },
      "/ws": { target: `ws://127.0.0.1:${serverPort}`, ws: true, changeOrigin: true },
    },
  },
});
