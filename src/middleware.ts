import type { APIContext, MiddlewareHandler, MiddlewareNext } from "astro";
import { VISITOR_COOKIE, VISITOR_COOKIE_MAX_AGE, visitorCookieAction } from "./lib/ab";
import { requestOrigin } from "./lib/request-origin";

/**
 * Astro's cross-site form guard, re-checked against the origin the request
 * really arrived on.
 *
 * Astro ships this rule itself (`security.checkOrigin`, on by default), but it
 * compares the browser's `Origin` header with `context.url.origin` — and the
 * Node adapter builds that URL from the socket, which is plain HTTP behind a
 * TLS-terminating proxy. Every real submission therefore looked cross-site and
 * got a 403, so the config turns the built-in check off and this restores it
 * with the scheme corrected. The rule below is deliberately Astro's, unchanged:
 * a form-encoded write with a foreign (or missing) origin is refused, and
 * anything a browser cannot send cross-site without a preflight is left to CORS.
 */

/** Content types a browser can post cross-site without asking permission first. */
const FORM_CONTENT_TYPES = ["application/x-www-form-urlencoded", "multipart/form-data", "text/plain"];
const SAFE_METHODS = ["GET", "HEAD", "OPTIONS"];

function isForbiddenCrossOriginRequest(context: APIContext): boolean {
  if (context.isPrerendered) return false;
  if (SAFE_METHODS.includes(context.request.method)) return false;

  const isSameOrigin = context.request.headers.get("origin") === requestOrigin(context);
  const contentType = context.request.headers.get("content-type")?.toLowerCase();
  if (contentType) return FORM_CONTENT_TYPES.some((type) => contentType.includes(type)) && !isSameOrigin;
  return !isSameOrigin;
}

export const onRequest: MiddlewareHandler = (context: APIContext, next: MiddlewareNext) => {
  if (isForbiddenCrossOriginRequest(context)) {
    return new Response(`Cross-site ${context.request.method} form submissions are forbidden`, { status: 403 });
  }
  if (!context.isPrerendered) syncVisitorCookie(context);
  return next();
};

/**
 * A/B consent mode: mint `pb_vid` (set before the page renders, so this very
 * render already reads it) while the visitor consents; drop it once consent is
 * gone. See src/lib/ab.ts.
 */
function syncVisitorCookie(context: APIContext): void {
  const env = (context.locals as { runtime?: { env?: Record<string, string | undefined> } }).runtime?.env;
  const action = visitorCookieAction(context.cookies, env);
  if (action === "set") {
    context.cookies.set(VISITOR_COOKIE, crypto.randomUUID(), {
      maxAge: VISITOR_COOKIE_MAX_AGE,
      sameSite: "lax",
      httpOnly: true,
      path: "/",
      secure: requestOrigin(context).startsWith("https:"),
    });
  } else if (action === "delete") {
    context.cookies.delete(VISITOR_COOKIE, { path: "/" });
  }
}
