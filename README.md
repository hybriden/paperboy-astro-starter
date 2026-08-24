# Paperboy Astro starter

An Astro frontend for [Paperboy](https://github.com/hybriden/paperboy), wired to
the Delivery API through the published [`@paperboycms/client`](https://www.npmjs.com/package/@paperboycms/client)
and [`@paperboycms/preview`](https://www.npmjs.com/package/@paperboycms/preview)
packages. Clone it, point it at your instance, and you have a site with routing,
draft preview, on-page editing, forms and generated `robots.txt` / `sitemap.xml`
already working.

Nothing here is vendored from the CMS repo — it talks to a Paperboy over HTTP, so
it works against a self-hosted instance you run or one somebody else runs.

## Quickstart

```bash
git clone https://github.com/hybriden/paperboy-astro-starter my-site
cd my-site
npm install
cp .env.example .env      # then fill in the four values below
npm run dev               # http://localhost:4321
```

Four environment variables, all from your Paperboy admin:

| Variable | Where it comes from | Notes |
| --- | --- | --- |
| `PAPERBOY_API_URL` | your instance origin | no trailing slash |
| `PAPERBOY_PUBLIC_KEY` | Settings → API keys | `pk_live_…` — published content only |
| `PAPERBOY_PREVIEW_KEY` | Settings → API keys | `prv_…` — **server-side only**, returns drafts |
| `PREVIEW_SECRET` | the API's own `PREVIEW_SECRET` | must be byte-identical |

Delivery keys are per **site**, so a multisite instance has a pair per site.

To see your site inside the CMS, set the site's preview URL to this app
(Settings → Site → Preview URL) and the admin's preview pane will frame it.

## What you get

**One route renders the whole site.** Paperboy computes each page's `urlPath`
from the content tree, so `src/pages/[...path].astro` serves every page. An
editor adding a page or moving a branch needs no deploy, and `/` resolves to the
configured start page.

**Blocks render from their schema, not from a template per type.** Every item is
delivered with `fieldTypes` — the declared type of each public field — so
`Blocks.astro` renders richtext as richtext, images as responsive `<img>`, and
text as text, for content types that did not exist when you cloned this. The
starter renders six different block types in the demo instance without a single
type-specific branch. When you want real design, switch on `b.blockType` and keep
the generic path as the fallback so a new type never renders blank.

**On-page editing works out of the box.** In preview, elements carry `data-pb-*`
markers and `@paperboycms/preview` runs the bridge, so clicking text in the CMS
preview pane opens the right field. On the public site there are no markers and
no bridge — verified: 30 markers in preview, 0 in public.

**Preview is a signed, short-lived token.** The admin asks its own API for a
token and passes it as `?pbt=`; `isPreview()` verifies it with
`@paperboycms/client/preview-token` — a separate subpath from the client, because
its first argument is your `PREVIEW_SECRET` and nothing browser-bound may hold
that. The secret never reaches a browser, tampered and expired tokens are
rejected, and preview responses are always `noindex`. Don't reimplement that
check: comparing a MAC by hand is how drafts end up on public sites.

**Forms are content.** A Form block is delivered as a *schema* (fields, labels,
validation, error copy) — never markup — so `PaperboyForm.astro` styles it however
you like while the CMS stays the authority. `src/pages/api/submit.ts` forwards to
Paperboy, which validates against the current published definition and stores the
submission. Spam checks (hidden field + fill timing) are handled for you.

**SEO comes computed.** Every page carries a `seo` block: meta, canonical,
robots, OpenGraph, Twitter and per-`@type` JSON-LD plus a breadcrumb trail, built
from the roles your content types declare and computed *after* field visibility,
so a private field cannot leak into a meta tag.

**`robots.txt`, `sitemap.xml`, `llms.txt` and `security.txt` are generated** by
the CMS from your content and proxied from this origin — never stale after a
publish, and editable without a deploy. `noindex` pages are excluded from the
sitemap automatically.

## Layout

```
src/
  lib/
    cms.ts             the only place this app talks to Paperboy
  components/
    Blocks.astro       schema-driven content-area renderer
    PaperboyForm.astro a form built from the delivered spec
    PreviewBridge.astro on-page editing, gated to preview
  layouts/Base.astro   head assembled from the computed seo block
  pages/
    [...path].astro    every CMS page, by its own URL
    api/submit.ts      form submissions -> CMS -> your notification
    robots.txt.ts  sitemap.xml.ts  llms.txt.ts  .well-known/security.txt.ts
```

## Deploying

The starter ships `@astrojs/node` in standalone mode because it assumes nothing
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

## Extending it

- **Real design per block type** — switch on `b.blockType` in `Blocks.astro`.
- **Markdown fields** — the `markdown` branch renders as text; add `marked` or
  `markdown-it` and sanitize the output.
- **Lists and search** — `cms(env).list("BlogPost", { sort: "-data.publishDate" })`
  and `cms(env).search(q)`. Sorting a list by a non-public field is refused by the
  API rather than silently ignored.
- **Images** — `mediaUrl` / `mediaSrcset` from the client hit the server's variant
  pipeline; `Blocks.astro` already emits a `srcset`.

## Licence

MIT.
