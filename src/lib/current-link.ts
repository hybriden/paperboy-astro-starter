import { splitLocalePath } from "./routing";

/**
 * Is this menu link the page you are on?
 *
 * "I can't see what page I'm on in the menu" — and the naive fix (compare the
 * href to the pathname) gets three things wrong on this site:
 *
 *   - LOCALE PREFIXES. The menu says `/services`, the admin's preview pane frames
 *     `/en/services`, and a Norwegian visitor is on `/nb/tjenester`. Comparing
 *     raw strings marks nothing as current inside the CMS preview, which is
 *     exactly where an editor is looking at the menu.
 *   - HOME. `/` is a prefix of every path, so ancestor matching marks Home as
 *     current on every page unless it is special-cased.
 *   - ARTICLES. On `/journal/some-post` the useful answer is that you are under
 *     "Journal" — but you are not ON the Journal page, so it is not
 *     `aria-current="page"`. Those are two different states and this returns
 *     both, so the markup can be honest and still show you where you are.
 */
export type LinkState = "page" | "section" | undefined;

/** Path only, locale prefix and trailing slash removed. `/en/services/` → `/services`. */
function normalise(raw: string): string | undefined {
  if (!raw) return undefined;
  // Anything with a scheme or a bare fragment is not a page on this site.
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw) || raw.startsWith("#") || raw.startsWith("//")) return undefined;

  const path = raw.split("#")[0]!.split("?")[0]!;
  const { rest } = splitLocalePath(path);
  if (rest === "/") return "/";
  return rest.replace(/\/+$/, "") || "/";
}

export function linkState(href: string | undefined, currentPath: string): LinkState {
  const target = normalise(href ?? "");
  const here = normalise(currentPath);
  if (!target || !here) return undefined;

  if (target === here) return "page";
  // Home is a prefix of everything, so it is only ever the current PAGE.
  if (target === "/") return undefined;
  return here.startsWith(`${target}/`) ? "section" : undefined;
}
