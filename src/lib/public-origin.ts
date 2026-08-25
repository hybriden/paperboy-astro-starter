import { readEnv, type Env } from "./cms";

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
 * On (3): only the SCHEME comes from a forwarded header. The host stays the one
 * Astro resolved, exactly as before — taking the host from `x-forwarded-host`
 * would let anyone who can reach this app directly put their own domain in your
 * sitemap. Correcting only the scheme cannot be abused that way: the worst a
 * spoofed value achieves is claiming a scheme you are already reachable on.
 *
 * NOT for access decisions. The same-origin Referer check in api/submit.ts
 * deliberately keeps using `context.url.origin`, because there the question is
 * "where did this request really come from", and a forwarded header is the
 * caller's opinion rather than the answer.
 */
export function publicOrigin(
  context: { site?: URL | undefined; url: URL; request: Request },
  env?: Env,
): string {
  const configured = readEnv(env, "PUBLIC_SITE_URL");
  if (configured) return trim(configured);

  if (context.site) return trim(context.site.origin);

  // First value only: a chain through two proxies reads "https, http".
  const forwarded = context.request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
  const scheme = forwarded === "https" || forwarded === "http" ? forwarded : context.url.protocol.replace(":", "");
  return trim(`${scheme}://${context.url.host}`);
}

function trim(origin: string): string {
  return origin.replace(/\/+$/, "");
}
