import { describe, expect, it } from "vitest";
import { backTo, elapsedMs } from "./form-post";

/** A stand-in for the submitted FormData. */
const form = (values: Record<string, string>) => ({
  get: (key: string) => (key in values ? values[key] : null),
});

describe("elapsedMs", () => {
  it("prefers the JS timer when it reports something", () => {
    expect(elapsedMs(form({ pb_elapsed_ms: "4200", pb_rendered_at: String(Date.now() - 60_000) }))).toBe(4200);
  });

  it("falls back to the server-rendered timestamp when the timer says 0", () => {
    // The bug this exists for: a form submitted WITHOUT JavaScript reports 0ms,
    // the CMS reads that as a bot, and a real enquiry was discarded while the
    // visitor was told it had been sent.
    const ms = elapsedMs(form({ pb_elapsed_ms: "0", pb_rendered_at: String(Date.now() - 9000) }));
    expect(ms).toBeGreaterThanOrEqual(9000);
    expect(ms).toBeLessThan(20_000);
  });

  it("returns undefined when it cannot tell, rather than 0", () => {
    // A missing timer is not evidence of a bot; 0 would be read as one.
    expect(elapsedMs(form({}))).toBeUndefined();
    expect(elapsedMs(form({ pb_elapsed_ms: "junk", pb_rendered_at: "junk" }))).toBeUndefined();
    expect(elapsedMs(form({ pb_elapsed_ms: "-5", pb_rendered_at: "0" }))).toBeUndefined();
  });
});

describe("backTo", () => {
  it("prefers the referer, because that is where the browser actually came from", () => {
    // A review found the posted field landing no-JS visitors on "/" — a page with
    // no form, so the submission succeeded and the visitor was told nothing —
    // while the unit test on the field alone stayed green.
    expect(
      backTo(form({ pb_form_id: "f", pb_return_to: "/" }), true, "http://localhost:4321/contact", "http://localhost:4321"),
    ).toBe("/contact?sent=f#pb-form");
  });

  it("falls back to the posted field when there is no referer", () => {
    expect(backTo(form({ pb_form_id: "f", pb_return_to: "/contact" }), true, null, "http://localhost:4321")).toBe(
      "/contact?sent=f#pb-form",
    );
  });

  it("refuses a referer from another origin", () => {
    // Same guard as the posted field: a path only, never a host.
    // Only the path is ever used, so this was never an open redirect — but a
    // cross-origin referer should not choose which of OUR pages you land on.
    expect(
      backTo(form({ pb_form_id: "f", pb_return_to: "/contact" }), true, "https://evil.example/x", "http://localhost:4321"),
    ).toBe("/contact?sent=f#pb-form");
    expect(backTo(form({ pb_form_id: "f" }), true, "not a url", "http://localhost:4321")).toBe("/?sent=f#pb-form");
  });

  it("returns to the page that submitted, with the outcome and the form's token", () => {
    expect(backTo(form({ pb_return_to: "/contact", pb_form_id: "abcdefghijkl" }), true)).toBe(
      "/contact?sent=abcdefgh#pb-form",
    );
    expect(backTo(form({ pb_return_to: "/contact", pb_form_id: "abcdefghijkl" }), false)).toBe(
      "/contact?formError=abcdefgh#pb-form",
    );
  });

  it("refuses to redirect off-site", () => {
    // pb_return_to arrives in the request body. A form endpoint that will send a
    // visitor anywhere they ask is an open redirect.
    for (const hostile of [
      "https://evil.example/phish",
      "//evil.example",
      "\\\\evil.example",
      "javascript:alert(1)",
      "/\\evil.example",
    ]) {
      expect(backTo(form({ pb_return_to: hostile, pb_form_id: "f" }), true), hostile).toBe("/?sent=f#pb-form");
    }
  });

  it("drops any query or fragment the caller tried to smuggle in", () => {
    expect(backTo(form({ pb_return_to: "/contact?sent=forged", pb_form_id: "f" }), false)).toBe(
      "/contact?formError=f#pb-form",
    );
  });

  it("falls back to the site root when nothing was sent", () => {
    expect(backTo(form({}), true)).toBe("/?sent=#pb-form");
  });
});
