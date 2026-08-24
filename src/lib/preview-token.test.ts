import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { constantTimeEqual, verifyPreviewToken } from "./preview-token";

/**
 * This is the security boundary of the whole app: a caller who gets past it
 * reads unpublished content. The tests sign tokens the way the CMS does
 * (`<expiryEpochMs>.<hmac-sha256-hex>` over the expiry string) so a drift in
 * either implementation shows up here rather than as drafts on a public site.
 */

const SECRET = "test-preview-secret";
const sign = (secret: string, exp: number) =>
  `${exp}.${createHmac("sha256", secret).update(String(exp)).digest("hex")}`;

describe("verifyPreviewToken", () => {
  it("accepts a token the CMS signed and that has not expired", async () => {
    const token = sign(SECRET, Date.now() + 60_000);
    expect(await verifyPreviewToken(SECRET, token)).toBe(true);
  });

  it("rejects an expired token even though its signature is valid", async () => {
    const token = sign(SECRET, Date.now() - 1);
    expect(await verifyPreviewToken(SECRET, token)).toBe(false);
  });

  it("rejects a tampered signature", async () => {
    const token = sign(SECRET, Date.now() + 60_000);
    const tampered = `${token.slice(0, -1)}${token.endsWith("0") ? "1" : "0"}`;
    expect(await verifyPreviewToken(SECRET, tampered)).toBe(false);
  });

  it("rejects a token signed with a different secret", async () => {
    const token = sign("some-other-secret", Date.now() + 60_000);
    expect(await verifyPreviewToken(SECRET, token)).toBe(false);
  });

  it("rejects an expiry with no signature at all", async () => {
    // The obvious forgery: claim a far-future expiry and hope nobody checks.
    expect(await verifyPreviewToken(SECRET, `${Date.now() + 60_000}.`)).toBe(false);
    expect(await verifyPreviewToken(SECRET, String(Date.now() + 60_000))).toBe(false);
  });

  it("fails closed on malformed input and on a missing secret", async () => {
    for (const bad of ["", ".", "abc.def", "12x3.aabb", "-1.aabb", null, undefined]) {
      expect(await verifyPreviewToken(SECRET, bad as string | null), String(bad)).toBe(false);
    }
    // An unset PREVIEW_SECRET must never authorise anything.
    expect(await verifyPreviewToken("", sign("", Date.now() + 60_000))).toBe(false);
  });

  it("checks the signature BEFORE the expiry", async () => {
    // Otherwise the response tells an attacker whether a guessed expiry is in
    // range, which is a free oracle on the token format.
    const unsigned = `${Date.now() + 60_000}.${"0".repeat(64)}`;
    expect(await verifyPreviewToken(SECRET, unsigned)).toBe(false);
  });
});

describe("constantTimeEqual", () => {
  it("matches identical strings and rejects differences", () => {
    expect(constantTimeEqual("abc", "abc")).toBe(true);
    expect(constantTimeEqual("abc", "abd")).toBe(false);
  });

  it("rejects a length mismatch without reading past the end", () => {
    expect(constantTimeEqual("abc", "abcd")).toBe(false);
    expect(constantTimeEqual("", "a")).toBe(false);
  });
});
