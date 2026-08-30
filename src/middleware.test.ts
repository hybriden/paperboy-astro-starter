import type { APIContext, MiddlewareNext } from "astro";
import { describe, expect, it } from "vitest";
import { onRequest } from "./middleware";

const next: MiddlewareNext = async () => new Response("rendered", { status: 200 });

/**
 * A request as it actually arrives in production: the browser called
 * `https://demo.example`, cloudflared terminated TLS, and the Node server sees a
 * plain `http://` request carrying `x-forwarded-proto: https`.
 */
const ctx = (
  { method = "POST", origin, contentType = "multipart/form-data; boundary=--x", headers = {}, url = "http://demo.example/api/submit", isPrerendered = false } : {
    method?: string;
    origin?: string;
    contentType?: string | null;
    headers?: Record<string, string>;
    url?: string;
    isPrerendered?: boolean;
  },
) => {
  const all: Record<string, string> = { ...headers };
  if (origin) all.origin = origin;
  if (contentType) all["content-type"] = contentType;
  return { url: new URL(url), request: new Request(url, { method, headers: all }), isPrerendered } as APIContext;
};

describe("the same-origin form guard", () => {
  it("lets the site's own form post through behind a TLS-terminating proxy", async () => {
    // The bug: /contact answered 403 "Cross-site POST form submissions are
    // forbidden" for every visitor, because Astro's built-in check compared the
    // browser's https origin against the http one the Node server saw.
    const res = await onRequest(
      ctx({ origin: "https://demo.example", headers: { "x-forwarded-proto": "https" } }),
      next,
    );
    expect((res as Response).status).toBe(200);
  });

  it("still forbids a genuinely cross-site form post", async () => {
    const res = await onRequest(
      ctx({ origin: "https://evil.example", headers: { "x-forwarded-proto": "https" } }),
      next,
    );
    expect((res as Response).status).toBe(403);
  });

  it("does not let a forwarded host vouch for the origin", async () => {
    // Only the SCHEME comes from a forwarded header; the host stays the one the
    // server resolved, or anyone able to reach the app directly could name it.
    const res = await onRequest(
      ctx({ origin: "https://evil.example", headers: { "x-forwarded-proto": "https", "x-forwarded-host": "evil.example" } }),
      next,
    );
    expect((res as Response).status).toBe(403);
  });

  it("forbids a form post with no origin at all", async () => {
    const res = await onRequest(ctx({ headers: { "x-forwarded-proto": "https" } }), next);
    expect((res as Response).status).toBe(403);
  });

  it("leaves reads alone", async () => {
    const res = await onRequest(ctx({ method: "GET", contentType: null, url: "http://demo.example/contact" }), next);
    expect((res as Response).status).toBe(200);
  });

  it("leaves a cross-origin JSON post to the browser's CORS check", async () => {
    // Same rule Astro applies: a non-form content type cannot be sent
    // cross-origin without a preflight, so blocking it here adds nothing.
    const res = await onRequest(ctx({ origin: "https://evil.example", contentType: "application/json" }), next);
    expect((res as Response).status).toBe(200);
  });

  it("skips prerendered routes", async () => {
    const res = await onRequest(ctx({ origin: "https://evil.example", isPrerendered: true }), next);
    expect((res as Response).status).toBe(200);
  });
});
