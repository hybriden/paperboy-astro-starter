import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { describe, expect, it } from "vitest";
import Blocks from "./Blocks.astro";
import { ALL_BLOCKS, ACCORDION, FORM_BLOCK, HERO, LINK_ITEMS, PAGE_TEASER, UNKNOWN_BLOCK } from "../lib/fixtures";

/**
 * Every built-in block type must render its content.
 *
 * The failure this guards against is the quiet one: a template that renders an
 * empty <section>, or prints "[object Object]", because it guessed a delivered
 * field's shape wrong. Nothing throws, the build is green, and the page is
 * blank. So each fixture asserts a distinctive string from its own content
 * actually reaches the HTML.
 */

const render = (blocks: unknown[], preview = false) =>
  AstroContainer.create().then((c) => c.renderToString(Blocks, { props: { blocks, preview } }));

/** A word only this block's fixture contains. */
const EXPECTED: Record<string, string | RegExp> = {
  HeroBlock: "Navigating the digital landscape",
  TeaserListBlock: "Pay-per-click advertising",
  AccordionBlock: "Research and strategy",
  FaqTopicBlock: "Do I need to know how to code",
  TextBlock: "Delete the ones you do not want",
  ImageBlock: "rendered as a real figcaption",
  QuoteBlock: "three-week deploy cycle",
  BannerBlock: "Let&#39;s make things happen",
  "BannerBlock (background image)": "background image",
  VideoBlock: "Watch how it works",
  PersonBlock: "Principal Engineer",
  LinkListBlock: "Where to next",
  "AccordionItemBlock (standalone)": "Consultation",
  "QuestionBlock (standalone)": "Do I need to know how to code",
  "LinkItemBlock (standalone)": "Services",
  "Page as a teaser": "How we cut our deploy cycle",
  "Form (shared block)": "How can we help",
  "Unknown type (schema fallback)": "A type added in the admin today",
};

describe("every built-in block type renders", () => {
  for (const { label, block } of ALL_BLOCKS) {
    it(`${label} renders its content`, async () => {
      const html = await render([block]);
      expect(html).toMatch(EXPECTED[label]);
      // The classic silent failure: an object stringified into the markup.
      expect(html).not.toContain("[object Object]");
      expect(html.trim()).not.toBe("");
    });
  }
});

describe("block rendering details", () => {
  it("renders a hero as an h1 with both actions", async () => {
    const html = await render([HERO]);
    expect(html).toContain("<h1");
    expect(html).toContain("Book a consultation");
    expect(html).toContain("See our services");
    expect(html).toContain('href="/contact"');
  });

  it("numbers accordion rows by position, not by a field", async () => {
    const html = await render([ACCORDION]);
    // 01 / 02 / 03 — so reordering in the admin cannot leave stale numbers.
    expect(html).toContain("01");
    expect(html).toContain("02");
    expect(html).toContain("03");
    expect(html).toContain("<details");
  });

  it("renders an unpublished internal link as text, never as href=''", async () => {
    // Delivery resolves an unpublished target to href:"". Rendering <a href="">
    // would link it to the current page, which looks like a bug in the site.
    const html = await render([LINK_ITEMS[3]]);
    expect(html).toContain("Not published yet");
    expect(html).not.toContain('href=""');
  });

  it("links a page teaser to the page it teases", async () => {
    const html = await render([PAGE_TEASER]);
    expect(html).toContain('href="/blog/deploy-cycle"');
  });

  it("renders a form's fields from the delivered spec", async () => {
    const html = await render([FORM_BLOCK]);
    expect(html).toContain('name="name"');
    expect(html).toContain('name="email"');
    expect(html).toContain('name="message"');
    // The honeypot the CMS named, hidden from sight AND from assistive tech.
    expect(html).toContain("pb_hp_email");
  });

  it("renders an unknown type from its schema, keeping richtext as richtext", async () => {
    const html = await render([UNKNOWN_BLOCK]);
    expect(html).toContain("A type added in the admin today");
    expect(html).toContain("Richtext still comes out as richtext");
    expect(html).toContain("<img");
  });

  it("gives an empty area a drop target in preview, and nothing in public", async () => {
    expect(await render([], true)).toContain("Empty area");
    expect(await render([], false)).not.toContain("Empty area");
  });
});

describe("editing markers are preview-only", () => {
  it("marks blocks and fields in preview", async () => {
    const html = await render([HERO], true);
    expect(html).toContain('data-pb-block-index="0"');
    expect(html).toContain('data-pb-block-type="HeroBlock"');
    expect(html).toContain('data-pb-field="heading"');
  });

  it("ships no marker at all on a public page", async () => {
    const html = await render(ALL_BLOCKS.map((b) => b.block), false);
    expect(html).not.toMatch(/data-pb-/);
  });
});
