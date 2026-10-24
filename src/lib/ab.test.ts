import { assignArm, type AreaBlock, type DeliveryContent } from "@paperboycms/client";
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { describe, expect, it } from "vitest";
import StartPage from "../templates/StartPage.astro";
import { experimentView, mayRememberVisitor, parseExposures, visitorCookieAction, visitorKey } from "./ab";

/** A/B experiments, mirroring apps/web/app/lib/ab.test.tsx in the Paperboy repo. */

const jar = (c: Record<string, string>) => ({ get: (n: string) => (n in c ? { value: c[n]! } : undefined) });
const cookieless = { PAPERBOY_AB_MODE: "cookieless" };
const consentEnv = { PAPERBOY_AB_MODE: "consent" };

describe("visitor key", () => {
  it("cookieless: a fresh key per page view, even with a pb_vid and consent", () => {
    const c = jar({ pb_vid: "remembered", pb_consent: "1" });
    const a = visitorKey(c, cookieless);
    expect(a).not.toBe("remembered");
    expect(visitorKey(c, cookieless)).not.toBe(a);
    expect(visitorCookieAction(c, cookieless)).toBe("delete");
  });

  it("consent mode remembers pb_vid only while the consent cookie says yes", () => {
    expect(visitorKey(jar({ pb_vid: "v1", pb_consent: "1" }), consentEnv)).toBe("v1");
    expect(visitorKey(jar({ pb_vid: "v1", pb_consent: "true" }), consentEnv)).toBe("v1");
    expect(visitorKey(jar({ pb_vid: "v1", pb_consent: "0" }), consentEnv)).not.toBe("v1");
    expect(visitorKey(jar({ pb_vid: "v1" }), consentEnv)).not.toBe("v1");
  });

  it("mints pb_vid on consent, deletes it without, and honours a custom consent cookie name", () => {
    expect(visitorCookieAction(jar({ pb_consent: "1" }), consentEnv)).toBe("set");
    expect(visitorCookieAction(jar({ pb_consent: "1", pb_vid: "v" }), consentEnv)).toBeNull();
    expect(visitorCookieAction(jar({ pb_vid: "v" }), consentEnv)).toBe("delete");
    expect(visitorCookieAction(jar({}), consentEnv)).toBeNull();
    const env = { ...consentEnv, PAPERBOY_AB_CONSENT_COOKIE: "cmp_ok" };
    expect(mayRememberVisitor(jar({ cmp_ok: "true" }), env)).toBe(true);
    expect(mayRememberVisitor(jar({ pb_consent: "1" }), env)).toBe(false);
  });
});

const hero = (heading: string): AreaBlock => ({
  blockType: "HeroBlock",
  display: "automatic",
  shared: false,
  data: { heading },
  fieldTypes: { heading: "text" },
});
const arms = [{ key: "a" as const, weight: 50 }, { key: "b" as const, weight: 50, blocks: [hero("Version B")] }];
const page = {
  documentId: "doc1",
  type: "StartPage",
  kind: "page",
  locale: "en",
  name: "Home",
  slug: "home",
  urlPath: "/",
  cv: 1,
  data: { mainArea: [hero("Version A")] },
  fieldTypes: { mainArea: "contentArea" },
  seo: null,
  experiments: [{ id: 42, area: "mainArea", goal: "form", arms }],
} as unknown as DeliveryContent;

/** The first key that assignArm puts in `arm`. */
const keyFor = (arm: string): string => {
  for (let i = 0; ; i++) if (assignArm(42, `k${i}`, arms) === arm) return `k${i}`;
};

describe("experimentView", () => {
  it("two visitors assigned A and B get the two different renders, and each is counted", async () => {
    const container = await AstroContainer.create();
    const html = async (arm: string) => {
      const v = experimentView(page, { preview: false, visitorKey: () => keyFor(arm) });
      expect(v.exposures).toEqual([{ experimentId: 42, arm }]);
      return container.renderToString(StartPage, { props: { data: v.item.data, types: v.item.fieldTypes } });
    };
    const a = await html("a");
    const b = await html("b");
    expect(a).toContain("Version A");
    expect(a).not.toContain("Version B");
    expect(b).toContain("Version B");
    expect(b).not.toContain("Version A");
  });

  it("preview shows the forced version (or A) and is never counted", () => {
    const forced = experimentView(page, { preview: true, pbab: "42:b", visitorKey: () => keyFor("a") });
    expect(forced.exposures).toEqual([]);
    expect(JSON.stringify(forced.item.data)).toContain("Version B");
    const plain = experimentView(page, { preview: true, visitorKey: () => keyFor("b") });
    expect(plain.exposures).toEqual([]);
    expect(JSON.stringify(plain.item.data)).toContain("Version A");
  });

  it("pbab outside preview is ignored: the visitor key decides", () => {
    const v = experimentView(page, { preview: false, pbab: "42:b", visitorKey: () => keyFor("a") });
    expect(v.exposures).toEqual([{ experimentId: 42, arm: "a" }]);
  });

  it("a page without experiments is untouched and never mints a key", () => {
    const plain = { ...page, experiments: undefined };
    const v = experimentView(plain, { preview: false, visitorKey: () => { throw new Error("no key needed"); } });
    expect(v).toEqual({ item: plain, exposures: [] });
  });
});

describe("parseExposures (the form post's hidden field)", () => {
  it("keeps well-formed exposures", () => {
    expect(parseExposures('[{"experimentId":42,"arm":"b"}]')).toEqual([{ experimentId: 42, arm: "b" }]);
  });

  it("drops anything else, and caps at 10", () => {
    expect(parseExposures(null)).toEqual([]);
    expect(parseExposures("not json")).toEqual([]);
    expect(parseExposures('{"experimentId":42,"arm":"b"}')).toEqual([]);
    expect(parseExposures('[{"experimentId":"42","arm":"b"},{"experimentId":1,"arm":"e"},{"experimentId":-1,"arm":"a"},null]')).toEqual([]);
    const many = JSON.stringify(Array.from({ length: 20 }, (_, i) => ({ experimentId: i + 1, arm: "a" })));
    expect(parseExposures(many)).toHaveLength(10);
  });
});
