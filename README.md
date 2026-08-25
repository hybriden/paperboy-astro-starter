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

## Try the whole thing in one command

No CMS yet? This brings up Paperboy, its admin, and this site, with demo content
already in it — a start page of blocks, articles, an FAQ, a profile, and a menu to
browse it with:

```bash
git clone https://github.com/hybriden/paperboy-astro-starter my-site
cd my-site
docker compose -f docker-compose.demo.yml up -d --build
```

| | |
| --- | --- |
| http://localhost:4321 | the site |
| http://localhost:8090 | the CMS admin — `admin@paperboy.test` / `Admin!Passw0rd` |
| http://localhost:8091 | the API (OpenAPI UI at `/docs`) |

Open a page in the admin and it appears beside a live preview of itself; click text
in that preview and the right field opens.

What you get: a fictional studio site — a start page of blocks (hero, service
cards, numbered process, testimonial, call to action), three service pages, a
journal with six articles and real pagination, an FAQ, two profiles, and a contact
page with a working form. Plus a menu, a footer, breadcrumbs, a sitemap and
llms.txt. It is a company that does not exist, on purpose: a demo whose every page
explains the demo tells you nothing about handling real content, and you cannot
show it to a stakeholder. `/about` says what it actually is.

`scripts/demo-content.mjs` builds all of it through the Management API — log in,
instantiate the built-in types, upload the photographs as assets, create pages,
publish — so it doubles as a worked example of automating Paperboy. The
photographs come from Unsplash on first run and are uploaded into your instance
as real assets, so they go through the CMS's own variant pipeline; with no
network access the demo builds without them, which is also worth seeing, since
every template has to look right with an image missing. It leaves your edits alone on restart, and it
trashes the CMS's own stock demo pages so you get one coherent site rather than
two overlapping ones.

Wipe it: `docker compose -f docker-compose.demo.yml down -v`

> The demo stack's credentials are public constants and its cookies are non-Secure
> so `http://localhost` works. It is for your machine, not a network.

## Quickstart against your own CMS

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

**Deploying behind a proxy?** Set **`PUBLIC_SITE_URL`** to your public origin.
A TLS-terminating proxy forwards plain HTTP, so the server sees `http://` and the
URLs this site publishes about itself — `og:url`, every `sitemap.xml` entry,
`llms.txt` — come out on the wrong scheme. (The canonical tag is fine either way;
it comes from the CMS's own `canonicalBaseUrl`.) Without it the scheme is read
from `x-forwarded-proto` and the host from the request, which is right in the
usual single-proxy case — the variable is for when you would rather not guess.

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

### Linking to a section of a page

Paperboy's link editor has an **anchor** field — "Section on that page" — and the
CMS appends whatever you type: `faq` becomes `/about#faq`. The CMS cannot know
what ids a front end emits, so the convention is this app's, and it is:

> **the section's own heading, lowercased, with spaces and punctuation turned
> into single hyphens.**

"Where projects start" is `#where-projects-start`; "Våre løsninger" is
`#vare-losninger` (Norwegian letters are transliterated, not stripped). Two
sections with the same heading get `-2`, `-3`. A section with no heading gets no
anchor, because a positional id would move the moment blocks were reordered.

One consequence to know: **renaming a heading renames its anchor**, so a link
pointing at the old one stops jumping. The alternative was to key anchors off the
block's internal id, which never rots but which nobody can type into that field —
and an anchor you cannot type is a feature that does not work. If you need one
that never moves, the block is a section: give it a stable heading.

The contact form also answers to `#pb-form`, which is where a no-JavaScript
submit redirects back to.

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
submission. Add your notification after a successful store, and skip it when the
response says the submission was discarded.

It works without JavaScript. With JS, the form submits in the background and puts
each CMS-supplied message beside its own field; without, it is a plain POST that
redirects back with a status message rather than showing you raw JSON. The form
also carries a server-rendered timestamp, because the CMS's minimum-fill-time spam
check would otherwise see "0ms" from a JS-less visitor and discard a real enquiry
while telling them it was sent.

**SEO comes computed.** Every page carries a `seo` block: meta, canonical, robots,
OpenGraph, Twitter and per-`@type` JSON-LD plus a breadcrumb trail, built from the
roles your content types declare and computed *after* field visibility, so a
private field cannot leak into a meta tag.

**`robots.txt` and `security.txt` are generated** by the CMS from your content and
proxied from this origin — never stale after a publish, editable without a deploy.

`sitemap.xml` and `llms.txt` are BUILT here instead, from the CMS's page
inventory (`/delivery/pages`). The CMS generates those two as well, but it
composes URLs as `{base}/{locale}{urlPath}` — the reference frontend's scheme —
and this app serves pages without a locale segment, so proxying produced a
sitemap where every URL was an alias of the canonical one. `noindex` pages are
excluded, and the start page is emitted as `/`.

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
scripts/demo-content.mjs  the demo site, built through the Management API
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
