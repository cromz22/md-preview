import { defineConfig } from "vite";

export default defineConfig({
  root: "output",
  publicDir: false,
  server: {
    host: "0.0.0.0",
    watch: {
      ignored: ["!**/output/**"]
    }
  }
});
