import { describe, expect, it } from "vitest";
import { looksLikeLocale, splitLocalePath } from "./routing";

/**
 * The admin frames `{previewUrl}/{locale}{urlPath}`, so getting this wrong means
 * side-by-side editing shows a 404 page — which is exactly what it did before
 * this existed.
 */
describe("looksLikeLocale", () => {
  it("accepts the shapes a locale actually has", () => {
    for (const good of ["en", "nb", "de", "EN", "pt-BR", "en-us"]) {
      expect(looksLikeLocale(good), good).toBe(true);
    }
  });

  it("rejects things that are page slugs", () => {
    for (const bad of ["blog", "a", "english", "en-", "e1", "", undefined, "about-us"]) {
      expect(looksLikeLocale(bad as string | undefined), String(bad)).toBe(false);
    }
  });
});

describe("splitLocalePath", () => {
  it("splits the admin's preview URL for the site root", () => {
    // What the preview pane asks for when editing the start page.
    expect(splitLocalePath("en")).toEqual({ locale: "en", rest: "/", full: "/en" });
  });

  it("splits a locale-prefixed page path", () => {
    expect(splitLocalePath("nb/hjem")).toEqual({ locale: "nb", rest: "/hjem", full: "/nb/hjem" });
    expect(splitLocalePath("en/blog/a-post")).toEqual({
      locale: "en",
      rest: "/blog/a-post",
      full: "/en/blog/a-post",
    });
  });

  it("leaves an unprefixed path alone", () => {
    expect(splitLocalePath("home")).toEqual({ rest: "/home", full: "/home" });
    expect(splitLocalePath("blog/a-post")).toEqual({ rest: "/blog/a-post", full: "/blog/a-post" });
  });

  it("handles the site root and junk", () => {
    expect(splitLocalePath("")).toEqual({ rest: "/", full: "/" });
    expect(splitLocalePath(undefined)).toEqual({ rest: "/", full: "/" });
    expect(splitLocalePath("//home//")).toEqual({ rest: "/home", full: "/home" });
  });

  it("still offers the FULL path for a two-letter slug", () => {
    // /it could be Italian or a page called "it". The caller tries the locale
    // first and falls back to `full`, so both resolve.
    expect(splitLocalePath("it")).toEqual({ locale: "it", rest: "/", full: "/it" });
  });
});
