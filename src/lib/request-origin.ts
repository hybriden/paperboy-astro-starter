/**
 * The origin a request REALLY arrived on — for decisions about where it came
 * from (is this our own form posting, or another site's?).
 *
 * `context.url.origin` is the origin the Node server saw, and behind a
 * TLS-terminating proxy (Cloudflare, cloudflared, nginx, a load balancer) that
 * is `http://` because the proxy terminates HTTPS and forwards plain HTTP. The
 * browser, meanwhile, sends `Origin: https://…`. Comparing the two rejects the
 * site's own visitors: deployed behind cloudflared, every form submission
 * answered 403 "Cross-site POST form submissions are forbidden".
 *
 * Only the SCHEME comes from a forwarded header. The host stays the one the
 * server resolved — taking it from `x-forwarded-host` would let anyone able to
 * reach this app directly declare which origin counts as ours. Correcting the
 * scheme cannot be abused that way: the worst a spoofed value achieves is
 * claiming a scheme the site is already reachable on, and a browser cannot set
 * the header on a cross-site form post at all.
 *
 * Adapters that receive a real `Request` (Cloudflare, Vercel, Netlify) already
 * know the scheme; there the forwarded header is absent and this returns
 * `context.url.origin` unchanged.
 */
export function requestOrigin(context: { url: URL; request: Request }): string {
  // First value only: a chain through two proxies reads "https, http".
  const forwarded = context.request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
  const scheme = forwarded === "https" || forwarded === "http" ? forwarded : context.url.protocol.replace(":", "");
  return `${scheme}://${context.url.host}`;
}
