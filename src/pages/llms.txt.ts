import type { APIContext } from "astro";
import { fetchPublicFile } from "../lib/cms";

// llms.txt — a plain-text map of the site for language models, generated from
// your published pages. Descriptions honour each content type's field visibility,
// so nothing private leaks into it.
export const prerender = false;

export async function GET(context: APIContext): Promise<Response> {
  const env = (context.locals as { runtime?: { env?: Record<string, string | undefined> } }).runtime?.env;
  const file = await fetchPublicFile(env, "llms.txt");
  // Nothing configured is a legitimate answer here — better a 404 than an
  // invented map of the site.
  if (!file) return new Response("Not found", { status: 404 });
  return new Response(file.body, {
    headers: {
      "Content-Type": file.contentType,
      "Cache-Control": "public, max-age=300, stale-while-revalidate=600",
    },
  });
}
