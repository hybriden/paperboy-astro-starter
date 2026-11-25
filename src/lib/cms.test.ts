import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { isPreview, withPreview } from "./cms";

/**
 * `isPreview()` decides which delivery key this app uses, so it decides whether a
 * request can read unpublished content. It is the security boundary of the whole
 * site — hence tests.
 *
 * The HMAC itself is verified inside `@paperboycms/client/preview-token` and
 * tested there. What is tested HERE is the wiring this app owns: that a token
 * arrives on `?pbt=`, that the raw secret is still accepted on `?pb=`, and that
 * everything else fails closed. Tokens are signed with `node:crypto` the way the
 * CMS signs them (`<expiryEpochMs>.<hmac-sha256-hex>` over the expiry string).
 */

const SECRET = "test-preview-secret";
const env = { PREVIEW_SECRET: SECRET };
const sign = (secret: string, exp: number) =>
  `${exp}.${createHmac("sha256", secret).update(String(exp)).digest("hex")}`;
const at = (qs: string) => new URL(`https://example.com/some/page${qs}`);
// The `?pbs=` site proof, as the CMS signs it (signSiteProof): `<siteId>.<hmac>`
// over `site.<expiry>.<siteId>`, tied to the token's expiry.
const proof = (secret: string, exp: number, site: string) =>
  `${site}.${createHmac("sha256", secret).update(`site.${exp}.${site}`).digest("hex")}`;

describe("isPreview", () => {
  it("accepts a valid, unexpired ?pbt= token", async () => {
    expect(await isPreview(at(`?pbt=${sign(SECRET, Date.now() + 60_000)}`), env)).toBe(true);
  });

  it("rejects an expired token", async () => {
    expect(await isPreview(at(`?pbt=${sign(SECRET, Date.now() - 1)}`), env)).toBe(false);
  });

  it("rejects a token signed with another secret, and a forged one", async () => {
    expect(await isPreview(at(`?pbt=${sign("other-secret", Date.now() + 60_000)}`), env)).toBe(false);
    expect(await isPreview(at(`?pbt=${Date.now() + 60_000}.${"0".repeat(64)}`), env)).toBe(false);
  });

  it("accepts the raw secret on ?pb= for server-side callers", async () => {
    expect(await isPreview(at(`?pb=${SECRET}`), env)).toBe(true);
    expect(await isPreview(at("?pb=wrong"), env)).toBe(false);
  });

  it("treats a request with no credential as public", async () => {
    expect(await isPreview(at(""), env)).toBe(false);
    expect(await isPreview(at("?pbt=&pb="), env)).toBe(false);
  });

  it("authorises nothing when PREVIEW_SECRET is unset", async () => {
    // A deploy that forgot the variable must serve published content only, rather
    // than accepting tokens anyone can mint against the empty string.
    vi.stubEnv("PREVIEW_SECRET", "");
    expect(await isPreview(at(`?pbt=${sign("", Date.now() + 60_000)}`), {})).toBe(false);
    expect(await isPreview(at("?pb="), {})).toBe(false);
    vi.unstubAllEnvs();
  });
});

describe("isPreview with PAPERBOY_SITE_ID (multi-site instance)", () => {
  // One PREVIEW_SECRET signs every site's tokens, so without a site check a token
  // minted by someone who may only preview site A opens site B's drafts (#173).
  const siteEnv = { PREVIEW_SECRET: SECRET, PAPERBOY_SITE_ID: "site_b" };
  const exp = Date.now() + 60_000;

  it("accepts a token minted in this site", async () => {
    expect(await isPreview(at(`?pbt=${sign(SECRET, exp)}&pbs=${proof(SECRET, exp, "site_b")}`), siteEnv)).toBe(true);
  });

  it("refuses a token minted in another site", async () => {
    expect(await isPreview(at(`?pbt=${sign(SECRET, exp)}&pbs=${proof(SECRET, exp, "site_a")}`), siteEnv)).toBe(false);
  });

  it("refuses a token with no site proof", async () => {
    expect(await isPreview(at(`?pbt=${sign(SECRET, exp)}`), siteEnv)).toBe(false);
  });

  it("still accepts the raw secret on ?pb=", async () => {
    expect(await isPreview(at(`?pb=${SECRET}`), siteEnv)).toBe(true);
  });
});

describe("withPreview", () => {
  it("carries the credential across internal links while previewing", () => {
    const url = at("?pbt=abc.def");
    expect(withPreview("/about", url)).toBe("/about?pbt=abc.def");
    // Otherwise clicking a link in the admin's preview pane silently lands you on
    // the published site.
    expect(withPreview("/about", at("?pb=s3cret"))).toBe("/about?pb=s3cret");
  });

  it("carries the site proof with the token, or a site-checking frontend drops preview on the next click", () => {
    expect(withPreview("/about", at("?pbt=abc.def&pbs=site_b.123"))).toBe("/about?pbt=abc.def&pbs=site_b.123");
  });

  it("leaves links alone when not previewing, and never rewrites external ones", () => {
    expect(withPreview("/about", at(""))).toBe("/about");
    expect(withPreview("https://elsewhere.example/x", at("?pbt=abc.def"))).toBe("https://elsewhere.example/x");
  });
});
