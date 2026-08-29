import type { AreaBlock, Delivered } from "@paperboycms/client";
import { cms, config, isPreview, type Env } from "./cms";

/**
 * Standalone block preview — the third preview contract this app implements
 * (after locale-prefixed page framing and generated public files).
 *
 * The CMS admin frames `{previewUrl}/{locale}/preview/block/{documentId}` to
 * show a shared block WITHOUT a host page: a block not placed anywhere yet (a
 * form being built, say) previews here, rendered by the same component registry
 * that renders it inline on pages. Without this route the admin's block
 * preview pane shows the site's 404 page and a hint instead of the block.
 */

/**
 * One delivered document, wrapped as the AreaBlock shape `Blocks.astro`
 * renders. Rendering through the SAME registry entry pages use means what an
 * editor sees standalone is exactly what a page embedding the block will show
 * — forms included (`content.form` + `content.documentId` is what makes
 * PaperboyForm render real inputs).
 */
export function standaloneAreaBlock(content: Delivered): AreaBlock {
  return {
    blockType: content.type,
    display: "automatic",
    shared: true,
    content: {
      documentId: content.documentId,
      type: content.type,
      kind: content.kind,
      name: content.name,
      urlPath: content.urlPath ?? null,
      data: content.data,
      fieldTypes: content.fieldTypes,
      form: content.form,
    },
  };
}

/**
 * Gate, then fetch. Null means 404 — and the gate runs BEFORE the fetch: this
 * route is editor chrome, not a public surface, and without the hard gate it
 * would open draft reads by documentId enumeration on the public site,
 * bypassing the published-only perspective the public key enforces.
 */
export async function loadStandaloneBlock(
  url: URL,
  env: Env,
  documentId: string,
  locale: string | undefined,
): Promise<Delivered | null> {
  const cfg = config(env);
  if (!cfg.apiUrl || !cfg.previewKey) return null;
  if (!(await isPreview(url, env))) return null;
  try {
    return await cms(env, true).getById(documentId, {
      locale: locale || cfg.locale || undefined,
      populate: 2,
    });
  } catch {
    // A malformed id or an API hiccup reads as not-found, never as a 500 —
    // the admin shows its own self-teaching hint on an empty frame.
    return null;
  }
}
