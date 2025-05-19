import {nodePolyfills} from "vite-plugin-node-polyfills"
import {visualizer} from "rollup-plugin-visualizer"
import react from "@vitejs/plugin-react"
import {VitePWA} from "vite-plugin-pwa"
import {defineConfig} from "vite"
import config from "config"

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    nodePolyfills(),
    react(),
    VitePWA({
      injectManifest: {
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        globPatterns: ["**/*"],
      },
      strategies: "injectManifest",
      injectRegister: "script",
      manifest: false,
      srcDir: "src",
      filename: "service-worker.ts",
      registerType: "autoUpdate",
      devOptions: {
        enabled: true,
        type: "module",
      },
    }),
    visualizer({
      open: true,
      gzipSize: true,
      filename: "build/stats.html",
    }),
  ],
  resolve: {
    alias: {
      "@": "/src",
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: [
            "react",
            "react-dom/client",
            "react-router",
            "react-helmet",
            "@nostr-dev-kit/ndk",
            "markdown-to-jsx",
            "@remixicon/react",
            "minidenticons",
            "nostr-tools",
            "irisdb/src",
            "irisdb-hooks/src",
            "irisdb-nostr",
            "lodash",
            "lodash/debounce",
            "lodash/throttle",
            "localforage",
            "@noble/hashes",
            "@nostr-dev-kit/ndk-cache-dexie",
            "nostr-double-ratchet/src",
            "nostr-social-graph",
            "classnames",
            "fuse.js",
            "react-string-replace",
            "react-swipeable",
          ],
        },
      },
    },
    assetsDir: "assets",
    copyPublicDir: true,
  },
  define: {
    CONFIG: config,
    global: {}, // needed for custom-event lib
    "import.meta.env.VITE_APP_VERSION": JSON.stringify(process.env.npm_package_version),
    "import.meta.env.VITE_BUILD_TIME": JSON.stringify(new Date().toISOString()),
  },
  server: {
    proxy: {
      "/cashu": {
        target: "http://127.0.0.1:8080", // Serve cashu.me here for development
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/cashu/, ""),
      },
      "/user": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
      "/subscriptions": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
      "/invoices": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
      "/.well-known": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
    },
    allowedHosts: [
      "0c50-79-134-105-132.ngrok-free.app",
      ".ngrok-free.app" // This will allow all ngrok-free.app subdomains
    ],
  },
})
