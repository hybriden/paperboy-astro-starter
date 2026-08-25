import { describe, expect, it } from "vitest";
import { anchorSlug, assignAnchors, headingOf, RESERVED_ANCHORS } from "./anchor";

describe("anchorSlug", () => {
  it("turns a heading into something an editor can type", () => {
    expect(anchorSlug("Frequently asked questions")).toBe("frequently-asked-questions");
    expect(anchorSlug("FAQ")).toBe("faq");
  });

  it("transliterates Norwegian letters instead of stripping them", () => {
    // "v-re-l-sninger" is what you get from stripping, and it is unguessable.
    expect(anchorSlug("Våre løsninger")).toBe("vare-losninger");
    expect(anchorSlug("Ærlig talt")).toBe("aerlig-talt");
  });

  it("strips accents rather than mangling them", () => {
    expect(anchorSlug("Café notes")).toBe("cafe-notes");
  });

  it("collapses punctuation and trims the edges", () => {
    expect(anchorSlug("  What we do — really!  ")).toBe("what-we-do-really");
    expect(anchorSlug("Q&A / support")).toBe("q-a-support");
  });

  it("is empty when there is nothing to slug", () => {
    // An emoji-only heading has no anchor, and inventing one would be worse.
    expect(anchorSlug("🎉")).toBe("");
    expect(anchorSlug("   ")).toBe("");
  });

  it("truncates at a word boundary", () => {
    const long = "This is a deliberately long section heading that will not fit inside the limit at all";
    const slug = anchorSlug(long);
    expect(slug.length).toBeLessThanOrEqual(60);
    expect(slug.endsWith("-")).toBe(false);
    // cut between words, not mid-word
    expect(long.toLowerCase()).toContain(slug.split("-").slice(-1)[0]);
  });
});

describe("assignAnchors", () => {
  it("gives each block its heading's slug, in order", () => {
    expect(assignAnchors(["Hero", "What we do", "Contact"])).toEqual(["hero", "what-we-do", "contact"]);
  });

  it("leaves a block with no heading without an id", () => {
    // A positional id would move the moment blocks are reordered, so a section
    // nobody can name is better off with no anchor at all.
    expect(assignAnchors(["Hero", undefined, "Contact"])).toEqual(["hero", undefined, "contact"]);
  });

  it("suffixes duplicates and never moves the first one", () => {
    expect(assignAnchors(["Contact", "Contact", "Contact"])).toEqual(["contact", "contact-2", "contact-3"]);
  });

  it("refuses the page's own ids", () => {
    // A section headed "Main" taking id="main" would break the skip link.
    expect(assignAnchors(["Main"])).toEqual(["main-2"]);
    expect(RESERVED_ANCHORS).toContain("main");
  });

  it("treats a heading that slugs to nothing as headingless", () => {
    expect(assignAnchors(["🎉", "Contact"])).toEqual([undefined, "contact"]);
  });
});

describe("headingOf", () => {
  it("prefers heading, then title, then topic, then question", () => {
    expect(headingOf({ heading: "H", title: "T" })).toBe("H");
    expect(headingOf({ title: "T", topic: "P" })).toBe("T");
    expect(headingOf({ topic: "P", question: "Q" })).toBe("P");
    expect(headingOf({ question: "Q" })).toBe("Q");
  });

  it("ignores blank and non-string values", () => {
    expect(headingOf({ heading: "   ", title: "Real" })).toBe("Real");
    expect(headingOf({ heading: 42, title: "Real" })).toBe("Real");
    expect(headingOf({ body: "not a heading" })).toBeUndefined();
  });
});
