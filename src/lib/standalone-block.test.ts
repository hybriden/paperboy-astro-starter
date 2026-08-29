import { afterEach, describe, expect, it, vi } from "vitest";
import type { Delivered } from "@paperboycms/client";
import { loadStandaloneBlock, standaloneAreaBlock } from "./standalone-block";

/**
 * The standalone block preview route is editor chrome served on the PUBLIC
 * origin, fetched with the PREVIEW key — so the interesting property is not
 * that it renders (templates.test.ts covers rendering) but that it fails
 * closed: no credential means 404 and, crucially, NO fetch. A gate that
 * fetched first would leak drafts by documentId enumeration.
 */

const SECRET = "test-preview-secret";
// A distinct apiUrl per test: `cms()` memoizes clients per (url, key) and the
// client captures globalThis.fetch at creation — one shared URL would leak the
// first test's fetch stub into every later one.
const envFor = (host: string) => ({
  PAPERBOY_API_URL: `https://${host}.example`,
  PAPERBOY_PREVIEW_KEY: "prv_test_key",
  PREVIEW_SECRET: SECRET,
});
const at = (qs: string) => new URL(`https://site.example/en/preview/block/blk1${qs}`);

function delivered(over: Partial<Delivered> = {}): Delivered {
  return {
    documentId: "blk1",
    type: "HeroBlock",
    kind: "block",
    locale: "en",
    name: "A hero",
    slug: null,
    urlPath: null,
    cv: 1,
    data: { title: "Deliver anywhere" },
    fieldTypes: { title: "text" },
    seo: null,
    ...over,
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("standaloneAreaBlock", () => {
  it("wraps a delivered document exactly as a resolved shared-block entry", () => {
    const b = standaloneAreaBlock(delivered({ form: undefined }));
    expect(b.shared).toBe(true);
    expect(b.blockType).toBe("HeroBlock");
    // Everything Blocks.astro reads off a resolved shared entry must be present
    // — documentId (forms post against it), data, fieldTypes, form.
    expect(Object.keys(b.content ?? {}).sort()).toEqual([
      "data",
      "documentId",
      "fieldTypes",
      "form",
      "kind",
      "name",
      "type",
      "urlPath",
    ]);
    expect(b.content?.data).toEqual({ title: "Deliver anywhere" });
  });
});

describe("loadStandaloneBlock", () => {
  it("404s a request with no credential WITHOUT fetching anything", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    expect(await loadStandaloneBlock(at(""), envFor("no-cred"), "blk1", "en")).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("404s a wrong secret WITHOUT fetching anything", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    expect(await loadStandaloneBlock(at("?pb=wrong"), envFor("wrong-cred"), "blk1", "en")).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("fetches with the PREVIEW key once the credential checks out", async () => {
    const doc = delivered();
    const fetchSpy = vi.fn(
      async (_url: string | URL, _init?: RequestInit) =>
        new Response(JSON.stringify(doc), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    vi.stubGlobal("fetch", fetchSpy);

    const got = await loadStandaloneBlock(at(`?pb=${SECRET}`), envFor("happy"), "blk1", "en");
    expect(got?.documentId).toBe("blk1");

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(String(url)).toContain("/content/blk1");
    expect(String(url)).toContain("locale=en");
    // Drafts only exist behind the preview key — the public key here would
    // silently preview stale published content.
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer prv_test_key");
  });

  it("reads an unknown documentId as not-found, not a crash", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 404 })),
    );
    expect(await loadStandaloneBlock(at(`?pb=${SECRET}`), envFor("missing"), "nope", "en")).toBeNull();
  });
});
