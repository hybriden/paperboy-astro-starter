import type { APIContext } from "astro";
import { cms, fetchPageInventory, fetchStartPageId } from "../lib/cms";

/**
 * llms.txt — a plain-text map of the site for language models (llmstxt.org).
 *
 * Built from the page inventory for the same reason as sitemap.xml: the CMS's
 * generated version addresses pages as `/{locale}{urlPath}`, which is not how
 * this app serves them.
 */
export const prerender = false;

export async function GET(context: APIContext): Promise<Response> {
  const env = (context.locals as { runtime?: { env?: Record<string, string | undefined> } }).runtime?.env;
  const origin = (context.site?.origin ?? context.url.origin).replace(/\/+$/, "");

  const [pages, startId, settings] = await Promise.all([
    fetchPageInventory(env),
    fetchStartPageId(env),
    cms(env).global("SiteSettings").catch(() => null),
  ]);

  if (pages.length === 0) return new Response("Not found", { status: 404 });

  const siteName =
    (typeof settings?.data?.siteName === "string" && settings.data.siteName) || new URL(origin).hostname;

  const lines = [`# ${siteName}`, ""];
  for (const p of pages) {
    if (p.noIndex || typeof p.urlPath !== "string") continue;
    const path = p.documentId === startId ? "/" : p.urlPath;
    lines.push(`- [${p.name}](${origin}${path})`);
  }

  return new Response(`${lines.join("\n")}\n`, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=300, stale-while-revalidate=600",
    },
  });
}
