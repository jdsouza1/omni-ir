import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    vue({
      // <omni-screen> and the app's own components are custom elements, not Vue components.
      template: { compilerOptions: { isCustomElement: (tag) => tag === "omni-screen" || tag.startsWith("demo-") } },
    }),
  ],
});
