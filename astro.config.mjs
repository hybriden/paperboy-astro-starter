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
  // Astro's built-in cross-site form guard compares the browser's Origin header
  // against the URL the Node adapter built from the socket — which is http://
  // behind a TLS-terminating proxy, so it 403s the site's own form posts.
  // src/middleware.ts runs the identical rule against the forwarded scheme; do
  // not drop it if you re-enable this.
  security: { checkOrigin: false },
});
