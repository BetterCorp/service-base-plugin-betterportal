import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { resolve as resolvePath } from "path";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [vue()],

  // [vuestic-ui] Add alias for ~normalize.css.
  resolve: {
    alias: [
      { find: /^~(.*)$/, replacement: "$1" },
      { find: "@", replacement: resolvePath(__dirname, "./src") },
    ],
  },
});
