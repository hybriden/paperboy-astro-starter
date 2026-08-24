import { defineConfig } from "astro/config";
import node from "@astrojs/node";

// SSR, not a static build: preview has to decide per REQUEST whether the caller
// holds a valid preview credential, and drafts must never be baked into a
// deployed artifact. Swap the adapter for your host — @astrojs/cloudflare,
// @astrojs/vercel, @astrojs/netlify — nothing else here is host-specific.
export default defineConfig({
  output: "server",
  adapter: node({ mode: "standalone" }),
  devToolbar: { enabled: false },
});
