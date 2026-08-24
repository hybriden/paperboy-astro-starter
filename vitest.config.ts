/// <reference types="vitest/config" />
import { getViteConfig } from "astro/config";

/**
 * Routing the test config through `getViteConfig` wires up Astro's own Vite
 * plugins, which is what lets a test import a `.astro` component and render it
 * with the Container API. Without it, Vite tries to parse `.astro` as JavaScript
 * and every component test fails at import time.
 *
 * Plain `src/lib` unit tests run under the same config unchanged.
 */
export default getViteConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "scripts/**/*.test.ts"],
  },
});
