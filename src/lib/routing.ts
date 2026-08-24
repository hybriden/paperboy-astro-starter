/**
 * Splitting a locale prefix off a request path.
 *
 * Two things send locale-prefixed URLs to this app:
 *
 *   - The CMS admin's preview pane, which frames `{previewUrl}/{locale}{urlPath}`.
 *     Before this existed, side-by-side editing framed `/en` and got a 404.
 *   - A multilingual site, where `/nb/...` addresses the Norwegian content tree.
 *
 * A locale is GUESSED from shape, then confirmed by whether anything is actually
 * there — see the caller. Guessing alone would break a page whose slug happens to
 * be two letters ("/it", "/no"), which is why the caller falls back to treating
 * the whole path as a path.
 */

/** `en`, `nb`, `pt-BR` — not `blog`, not `a`, not `english`. */
export const looksLikeLocale = (segment: string | undefined): boolean =>
  !!segment && /^[a-z]{2}(-[a-z]{2})?$/i.test(segment);

export interface LocaleSplit {
  /** The candidate locale, if the first segment looked like one. */
  locale?: string;
  /** The path with that segment removed — always starts with "/". */
  rest: string;
  /** The whole thing as a path, for the fallback attempt. */
  full: string;
}

/** Split `Astro.params.path` into a locale candidate and the remaining path. */
export function splitLocalePath(pathParam: string | undefined): LocaleSplit {
  const segments = (pathParam ?? "").split("/").filter(Boolean);
  const full = `/${segments.join("/")}`;
  if (!looksLikeLocale(segments[0])) return { rest: full, full };
  return { locale: segments[0], rest: `/${segments.slice(1).join("/")}`, full };
}
