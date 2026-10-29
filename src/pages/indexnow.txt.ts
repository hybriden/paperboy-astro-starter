import type { APIContext } from "astro";
import { fetchPublicFile } from "../lib/cms";

// IndexNow key file, proxied from the CMS: Paperboy names this URL as the
// keyLocation when it tells search engines which pages changed. Switch it on
// under Settings → Site → Public files → IndexNow; until then this is a 404.
export const prerender = false;

export async function GET(context: APIContext): Promise<Response> {
  const env = (context.locals as { runtime?: { env?: Record<string, string | undefined> } }).runtime?.env;
  const file = await fetchPublicFile(env, "indexnow.txt");
  if (!file) return new Response("Not found", { status: 404 });
  return new Response(file.body, {
    headers: {
      "Content-Type": file.contentType,
      "Cache-Control": "public, max-age=300, stale-while-revalidate=600",
    },
  });
}
