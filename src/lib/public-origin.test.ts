import { describe, expect, it } from "vitest";
import { publicOrigin } from "./public-origin";

/** A stand-in for the bits of APIContext / Astro this reads. */
const ctx = (url: string, headers: Record<string, string> = {}, site?: string) => ({
  url: new URL(url),
  request: new Request(url, { headers }),
  site: site ? new URL(site) : undefined,
});

describe("publicOrigin", () => {
  it("corrects the scheme behind a TLS-terminating proxy", () => {
    // The bug this exists for: deployed behind cloudflared, the server sees
    // http:// and the site advertised http:// URLs in og:url and sitemap.xml
    // while its canonical tag correctly said https://.
    expect(publicOrigin(ctx("http://demo.example/", { "x-forwarded-proto": "https" }))).toBe("https://demo.example");
  });

  it("keeps the request's own host, never the forwarded one", () => {
    // Taking the host from a forwarded header would let anyone who can reach
    // this app directly put their domain in our sitemap.
    expect(
      publicOrigin(ctx("http://demo.example/", { "x-forwarded-proto": "https", "x-forwarded-host": "evil.example" })),
    ).toBe("https://demo.example");
  });

  it("reads the first value when the chain has two proxies", () => {
    expect(publicOrigin(ctx("http://demo.example/", { "x-forwarded-proto": "https, http" }))).toBe("https://demo.example");
  });

  it("ignores a forwarded scheme that is not a scheme", () => {
    expect(publicOrigin(ctx("http://demo.example/", { "x-forwarded-proto": "javascript" }))).toBe("http://demo.example");
  });

  it("falls back to the request when nothing is forwarded", () => {
    expect(publicOrigin(ctx("https://demo.example/some/page"))).toBe("https://demo.example");
  });

  it("keeps a non-default port", () => {
    expect(publicOrigin(ctx("http://localhost:4321/"))).toBe("http://localhost:4321");
  });

  it("prefers Astro's configured site over the request", () => {
    expect(publicOrigin(ctx("http://internal:4321/", {}, "https://www.example.no"))).toBe("https://www.example.no");
  });

  it("PUBLIC_SITE_URL wins over everything, and loses its trailing slash", () => {
    // Explicit beats inferred: set it and nothing is guessed.
    const env = { PUBLIC_SITE_URL: "https://demo.example/" };
    expect(publicOrigin(ctx("http://internal:4321/", { "x-forwarded-proto": "http" }, "https://other.example"), env)).toBe(
      "https://demo.example",
    );
  });
});
