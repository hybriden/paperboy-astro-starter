import { isRichTextDoc, renderRichText, type AreaBlock } from "@paperboycms/client";

/**
 * Typed readers for delivered field values.
 *
 * Paperboy delivers each field in a declared shape, and getting one wrong fails
 * SILENTLY — a naive `{data.image}` prints "[object Object]", a naive
 * `href={data.link}` renders `href="[object Object]"`. So the shapes are
 * interpreted here, once, and block components just ask for what they want.
 *
 * `data` is `Record<string, unknown>` because the fields of a content type are
 * defined in the admin, not in this codebase. That is the point: these readers
 * are how untyped CMS data becomes typed values without a cast in every
 * component.
 */

/** An `image` field: the asset resolved to an absolute URL, or null. */
export interface PbImage {
  documentId?: string;
  url: string;
  alt?: string;
  mime?: string;
}

/** A `link` field, after delivery resolved any internal target to a live path. */
export interface PbLink {
  href: string;
  documentId?: string;
  text?: string;
  target?: string;
  title?: string;
}

export type Data = Record<string, unknown>;

export const str = (data: Data, field: string): string =>
  typeof data[field] === "string" ? (data[field] as string) : "";

export const num = (data: Data, field: string): number | undefined =>
  typeof data[field] === "number" ? (data[field] as number) : undefined;

export const bool = (data: Data, field: string): boolean => data[field] === true;

export function img(data: Data, field: string): PbImage | null {
  const v = data[field];
  if (!v || typeof v !== "object") return null;
  const o = v as Partial<PbImage>;
  return typeof o.url === "string" && o.url ? { ...o, url: o.url } as PbImage : null;
}

/**
 * A link, or null when there is nothing to link to.
 *
 * An INTERNAL link whose target is not published resolves to `href: ""` — that
 * is deliberate on the CMS side (better than 404ing a visitor), and it means an
 * empty href must be treated as "no link". Rendering `<a href="">` would link
 * every unpublished target to the current page, which looks like a bug in your
 * site rather than unpublished content.
 */
export function link(data: Data, field: string): PbLink | null {
  const v = data[field];
  if (typeof v === "string") return v.trim() ? { href: v.trim() } : null;
  if (!v || typeof v !== "object") return null;
  const o = v as Partial<PbLink>;
  return typeof o.href === "string" && o.href.trim() ? ({ ...o, href: o.href } as PbLink) : null;
}

/**
 * The editor's own label for a link field, whatever its href resolved to.
 *
 * `link()` returns null when the href is empty (an unpublished internal
 * target), which would also throw away the text the editor typed — so read it
 * separately when you still want to show something.
 */
export function linkText(data: Data, field: string): string {
  const v = data[field];
  if (!v || typeof v !== "object") return "";
  const o = v as Partial<PbLink>;
  return (o.text || o.title || "").trim();
}

/** Visible text for a link: the editor's own label, else a sensible fallback. */
export const linkLabel = (l: PbLink | null, fallback = "Read more"): string =>
  (l?.text || l?.title || fallback).trim();

/** A `contentArea` field's blocks (empty array when absent or empty). */
export function area(data: Data, field: string): AreaBlock[] {
  const v = data[field];
  return Array.isArray(v) ? (v as AreaBlock[]) : [];
}

/**
 * A `richtext` field as HTML, ready for `set:html`.
 *
 * Safe to inject: the CMS sanitizes richtext on write against a fixed schema
 * (that sanitizer has its own property tests upstream), and `renderRichText`
 * escapes text nodes as it walks the document.
 */
export function rich(data: Data, field: string): string {
  const v = data[field];
  return isRichTextDoc(v) ? renderRichText(v) : "";
}

/** True when a richtext field has any content — for `{hasRich(...) && ...}`. */
export const hasRich = (data: Data, field: string): boolean => rich(data, field).trim().length > 0;

/**
 * First non-empty value among several field names.
 *
 * Content types are data, so a "title" can legitimately be called `heading`,
 * `title` or `name` on different types. Templates that work across types ask
 * for a role rather than a field name.
 */
export function firstStr(data: Data, fields: string[]): string {
  for (const f of fields) {
    const v = str(data, f);
    if (v) return v;
  }
  return "";
}

export function firstImg(data: Data, fields: string[]): PbImage | null {
  for (const f of fields) {
    const v = img(data, f);
    if (v) return v;
  }
  return null;
}

/**
 * Turn a video URL into something an <iframe> can play.
 *
 * Only https, and only hosts we recognise: an editor pasting a page URL rather
 * than an embed URL is the normal case, so YouTube/Vimeo watch links are
 * converted. Anything else returns null and the caller shows a plain link
 * instead of an iframe pointed at an arbitrary origin.
 */
export function embedUrl(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  let u: URL;
  try {
    u = new URL(value);
  } catch {
    return null;
  }
  if (u.protocol !== "https:") return null;
  const host = u.hostname.replace(/^www\./, "");

  if (host === "youtu.be") {
    const id = u.pathname.slice(1);
    return id ? `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}` : null;
  }
  if (host === "youtube.com" || host === "youtube-nocookie.com" || host === "m.youtube.com") {
    if (u.pathname.startsWith("/embed/")) return `https://www.youtube-nocookie.com${u.pathname}`;
    const id = u.searchParams.get("v");
    return id ? `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}` : null;
  }
  if (host === "vimeo.com") {
    const id = u.pathname.split("/").filter(Boolean)[0];
    return id && /^\d+$/.test(id) ? `https://player.vimeo.com/video/${id}` : null;
  }
  if (host === "player.vimeo.com") return u.href;
  return null;
}
