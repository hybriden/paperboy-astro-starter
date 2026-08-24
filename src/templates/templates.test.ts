import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { describe, expect, it } from "vitest";
import ArticleListPage from "./ArticleListPage.astro";
import ArticlePage from "./ArticlePage.astro";
import FaqPage from "./FaqPage.astro";
import GenericPage from "./GenericPage.astro";
import PersonPage from "./PersonPage.astro";
import SectionPage from "./SectionPage.astro";
import StartPage from "./StartPage.astro";
import {
  ARTICLE_PAGE,
  FAQ_PAGE,
  LIST_ITEMS,
  LIST_PAGE,
  PERSON_PAGE,
  SECTION_PAGE,
  START_PAGE,
  UNKNOWN_PAGE,
} from "../lib/fixtures";

/**
 * Every page type Paperboy ships must render as a real page.
 *
 * The templates take their data as props (the route does the fetching), which is
 * exactly what makes this testable without a CMS: real components, real
 * delivered shapes, no network.
 */

const render = (Component: unknown, props: Record<string, unknown>) =>
  AstroContainer.create().then((c) => c.renderToString(Component as never, { props }));

const propsFor = (item: typeof START_PAGE, extra: Record<string, unknown> = {}) => ({
  data: item.data,
  types: item.fieldTypes,
  name: item.name,
  locale: item.locale,
  preview: false,
  ...extra,
});

describe("page templates", () => {
  it("StartPage renders its blocks", async () => {
    const html = await render(StartPage, propsFor(START_PAGE));
    expect(html).toContain("Navigating the digital landscape");
    expect(html).toContain("Services");
    expect(html).not.toContain("[object Object]");
  });

  it("StartPage leaves the h1 to the hero, and still exposes the field in preview", async () => {
    // Two <h1>s is an outline bug a screen reader hears as two page titles, and
    // nothing else in the suite would catch it.
    const publicHtml = await render(StartPage, propsFor(START_PAGE));
    expect(publicHtml.match(/<h1/g)?.length ?? 0).toBe(1);
    expect(publicHtml).toContain("Navigating the digital landscape"); // the hero's

    // In preview the page heading is still clickable — as text, not a heading.
    const previewHtml = await render(StartPage, propsFor(START_PAGE, { preview: true }));
    expect(previewHtml.match(/<h1/g)?.length ?? 0).toBe(1);
    expect(previewHtml).toContain('data-pb-field="heading"');
  });

  it("SectionPage renders heading, intro, body and blocks", async () => {
    const html = await render(SectionPage, propsFor(SECTION_PAGE));
    expect(html).toContain("A section page introduces");
    expect(html).toContain("without asking for a new field");
    expect(html).toContain("Pay-per-click");
  });

  it("ArticlePage renders the byline and a machine-readable date", async () => {
    const html = await render(ArticlePage, propsFor(ARTICLE_PAGE));
    expect(html).toContain("Ada Lovelace");
    expect(html).toContain('datetime="2026-03-14T09:00:00.000Z"');
    expect(html).toContain("March"); // formatted for the reader
    expect(html).toContain("narrow measure for reading");
  });

  it("ArticleListPage lists its children and paginates by the editor's page size", async () => {
    const first = await render(ArticleListPage, propsFor(LIST_PAGE, { items: LIST_ITEMS, basePath: "/blog" }));
    // pageSize is 4 and there are 5 items: page 1 shows four of them.
    expect(first).toContain("Article number 1");
    expect(first).toContain("Article number 4");
    expect(first).not.toContain("Article number 5");
    expect(first).toContain("Page 1 of 2");
    expect(first).toContain('href="/blog?page=2"');

    const second = await render(
      ArticleListPage,
      propsFor(LIST_PAGE, { items: LIST_ITEMS, basePath: "/blog", page: 2 }),
    );
    expect(second).toContain("Article number 5");
    expect(second).toContain('rel="prev"');
  });

  it("ArticleListPage says so when there is nothing to list", async () => {
    const html = await render(ArticleListPage, propsFor(LIST_PAGE, { items: [] }));
    expect(html).toContain("Nothing published here yet");
  });

  it("FaqPage renders topics and questions", async () => {
    const html = await render(FaqPage, propsFor(FAQ_PAGE));
    expect(html).toContain("Getting started");
    expect(html).toContain("Can I add my own content types");
    expect(html).toContain("<details");
  });

  it("PersonPage renders the profile with tappable contact details", async () => {
    const html = await render(PersonPage, propsFor(PERSON_PAGE));
    expect(html).toContain("Principal Engineer");
    expect(html).toContain('href="mailto:ada@example.com"');
    expect(html).toContain('href="tel:+4790000000"');
    expect(html).toContain("portrait and contact details");
  });

  it("an unknown page type renders from its schema instead of blank", async () => {
    const html = await render(GenericPage, propsFor(UNKNOWN_PAGE));
    expect(html).toContain("A page type with no template");
    expect(html).toContain("never a blank page");
    // Blocks inside it keep their real design.
    expect(html).toContain("three-week deploy cycle");
    expect(html).not.toContain("[object Object]");
  });
});

describe("templates keep editing markers out of public pages", () => {
  it("marks fields in preview only", async () => {
    const shown = await render(ArticlePage, propsFor(ARTICLE_PAGE, { preview: true }));
    expect(shown).toContain('data-pb-field="heading"');
    expect(shown).toContain('data-pb-area="mainArea"');

    const publicHtml = await render(ArticlePage, propsFor(ARTICLE_PAGE));
    expect(publicHtml).not.toMatch(/data-pb-/);
  });
});
