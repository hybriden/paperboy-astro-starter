# Paperboy Astro starter

An Astro frontend for [Paperboy](https://github.com/hybriden/paperboy), wired to
the Delivery API through the published [`@paperboycms/client`](https://www.npmjs.com/package/@paperboycms/client)
and [`@paperboycms/preview`](https://www.npmjs.com/package/@paperboycms/preview)
packages.

It renders **every content type Paperboy ships with** — 6 page types, 15 block
types, all 10 form field types and both globals — in a real design, and it renders
types it has never seen from their schema. Clone it, point it at your instance,
and you have a working site: routing, draft preview, on-page editing, forms, and
generated `robots.txt` / `sitemap.xml` / `llms.txt` / `security.txt`.

Nothing here is vendored from the CMS repo — it talks to a Paperboy over HTTP, so
it works against an instance you run or one somebody else runs.

## Quickstart

```bash
git clone https://github.com/hybriden/paperboy-astro-starter my-site
cd my-site
npm install
npm run setup     # finds your CMS, verifies the keys, writes .env
npm run dev       # http://localhost:4321
```

`npm run setup` is the whole configuration step. It looks for a Paperboy checkout
next door and reads its `.env` (a real install randomises its delivery keys, so
they cannot be guessed — but they can be read), probes `localhost:8091`, and asks
only for what is left. Then it **checks each key against the live API before
writing anything**, so a typo fails in your terminal with an explanation instead
of in production as an empty page. It never overwrites an existing `.env` without
`--force`.

```
Checking http://localhost:8091 ...
  public key  OK — 14 published pages
  preview key OK
  start page  OK — "Home" (StartPage)
```

No CMS yet? Clone [Paperboy](https://github.com/hybriden/paperboy), run its setup
script and `docker compose up -d`, then run `npm run setup` here again.

Until it is configured, every page answers **503** with a panel naming the values
that are missing and where they come from — not a stack trace.

### With Docker

```bash
npm run setup            # still the easiest way to get a valid .env
docker compose up --build
```

One gotcha: a container cannot reach your host's `localhost`. If the CMS runs on
your machine, set `PAPERBOY_API_URL=http://host.docker.internal:8091`.

### The four values

| Variable | Where it comes from | Notes |
| --- | --- | --- |
| `PAPERBOY_API_URL` | your instance origin | no trailing slash |
| `PAPERBOY_PUBLIC_KEY` | Settings → API keys | `pk_live_…` — published content only |
| `PAPERBOY_PREVIEW_KEY` | Settings → API keys | `prv_…` — **server-side only**, returns drafts |
| `PREVIEW_SECRET` | the API's own `PREVIEW_SECRET` | must be byte-identical |

Delivery keys are per **site**, so a multisite instance has a pair per site.

One optional fifth value: **`PAPERBOY_LOCALE`**. Content in Paperboy is localized
and a page's URL belongs to a locale — the front page that is `/home` in English
is `/hjem` in Norwegian — so one route serves one language. Set this to pick which
(`nb`, `de`, …); unset means the API's default. For a genuinely multilingual site,
add a `[locale]` segment to the route and pass it to `getByPath` instead; the
reference frontend in the Paperboy repo (`apps/web`) does exactly that.

To see your site inside the CMS, set the site's preview URL to this app
(Settings → Site → Preview URL) and the admin's preview pane will frame it.

## See every block before you have any content

```
npm run dev  →  http://localhost:4321/kitchen-sink
```

Every block type and page template, rendered from fixtures, with a toggle for the
editing markers. Styling a CMS frontend otherwise means creating content in the
admin first — and you cannot see a block you have no content for. Dev only: it
404s in a production build.

The same fixtures drive the test suite, so "supports every built-in type" is
something CI checks rather than something this README claims.

## What is supported

**Page types** — one template each, in `src/templates`:

| Type | Template |
| --- | --- |
| `StartPage` | blocks only; the hero owns the `h1` |
| `SectionPage` | heading, intro, richtext body, blocks |
| `ArticlePage` | lead image, byline, real `<time>`, narrow measure, blocks |
| `ArticleListPage` | lists its children of the configured type, paginated by the editor's page size |
| `FaqPage` | topics of questions, as `<details>` |
| `PersonPage` | portrait, contact details, richtext bio |
| anything else | `GenericPage` — rendered from its schema |

**Block types** — one component each, in `src/components/blocks`:

`HeroBlock` · `TeaserListBlock` · `AccordionBlock` + `AccordionItemBlock` ·
`FaqTopicBlock` + `QuestionBlock` · `TextBlock` · `ImageBlock` · `QuoteBlock` ·
`BannerBlock` · `VideoBlock` · `PersonBlock` · `LinkListBlock` + `LinkItemBlock` ·
`Form` (all 10 field types) · a page dropped into an area (as a teaser) ·
anything else via `GenericBlock`.

**Globals** — `HeaderSettings` and `FooterSettings` drive the header and footer,
so navigation is edited as content.

### Adding your own

A new block type is one component and one line:

```diff
  // src/components/Blocks.astro
  const REGISTRY = {
    HeroBlock,
+   PricingTableBlock,
```

Page templates work the same way: add a file to `src/templates` and a line to
`TEMPLATES` in `src/pages/[...path].astro`. Until you do, the type still renders —
through the schema-driven fallback, not as a blank page. That matters because
content types are *data* in Paperboy: someone can add one this afternoon.

Read field values through `src/lib/values.ts` rather than touching `data`
directly. An `image` is an object, not a string; a `link` whose internal target is
unpublished has an empty `href`; `richtext` is a TipTap document, not HTML. Each of
those fails *silently* if you guess — a blank element, or `[object Object]` in your
markup.

## The design

The visual language is adapted from **[Positivus](https://www.figma.com/community/file/1230604708032389430/positivus-landing-page-design)**,
a free landing-page design by Olga Averchenko on the Figma Community: an acid
green on near-black, one grey, Space Grotesk, and cards with a 1px black border
and a hard 5px drop. Check that file's own licence terms before shipping
commercially.

Everything visual reads from tokens, so rebranding is one file:

```css
/* src/styles/tokens.css */
--pb-green: #b9ff66;   --pb-dark: #191a23;   --pb-grey: #f3f3f3;
--pb-radius-card: 45px;   --pb-radius-control: 14px;
--pb-shadow: 0 5px 0 0 var(--pb-line);
--pb-font: "Space Grotesk", …;
```

`src/styles/app.css` turns those into a small vocabulary — section header, card,
button, accordion, panel — that every block component shares. Plain CSS, one class
per idea, no framework to fight. Swap the font link in `src/layouts/Base.astro` if
you self-host type.

## How it works

**One route renders the whole site.** Paperboy computes each page's `urlPath` from
the content tree, so `src/pages/[...path].astro` serves every page: an editor
adding a page or moving a branch needs no deploy, and `/` resolves to the
configured start page.

**On-page editing works out of the box.** In preview, elements carry `data-pb-*`
markers and `@paperboycms/preview` runs the bridge, so clicking text in the CMS
preview pane opens the right field. On the public site there are no markers and no
bridge — they come from one helper (`src/lib/editing.ts`), and a test fails if a
template writes one inline.

**Preview is a signed, short-lived token.** The admin asks its own API for a token
and passes it as `?pbt=`; `isPreview()` verifies it with
`@paperboycms/client/preview-token` — a separate subpath from the client, because
its first argument is your `PREVIEW_SECRET` and nothing browser-bound may hold
that. Tampered and expired tokens are rejected, and preview responses are always
`noindex`. Don't reimplement that check.

**Forms are content.** A Form block is delivered as a *schema* (fields, labels,
validation, error copy) — never markup — so `PaperboyForm.astro` styles it however
you like while the CMS stays the authority. `src/pages/api/submit.ts` forwards to
Paperboy, which validates against the current published definition and stores the
submission. Spam checks (hidden field + fill timing) are handled for you; add your
notification after a successful store, and skip it when the response says the
submission was discarded.

**SEO comes computed.** Every page carries a `seo` block: meta, canonical, robots,
OpenGraph, Twitter and per-`@type` JSON-LD plus a breadcrumb trail, built from the
roles your content types declare and computed *after* field visibility, so a
private field cannot leak into a meta tag.

**`robots.txt`, `sitemap.xml`, `llms.txt` and `security.txt` are generated** by the
CMS from your content and proxied from this origin — never stale after a publish,
editable without a deploy. `noindex` pages are excluded from the sitemap
automatically.

## Layout

```
src/
  lib/
    cms.ts             the only place this app talks to Paperboy
    values.ts          delivered field shapes -> typed values
    editing.ts         data-pb-* markers, preview only
    teaser.ts          a block or page -> teaser card props
    fixtures.ts        sample content for the kitchen sink and the tests
  components/
    Blocks.astro       the block registry
    blocks/*.astro     one component per block type
    SiteHeader.astro   from the HeaderSettings global
    SiteFooter.astro   from the FooterSettings global
    PaperboyForm.astro a form built from the delivered spec
  templates/*.astro    one per page type
  pages/
    [...path].astro    every CMS page, by its own URL
    kitchen-sink/      every block and template, from fixtures (dev only)
    api/submit.ts      form submissions -> CMS -> your notification
    robots.txt.ts  sitemap.xml.ts  llms.txt.ts  .well-known/security.txt.ts
  styles/
    tokens.css         the design system, in variables
    app.css            base + component classes
scripts/setup.mjs      npm run setup
```

## Deploying

`@astrojs/node` in standalone mode ships by default because it assumes nothing
about your host. Swap the adapter in `astro.config.mjs` for
[`@astrojs/cloudflare`](https://docs.astro.build/en/guides/integrations-guide/cloudflare/),
`@astrojs/vercel` or `@astrojs/netlify` — nothing else in the project is
host-specific. `readEnv` already checks `Astro.locals.runtime.env` first, so
Cloudflare bindings work without edits.

Set `site` in `astro.config.mjs` to your public origin. Canonical and `og:url`
fall back to the request origin without it, which is wrong behind some proxies.

`output: "server"` is deliberate: preview decides per request whether the caller
holds a valid credential, and drafts must never be baked into a deployed
artifact.

## Tests

```bash
npm test          # every block type, every page template, and setup
npm run typecheck # astro check
```

The suite renders each block and template through the real components with
delivery-shaped fixtures and asserts the content actually reaches the HTML —
because the failure mode that matters here is silent: an empty section, or
`[object Object]`, with a green build.

## Licence

MIT for this code. The design is adapted from a third-party Figma Community file —
see [The design](#the-design).
