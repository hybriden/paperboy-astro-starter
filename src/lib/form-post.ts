/**
 * The two decisions a form POST needs made before it can answer: how long the
 * visitor really had the form open, and where to send them back to.
 *
 * They live here rather than in the route because both have failure modes worth
 * testing directly — one silently discarded real enquiries, and the other reads
 * a path out of the request body.
 */

/**
 * How long the visitor had the form open, in ms.
 *
 * The JS timer wins when it reports something, but a form submitted WITHOUT
 * JavaScript reports 0 — and the CMS reads an implausibly fast submission as a
 * bot, so a genuine enquiry was discarded while the visitor was told it had been
 * sent. `pb_rendered_at` is stamped server-side when the form renders, which
 * gives a truthful duration on that path too.
 *
 * `undefined` (rather than 0) when neither is usable: a missing timer is not
 * evidence of a bot, and the CMS treats an absent value as "cannot vouch".
 */
export function elapsedMs(form: Pick<FormData, "get">): number | undefined {
  const fromTimer = Number(form.get("pb_elapsed_ms"));
  if (Number.isFinite(fromTimer) && fromTimer > 0) return fromTimer;
  const renderedAt = Number(form.get("pb_rendered_at"));
  if (Number.isFinite(renderedAt) && renderedAt > 0) return Math.max(0, Date.now() - renderedAt);
  return undefined;
}

/**
 * Where a NO-JS submission goes next.
 *
 * A plain form POST answered with JSON leaves the visitor looking at
 * `{"ok":true}`, so the route answers 303 back to the page they came from,
 * carrying the outcome. The token is the form id, so a page with two forms shows
 * the message on the right one.
 *
 * `pb_return_to` comes from the request body, so it is treated as hostile:
 * anything that is not a plain same-origin path falls back to "/". An open
 * redirect is not something a form endpoint should offer.
 */
export function backTo(
  form: Pick<FormData, "get">,
  ok: boolean,
  referer?: string | null,
  origin?: string,
): string {
  const token = String(form.get("pb_form_id") ?? "").slice(0, 8);
  const suffix = `?${ok ? "sent" : "formError"}=${encodeURIComponent(token)}#pb-form`;

  // The REFERER is preferred over the posted field. Both are attacker-influenced
  // and both are checked the same way, but the referer is what the browser
  // actually came from — and a review found the posted echo landing visitors on
  // "/" (a page with no form, so a no-JS submission ended in silence) while the
  // unit test on the field alone stayed green.
  for (const candidate of [refererPath(referer, origin), String(form.get("pb_return_to") ?? "")]) {
    if (safePath(candidate)) return candidate.split("?")[0].split("#")[0] + suffix;
  }
  return "/" + suffix;
}

/** Same-origin path only: never a scheme, a host, or a protocol-relative "//". */
function safePath(value: string): boolean {
  return /^\/(?!\/)[^\\]*$/.test(value);
}

/**
 * The path part of a Referer — but only when it came from THIS site.
 *
 * A cross-origin referer cannot cause an off-site redirect (only the path is
 * used), but it should not get to choose which of our pages the visitor lands
 * on either. When `origin` is not supplied, no referer is trusted.
 */
function refererPath(referer?: string | null, origin?: string): string {
  if (!referer || !origin) return "";
  try {
    const url = new URL(referer);
    return url.origin === origin ? url.pathname : "";
  } catch {
    return "";
  }
}
