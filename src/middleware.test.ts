import type { APIContext, MiddlewareNext } from "astro";
import { afterEach, describe, expect, it, vi } from "vitest";
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
  return { url: new URL(url), request: new Request(url, { method, headers: all }), isPrerendered, cookies: fakeCookies({}), locals: {} } as unknown as APIContext;
};

/** Just enough of AstroCookies to see what the middleware set or deleted. */
const fakeCookies = (initial: Record<string, string>) => {
  const jar = { ...initial };
  const calls: { set?: { value: string; options: Record<string, unknown> }; deleted?: boolean } = {};
  return {
    calls,
    get: (n: string) => (n in jar ? { value: jar[n]! } : undefined),
    set: (n: string, value: string, options: Record<string, unknown>) => { jar[n] = value; calls.set = { value, options }; },
    delete: (n: string) => { delete jar[n]; calls.deleted = true; },
  };
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

describe("the A/B visitor cookie (pb_vid)", () => {
  afterEach(() => vi.unstubAllEnvs());

  const page = (cookies: Record<string, string>, url = "http://demo.example/", headers: Record<string, string> = {}) => {
    const c = ctx({ method: "GET", contentType: null, url, headers });
    const jar = fakeCookies(cookies);
    (c as unknown as { cookies: typeof jar }).cookies = jar;
    return { c, jar };
  };

  it("cookieless (the default) never sets it, and deletes a leftover one", async () => {
    const fresh = page({ pb_consent: "1" });
    await onRequest(fresh.c, next);
    expect(fresh.jar.calls).toEqual({});
    const leftover = page({ pb_vid: "old" });
    await onRequest(leftover.c, next);
    expect(leftover.jar.calls.deleted).toBe(true);
  });

  it("consent mode sets a 13-month, HttpOnly, Lax, first-party id only once the visitor consents", async () => {
    vi.stubEnv("PAPERBOY_AB_MODE", "consent");
    const none = page({});
    await onRequest(none.c, next);
    expect(none.jar.calls).toEqual({});

    const ok = page({ pb_consent: "1" }, "http://demo.example/", { "x-forwarded-proto": "https" });
    await onRequest(ok.c, next);
    expect(ok.jar.calls.set?.value).toMatch(/^[0-9a-f-]{36}$/);
    expect(ok.jar.calls.set?.options).toMatchObject({ maxAge: 60 * 60 * 24 * 395, sameSite: "lax", httpOnly: true, secure: true, path: "/" });
    // The page rendered in this same request already reads it.
    expect(ok.c.cookies.get("pb_vid")?.value).toBe(ok.jar.calls.set?.value);
  });

  it("consent mode deletes it once consent is withdrawn", async () => {
    vi.stubEnv("PAPERBOY_AB_MODE", "consent");
    const gone = page({ pb_vid: "v1", pb_consent: "0" });
    await onRequest(gone.c, next);
    expect(gone.jar.calls.deleted).toBe(true);
  });
});
