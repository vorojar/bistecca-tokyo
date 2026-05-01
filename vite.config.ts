import { defineConfig } from "vite";

export default defineConfig({
  base: "/bistecca-tokyo/",
  build: {
    target: "es2022",
    sourcemap: true
  },
  server: {
    host: "127.0.0.1"
  },
  preview: {
    host: "127.0.0.1"
  }
});
