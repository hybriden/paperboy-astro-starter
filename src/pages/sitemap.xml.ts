import type { APIContext } from "astro";
import { fetchPageInventory, fetchStartPageId } from "../lib/cms";

/**
 * sitemap.xml, built from the CMS's page inventory rather than proxied from it.
 *
 * The CMS also GENERATES this file, but it composes URLs as
 * `{base}/{locale}{urlPath}` — the reference frontend's scheme. This app serves
 * pages without a locale segment, so proxying gave a sitemap where every URL was
 * an alias of the canonical one and the front page appeared only as
 * `/en/<its-slug>`. A sitemap of non-canonical URLs is worse than none.
 *
 * noIndex pages are excluded: never advertise a path an editor opted out of.
 */
export const prerender = false;

// An empty but VALID urlset beats a 500: a malformed sitemap can get a whole
// site's submission rejected.
const OPEN = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">';
const CLOSE = "</urlset>";

const escape = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export async function GET(context: APIContext): Promise<Response> {
  const env = (context.locals as { runtime?: { env?: Record<string, string | undefined> } }).runtime?.env;
  const origin = (context.site?.origin ?? context.url.origin).replace(/\/+$/, "");

  const [pages, startId] = await Promise.all([fetchPageInventory(env), fetchStartPageId(env)]);

  const urls = pages
    .filter((p) => !p.noIndex && typeof p.urlPath === "string")
    // The start page is canonically "/", not its own slug — the same rule the
    // page itself follows, so the sitemap and the canonical tag agree.
    .map((p) => ({ loc: p.documentId === startId ? "/" : p.urlPath, lastmod: p.lastmod }))
    // A start page reachable at both "/" and its slug must appear once.
    .filter((u, i, all) => all.findIndex((o) => o.loc === u.loc) === i);

  const body = [
    OPEN,
    ...urls.map(
      (u) =>
        `  <url><loc>${escape(origin + u.loc)}</loc>${u.lastmod ? `<lastmod>${escape(u.lastmod)}</lastmod>` : ""}</url>`,
    ),
    CLOSE,
  ].join("\n");

  return new Response(body, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=300, stale-while-revalidate=600",
    },
  });
}
