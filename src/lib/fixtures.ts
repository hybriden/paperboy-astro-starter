import type { AreaBlock, Delivered } from "@paperboycms/client";

/**
 * Sample content in the EXACT shapes the Delivery API returns.
 *
 * Two jobs:
 *   1. `/kitchen-sink` renders them, so you can see and restyle every template
 *      without touching real content.
 *   2. `templates.test.ts` renders them, so "supports every built-in type" is a
 *      claim the test suite checks rather than a promise in a README.
 *
 * The shapes matter more than the words. An `image` field is an OBJECT
 * ({url, alt, …}) not a string; a `link` is an object whose href is "" when its
 * internal target is unpublished; `richtext` is a TipTap document, not HTML. A
 * template that guesses wrong on any of those renders blank or prints
 * "[object Object]" — so the fixtures are written the way delivery writes them,
 * and getting them wrong here means the tests catch it, not a customer.
 */

const img = (url: string, alt: string) => ({ documentId: `asset_${url}`, url, alt, mime: "image/svg+xml" });

/** A TipTap document, which is what a `richtext` field actually contains. */
const rt = (...paragraphs: string[]) => ({
  type: "doc",
  content: paragraphs.map((text) => ({
    type: "paragraph",
    content: [{ type: "text", text }],
  })),
});

const SHAPE_1 = img("/demo/shape-1.svg", "Abstract green and black shapes");
const SHAPE_2 = img("/demo/shape-2.svg", "Dark panel with green accents");
const PORTRAIT = img("/demo/portrait.svg", "Portrait placeholder");

/** An INLINE block: its own values plus its own declared field types. */
const inline = (blockType: string, data: Record<string, unknown>, fieldTypes: Record<string, string>): AreaBlock => ({
  blockType,
  display: "automatic",
  shared: false,
  data,
  fieldTypes,
});

// ---------------------------------------------------------------- blocks ---

export const HERO = inline(
  "HeroBlock",
  {
    heading: "Navigating the digital landscape for growth",
    subtitle:
      "Our team of experts uses a methodical approach to unlock growth: search, social, content and everything between.",
    image: SHAPE_1,
    primaryLink: { href: "/contact", text: "Book a consultation" },
    secondaryLink: { href: "/services", text: "See our services" },
  },
  { heading: "text", subtitle: "text", image: "image", primaryLink: "link", secondaryLink: "link" },
);

export const TEXT = inline(
  "TextBlock",
  {
    body: rt(
      "Every block on this page is a content type in Paperboy, rendered by a component in src/components/blocks.",
      "Delete the ones you do not want, restyle the rest, and add your own — the registry in Blocks.astro is the only place that needs to know.",
    ),
  },
  { body: "richtext" },
);

export const IMAGE = inline(
  "ImageBlock",
  { image: SHAPE_2, caption: "A caption an editor wrote, rendered as a real figcaption." },
  { image: "image", caption: "text" },
);

export const QUOTE = inline(
  "QuoteBlock",
  {
    quote:
      "We went from a three-week deploy cycle for a copy change to editors publishing in a minute, without asking us.",
    source: "Head of Digital, an actual customer",
    image: PORTRAIT,
  },
  { quote: "text", source: "text", image: "image" },
);

export const BANNER = inline(
  "BannerBlock",
  {
    heading: "Let's make things happen",
    text: "Contact us today to learn how our services can help your business grow.",
    link: { href: "/contact", text: "Get your free proposal" },
  },
  { heading: "text", text: "text", link: "link" },
);

export const BANNER_IMAGE = inline(
  "BannerBlock",
  {
    heading: "A banner with a background image",
    text: "The panel goes dark and gains a scrim, so the text keeps its contrast whatever the photo looks like.",
    link: { href: "/about", text: "About us" },
    backgroundImage: SHAPE_2,
  },
  { heading: "text", text: "text", link: "link", backgroundImage: "image" },
);

export const VIDEO = inline(
  "VideoBlock",
  {
    heading: "Watch how it works",
    embedUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    poster: SHAPE_1,
  },
  { heading: "text", embedUrl: "text", poster: "image" },
);

export const ACCORDION_ITEMS: AreaBlock[] = [
  inline(
    "AccordionItemBlock",
    { heading: "Consultation", body: rt("We start by understanding what you actually need, which is rarely what the brief says."), expanded: true },
    { heading: "text", body: "richtext", expanded: "boolean" },
  ),
  inline(
    "AccordionItemBlock",
    { heading: "Research and strategy", body: rt("Then we look at the data before having opinions about it.") },
    { heading: "text", body: "richtext", expanded: "boolean" },
  ),
  inline(
    "AccordionItemBlock",
    { heading: "Execution", body: rt("Shipping, measuring, and changing our minds when the numbers say so.") },
    { heading: "text", body: "richtext", expanded: "boolean" },
  ),
];

export const ACCORDION = inline(
  "AccordionBlock",
  {
    heading: "Our working process",
    text: rt("Step by step, with nobody wondering what happens next."),
    items: ACCORDION_ITEMS,
  },
  { heading: "text", text: "richtext", items: "contentArea" },
);

export const QUESTIONS: AreaBlock[] = [
  inline(
    "QuestionBlock",
    { question: "Do I need to know how to code?", answer: rt("No. Editors work in the admin; this starter is what your developers deploy once.") },
    { question: "text", answer: "richtext" },
  ),
  inline(
    "QuestionBlock",
    { question: "Can I add my own content types?", answer: rt("Yes — content types are data in Paperboy. A new type renders here immediately through the schema-driven fallback.") },
    { question: "text", answer: "richtext" },
  ),
];

export const FAQ_TOPIC = inline(
  "FaqTopicBlock",
  { topic: "Getting started", questions: QUESTIONS },
  { topic: "text", questions: "contentArea" },
);

export const PERSON = inline(
  "PersonBlock",
  {
    image: PORTRAIT,
    firstName: "Ada",
    lastName: "Lovelace",
    workTitle: "Principal Engineer",
    department: "Platform",
    email: "ada@example.com",
    phone: "+47 900 00 000",
  },
  {
    image: "image",
    firstName: "text",
    lastName: "text",
    workTitle: "text",
    department: "text",
    email: "text",
    phone: "text",
  },
);

export const LINK_ITEMS: AreaBlock[] = [
  inline("LinkItemBlock", { link: { href: "/services", text: "Services" } }, { link: "link" }),
  inline("LinkItemBlock", { link: { href: "/about", text: "About" } }, { link: "link" }),
  inline("LinkItemBlock", { link: { href: "https://example.com", text: "An external link", target: "_blank" } }, { link: "link" }),
  // An internal link whose target is not published: delivery resolves href to "".
  inline("LinkItemBlock", { link: { href: "", documentId: "doc_unpublished", text: "Not published yet" } }, { link: "link" }),
];

export const LINK_LIST = inline(
  "LinkListBlock",
  { heading: "Where to next", links: LINK_ITEMS },
  { heading: "text", links: "contentArea" },
);

/** A PAGE dropped into a content area — delivery resolves it with kind "page". */
export const PAGE_TEASER: AreaBlock = {
  blockType: "ArticlePage",
  display: "automatic",
  shared: true,
  content: {
    documentId: "doc_article_1",
    type: "ArticlePage",
    kind: "page",
    name: "How we cut our deploy cycle",
    urlPath: "/blog/deploy-cycle",
    data: {
      teaserTitle: "How we cut our deploy cycle",
      teaserText: "From three weeks to a minute, and what broke along the way.",
      teaserImage: SHAPE_1,
    },
    fieldTypes: { teaserTitle: "text", teaserText: "text", teaserImage: "image" },
  },
};

export const TEASER_LIST = inline(
  "TeaserListBlock",
  {
    heading: "Services",
    intro: "What we do, in the order clients usually need it.",
    teasers: [
      inline("TeaserBlock", { heading: "Search engine optimisation", intro: "Be findable for the things you are actually good at." }, { heading: "text", intro: "text" }),
      inline("TeaserBlock", { heading: "Pay-per-click advertising", intro: "Spend less to reach the same people." }, { heading: "text", intro: "text" }),
      PAGE_TEASER,
    ],
    moreLink: { href: "/services", text: "All services" },
  },
  { heading: "text", intro: "text", teasers: "contentArea", moreLink: "link" },
);

/** A shared block whose document is a Form: delivery attaches the spec. */
export const FORM_BLOCK: AreaBlock = {
  blockType: "Form",
  display: "automatic",
  shared: true,
  content: {
    documentId: "doc_form_1",
    type: "Form",
    kind: "block",
    name: "Contact form",
    data: {},
    fieldTypes: {},
    form: {
      title: "Contact us",
      intro: null,
      submitLabel: "Send message",
      // The spec's real shape: a flat honeypot field NAME, a boolean turnstile
      // flag and a confirmation KIND. Guessing a nested object here is how a
      // form renders with an unnamed honeypot that can never be checked.
      honeypotField: "pb_hp_email",
      minFillMs: 2000,
      turnstile: false,
      confirmation: "message",
      confirmationText: null,
      redirectTo: null,
      fields: [
        { name: "name", kind: "text", label: "Name", required: true, helpText: "", placeholder: "Ada Lovelace", options: [], errorMessage: "" },
        { name: "email", kind: "email", label: "Email", required: true, helpText: "", placeholder: "ada@example.com", options: [], errorMessage: "" },
        { name: "message", kind: "textarea", label: "How can we help?", required: true, helpText: "", placeholder: "", options: [], errorMessage: "", rows: 5 },
        { name: "consent", kind: "consent", label: "I agree to be contacted about this enquiry.", required: true, helpText: "", options: [], errorMessage: "" },
      ],
    } as never,
  },
};

/** A type this starter has never seen — proves the fallback renders it. */
export const UNKNOWN_BLOCK = inline(
  "PricingTableBlock",
  {
    heading: "A type added in the admin today",
    intro: "No component exists for this block, so it is rendered from its schema instead of rendering blank.",
    body: rt("Richtext still comes out as richtext, because the declared field type says so."),
    image: SHAPE_2,
    seats: 12,
    featured: true,
  },
  { heading: "text", intro: "text", body: "richtext", image: "image", seats: "number", featured: "boolean" },
);

/** Every block fixture, in a sensible order for the gallery. */
export const ALL_BLOCKS: { label: string; block: AreaBlock }[] = [
  { label: "HeroBlock", block: HERO },
  { label: "TeaserListBlock", block: TEASER_LIST },
  { label: "AccordionBlock", block: ACCORDION },
  { label: "FaqTopicBlock", block: FAQ_TOPIC },
  { label: "TextBlock", block: TEXT },
  { label: "ImageBlock", block: IMAGE },
  { label: "QuoteBlock", block: QUOTE },
  { label: "BannerBlock", block: BANNER },
  { label: "BannerBlock (background image)", block: BANNER_IMAGE },
  { label: "VideoBlock", block: VIDEO },
  { label: "PersonBlock", block: PERSON },
  { label: "LinkListBlock", block: LINK_LIST },
  { label: "AccordionItemBlock (standalone)", block: ACCORDION_ITEMS[0] },
  { label: "QuestionBlock (standalone)", block: QUESTIONS[0] },
  { label: "LinkItemBlock (standalone)", block: LINK_ITEMS[0] },
  { label: "Page as a teaser", block: PAGE_TEASER },
  { label: "Form (shared block)", block: FORM_BLOCK },
  { label: "Unknown type (schema fallback)", block: UNKNOWN_BLOCK },
];

// ----------------------------------------------------------------- pages ---

const page = (
  type: string,
  name: string,
  data: Record<string, unknown>,
  fieldTypes: Record<string, string>,
  urlPath = "/demo",
): Delivered => ({
  documentId: `doc_${type}`,
  type,
  kind: "page",
  name,
  locale: "en",
  urlPath,
  cv: 1,
  data,
  fieldTypes,
  seo: null,
} as unknown as Delivered);

export const START_PAGE = page(
  "StartPage",
  "Home",
  { heading: "Home", mainArea: [HERO, TEASER_LIST, ACCORDION, BANNER, QUOTE, FORM_BLOCK] },
  { heading: "text", mainArea: "contentArea" },
  "/",
);

export const SECTION_PAGE = page(
  "SectionPage",
  "Services",
  {
    heading: "Services",
    intro: "A section page introduces part of the site and then composes blocks.",
    body: rt("The body is richtext, so an editor can write real prose without asking for a new field."),
    mainArea: [TEASER_LIST, BANNER],
  },
  { heading: "text", intro: "text", body: "richtext", mainArea: "contentArea" },
  "/services",
);

export const ARTICLE_PAGE = page(
  "ArticlePage",
  "How we cut our deploy cycle",
  {
    heading: "How we cut our deploy cycle",
    intro: "From three weeks to a minute, and what broke along the way.",
    mainImage: SHAPE_1,
    imageCaption: "The old release calendar, may it rest.",
    publishDate: "2026-03-14T09:00:00.000Z",
    author: "Ada Lovelace",
    body: rt(
      "An article page keeps a narrow measure for reading, with the lead image full width above it.",
      "Blocks can still be added below the body, so an article can end with a call to action or a form.",
    ),
    mainArea: [QUOTE, BANNER],
  },
  {
    heading: "text",
    intro: "text",
    mainImage: "image",
    imageCaption: "text",
    publishDate: "datetime",
    author: "text",
    body: "richtext",
    mainArea: "contentArea",
  },
  "/blog/deploy-cycle",
);

export const LIST_PAGE = page(
  "ArticleListPage",
  "Blog",
  { heading: "Blog", intro: "Everything we have written down.", listedType: "ArticlePage", pageSize: 4 },
  { heading: "text", intro: "text", listedType: "select", pageSize: "number" },
  "/blog",
);

/** Children for the list page — what the route fetches at runtime. */
export const LIST_ITEMS: Delivered[] = [1, 2, 3, 4, 5].map((n) =>
  page(
    "ArticlePage",
    `Article number ${n}`,
    {
      teaserTitle: `Article number ${n}`,
      teaserText: "A short teaser the editor wrote for exactly this situation.",
      teaserImage: n % 2 === 0 ? SHAPE_2 : SHAPE_1,
    },
    { teaserTitle: "text", teaserText: "text", teaserImage: "image" },
    `/blog/article-${n}`,
  ),
);

export const FAQ_PAGE = page(
  "FaqPage",
  "Questions",
  {
    heading: "Frequently asked questions",
    intro: "The ones we are actually asked.",
    topics: [FAQ_TOPIC],
  },
  { heading: "text", intro: "text", topics: "contentArea" },
  "/faq",
);

export const PERSON_PAGE = page(
  "PersonPage",
  "Ada Lovelace",
  {
    image: PORTRAIT,
    firstName: "Ada",
    lastName: "Lovelace",
    workTitle: "Principal Engineer",
    department: "Platform",
    email: "ada@example.com",
    phone: "+47 900 00 000",
    bio: rt("A person page is a profile: portrait and contact details beside a richtext biography."),
  },
  {
    image: "image",
    firstName: "text",
    lastName: "text",
    workTitle: "text",
    department: "text",
    email: "text",
    phone: "text",
    bio: "richtext",
  },
  "/people/ada",
);

export const UNKNOWN_PAGE = page(
  "CampaignPage",
  "A page type with no template",
  {
    title: "A page type with no template",
    intro: "Rendered from its schema, so a type added in the admin is never a blank page.",
    body: rt("Its content areas still render through the block registry, so blocks inside it keep their real designs."),
    mainArea: [QUOTE],
  },
  { title: "text", intro: "text", body: "richtext", mainArea: "contentArea" },
  "/campaign",
);

export const ALL_PAGES: { label: string; item: Delivered; items?: Delivered[] }[] = [
  { label: "StartPage", item: START_PAGE },
  { label: "SectionPage", item: SECTION_PAGE },
  { label: "ArticlePage", item: ARTICLE_PAGE },
  { label: "ArticleListPage", item: LIST_PAGE, items: LIST_ITEMS },
  { label: "FaqPage", item: FAQ_PAGE },
  { label: "PersonPage", item: PERSON_PAGE },
  { label: "Unknown type (schema fallback)", item: UNKNOWN_PAGE },
];
