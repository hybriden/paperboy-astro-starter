import { describe, expect, it } from "vitest";
import { linkState } from "./current-link";

describe("linkState", () => {
  it("marks the exact page", () => {
    expect(linkState("/services", "/services")).toBe("page");
  });

  it("marks an ancestor as a section, not as the page", () => {
    // On an article you are UNDER Journal, not ON it. Two different states, and
    // only one of them is aria-current="page".
    expect(linkState("/journal", "/journal/some-post")).toBe("section");
  });

  it("does not mark Home on every page", () => {
    // "/" is a prefix of everything; ancestor matching without this special case
    // lights up Home permanently.
    expect(linkState("/", "/services")).toBeUndefined();
    expect(linkState("/", "/")).toBe("page");
  });

  it("ignores the locale prefix on either side", () => {
    // The menu says /services; the CMS preview pane frames /en/services. Without
    // this, nothing is ever current inside the preview — where the editor is
    // looking at the menu.
    expect(linkState("/services", "/en/services")).toBe("page");
    expect(linkState("/en/services", "/services")).toBe("page");
    expect(linkState("/nb/tjenester", "/nb/tjenester")).toBe("page");
    expect(linkState("/journal", "/en/journal/post")).toBe("section");
  });

  it("ignores a trailing slash", () => {
    expect(linkState("/services/", "/services")).toBe("page");
    expect(linkState("/services", "/services/")).toBe("page");
  });

  it("ignores a query or fragment on the link", () => {
    expect(linkState("/journal?page=2", "/journal")).toBe("page");
    expect(linkState("/contact#pb-form", "/contact")).toBe("page");
  });

  it("never marks an external link, a mailto or a bare anchor", () => {
    expect(linkState("https://example.com/services", "/services")).toBeUndefined();
    expect(linkState("//example.com/services", "/services")).toBeUndefined();
    expect(linkState("mailto:hei@example.no", "/contact")).toBeUndefined();
    expect(linkState("tel:+4712345678", "/contact")).toBeUndefined();
    expect(linkState("#faq", "/faq")).toBeUndefined();
  });

  it("does not match a sibling that merely shares a prefix", () => {
    // /services-old must not light up "Services".
    expect(linkState("/services", "/services-old")).toBeUndefined();
  });

  it("is undefined for an empty href — an unpublished target", () => {
    expect(linkState("", "/services")).toBeUndefined();
    expect(linkState(undefined, "/services")).toBeUndefined();
  });
});
