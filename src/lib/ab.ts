import { applyExperiments, type DeliveryContent, type ExperimentExposure } from "@paperboycms/client";
import { readEnv, type Env } from "./cms";

/**
 * A/B experiments: the visitor key and the per-page pick.
 *
 * The version is picked on the SERVER from a visitor key, never swapped in the
 * browser (that flickers). Two privacy modes, from env PAPERBOY_AB_MODE:
 *
 *  - `cookieless` (default): a fresh random key per page view. Nothing is stored
 *    on the device, so no consent is needed; only a goal on the same page (a
 *    form) can be attributed.
 *  - `consent`: a first-party random `pb_vid` cookie (13 months) so a visitor
 *    keeps their version, set ONLY while the consent cookie
 *    (PAPERBOY_AB_CONSENT_COOKIE, default `pb_consent`, "1"/"true") is present.
 *    In Norway a cookie that remembers the version needs consent (ekomloven
 *    §3-15): it is not "strictly necessary". Without consent: cookieless.
 *
 * The user agent is never read: robots get a key like anyone, and showing
 * crawlers something else would be cloaking.
 *
 * Same behaviour as apps/web/app/lib/ab.ts in the Paperboy repo.
 */

export const VISITOR_COOKIE = "pb_vid";
export const VISITOR_COOKIE_MAX_AGE = 60 * 60 * 24 * 395; // 13 months, in seconds

type CookieReader = { get(name: string): { value: string } | undefined };

/** Consent mode AND the visitor consented: only then may `pb_vid` exist. */
export function mayRememberVisitor(cookies: CookieReader, env?: Env): boolean {
  if (readEnv(env, "PAPERBOY_AB_MODE") !== "consent") return false;
  const consent = cookies.get(readEnv(env, "PAPERBOY_AB_CONSENT_COOKIE") || "pb_consent")?.value;
  return consent === "1" || consent === "true";
}

/** The key this page view is assigned with: the remembered id when allowed, else a fresh one. */
export function visitorKey(cookies: CookieReader, env?: Env): string {
  const remembered = mayRememberVisitor(cookies, env) ? cookies.get(VISITOR_COOKIE)?.value : undefined;
  return remembered || crypto.randomUUID();
}

/**
 * What the middleware does with `pb_vid` on this request: mint it (consented,
 * none yet), delete it (consent withdrawn or cookieless mode), or leave it.
 */
export function visitorCookieAction(cookies: CookieReader, env?: Env): "set" | "delete" | null {
  const has = cookies.get(VISITOR_COOKIE) !== undefined;
  if (mayRememberVisitor(cookies, env)) return has ? null : "set";
  return has ? "delete" : null;
}

/**
 * The page's rendered item and the exposures to report. Preview shows the
 * version the admin forced (`?pbab=<id>:<arm>`, honoured only because the
 * caller passed the preview check) or A, and is never counted.
 */
export function experimentView<T extends DeliveryContent>(
  content: T,
  opts: { preview: boolean; pbab?: string | null; visitorKey: () => string },
): { item: T; exposures: ExperimentExposure[] } {
  if (!content.experiments?.length) return { item: content, exposures: [] };
  if (opts.preview) return { item: applyExperiments(content, { force: opts.pbab ?? null }).item, exposures: [] };
  return applyExperiments(content, { visitorKey: opts.visitorKey() });
}

const ARMS = new Set(["a", "b", "c", "d"]);
const MAX_EXPOSURES = 10;

/**
 * The exposures a form post says its page showed (the `pb_experiments` hidden
 * field). It comes from the request body, so it is hostile: anything that is not
 * a list of `{experimentId, arm}` is dropped, and at most 10 are kept. The CMS
 * still checks each against its own running experiments.
 */
export function parseExposures(raw: unknown): ExperimentExposure[] {
  let list: unknown;
  try {
    list = JSON.parse(String(raw ?? ""));
  } catch {
    return [];
  }
  if (!Array.isArray(list)) return [];
  const out: ExperimentExposure[] = [];
  for (const e of list) {
    const { experimentId, arm } = (e ?? {}) as Record<string, unknown>;
    if (Number.isSafeInteger(experimentId) && (experimentId as number) > 0 && typeof arm === "string" && ARMS.has(arm)) {
      out.push({ experimentId: experimentId as number, arm: arm as ExperimentExposure["arm"] });
    }
    if (out.length === MAX_EXPOSURES) break;
  }
  return out;
}
