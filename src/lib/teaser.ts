import { blockData, type AreaBlock } from "@paperboycms/client";
import { firstImg, firstStr, link, type PbImage } from "./values";

/**
 * Turn anything that can appear in a content area into teaser card props.
 *
 * A content area accepts blocks AND pages, so "list these things" has to cope
 * with both. Paperboy's built-in page types all carry `teaserTitle` /
 * `teaserText` / `teaserImage` so an editor can decide how a page looks when it
 * appears somewhere else — those win, then the page's own heading/intro/image.
 *
 * A page resolves with `kind: "page"` and a `urlPath`; `urlPath` is null when
 * the page (or an ancestor) is not published, which is why the card falls back
 * to rendering without a link instead of linking nowhere.
 */
export interface Teaser {
  href: string | null;
  title: string;
  text: string;
  image: PbImage | null;
  eyebrow: string;
}

const TITLE_FIELDS = ["teaserTitle", "heading", "title", "question", "topic"];
const TEXT_FIELDS = ["teaserText", "intro", "summary", "metaDescription", "subtitle", "text"];
const IMAGE_FIELDS = ["teaserImage", "mainImage", "image"];

export function teaserFrom(b: AreaBlock): Teaser {
  const data = blockData(b);
  const page = b.shared && b.content?.kind === "page" ? b.content : null;

  return {
    // Pages link to themselves; a block links only if it carries a link field.
    href: page?.urlPath ?? link(data, "link")?.href ?? link(data, "moreLink")?.href ?? null,
    title: firstStr(data, TITLE_FIELDS) || page?.name || "",
    text: firstStr(data, TEXT_FIELDS),
    image: firstImg(data, IMAGE_FIELDS),
    // The type name is genuinely useful on a mixed list ("Article", "Person").
    eyebrow: page ? "" : "",
  };
}

/**
 * The design alternates card fills across a row. Cycled by position so a grid
 * looks composed without the editor having to choose a colour per card.
 */
const TONES = ["accent", "grey", "dark", "white"] as const;
export const toneFor = (index: number): (typeof TONES)[number] => TONES[index % TONES.length];
