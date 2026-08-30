import { readEnv, type Env } from "./cms";
import { requestOrigin } from "./request-origin";

/**
 * The origin this site is PUBLISHED on — for URLs the site says about itself.
 *
 * `Astro.url.origin` is the origin the server saw, and behind a TLS-terminating
 * proxy (Cloudflare Tunnel, nginx, a load balancer) that is `http://…` because
 * the proxy terminates HTTPS and forwards plain HTTP. Deployed behind
 * cloudflared, this site advertised `http://` in `og:url` and in every
 * `sitemap.xml` entry while the canonical tag — which comes from the CMS's own
 * `canonicalBaseUrl` — correctly said `https://`. A sitemap of URLs on the wrong
 * scheme is a sitemap of redirects at best.
 *
 * Order, most explicit first:
 *   1. PUBLIC_SITE_URL — set it and nothing is guessed. Read at RUNTIME, so one
 *      image serves any environment; that is this app's whole configuration
 *      story and a build-time `site` in astro.config.mjs would break it.
 *   2. Astro's own `site`, if the deployer set it at build time.
 *   3. The request, with the scheme corrected from `x-forwarded-proto`.
 *
 * On (3): see `requestOrigin`, which owns the forwarded-scheme rule.
 *
 * A different question from `requestOrigin`, and not interchangeable with it:
 * this one answers "what do we call ourselves", so a deployer's configured value
 * wins. Where the request came FROM is never configurable — that is
 * `requestOrigin`, and it is what the same-origin checks use.
 */
export function publicOrigin(
  context: { site?: URL | undefined; url: URL; request: Request },
  env?: Env,
): string {
  const configured = readEnv(env, "PUBLIC_SITE_URL");
  if (configured) return trim(configured);

  if (context.site) return trim(context.site.origin);

  return trim(requestOrigin(context));
}

function trim(origin: string): string {
  return origin.replace(/\/+$/, "");
}
