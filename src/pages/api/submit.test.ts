import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./submit";

/**
 * The ROUTE, not just its helpers.
 *
 * A review pointed out that `form-post.test.ts` was green while the running
 * route sent no-JS visitors to the wrong page — a unit test on a helper cannot
 * see whether the route passes it the right arguments. So this drives the real
 * handler with a stubbed CMS and asserts what comes back over the wire.
 */

const CMS = "http://cms.test";

/** Minimal stand-in for the bits of APIContext this route reads. */
const context = (body: URLSearchParams, headers: Record<string, string> = {}) =>
  ({
    request: new Request("http://localhost:4321/api/submit", { method: "POST", headers, body }),
    url: new URL("http://localhost:4321/api/submit"),
    locals: {},
  }) as unknown as Parameters<typeof POST>[0];

const fields = (extra: Record<string, string> = {}) =>
  new URLSearchParams({
    pb_form_id: "doc_form_1",
    pb_honeypot_field: "pb_contact_reason",
    pb_rendered_at: String(Date.now() - 9000),
    pb_return_to: "/contact",
    name: "A Person",
    email: "a@b.co",
    message: "A long enough message to satisfy the rule.",
    consent: "on",
    ...extra,
  });

/** What the CMS would answer. */
const cmsReplies = (status: number, payload: unknown) =>
  vi.fn(async () => new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json" } }));

beforeEach(() => {
  vi.stubEnv("PAPERBOY_API_URL", CMS);
  vi.stubEnv("PAPERBOY_PUBLIC_KEY", "pk_live_test");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("POST /api/submit — a browser without JavaScript", () => {
  it("redirects back to the page that submitted, not to the site root", () => {
    // The bug: a no-JS visitor landed on "/", which has no form, so a stored
    // submission produced no confirmation anywhere.
    vi.stubGlobal("fetch", cmsReplies(200, { submissionId: "sub_1" }));
    return POST(context(fields())).then((res) => {
      expect(res.status).toBe(303);
      expect(res.headers.get("location")).toBe("/contact?sent=doc_form#pb-form");
    });
  });

  it("carries a rejection back to the same page", async () => {
    vi.stubGlobal("fetch", cmsReplies(422, { fields: { email: "Enter a valid email address." } }));
    const res = await POST(context(fields({ email: "nope" })));
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/contact?formError=doc_form#pb-form");
  });

  it("prefers a same-origin referer over the posted field", async () => {
    vi.stubGlobal("fetch", cmsReplies(200, { submissionId: "sub_1" }));
    const res = await POST(context(fields({ pb_return_to: "/" }), { referer: "http://localhost:4321/contact" }));
    expect(res.headers.get("location")).toBe("/contact?sent=doc_form#pb-form");
  });

  it("ignores a referer from another origin, falling back to the posted field", async () => {
    vi.stubGlobal("fetch", cmsReplies(200, { submissionId: "sub_1" }));
    const res = await POST(context(fields(), { referer: "https://evil.example/contact" }));
    expect(res.headers.get("location")).toBe("/contact?sent=doc_form#pb-form");
  });

  it("never redirects off-site, whatever the request asks for", async () => {
    vi.stubGlobal("fetch", cmsReplies(200, { submissionId: "sub_1" }));
    for (const hostile of ["https://evil.example/x", "//evil.example", "\\\\evil.example"]) {
      const res = await POST(context(fields({ pb_return_to: hostile })));
      expect(res.headers.get("location"), hostile).toBe("/?sent=doc_form#pb-form");
    }
  });
});

describe("POST /api/submit — a fetch() caller", () => {
  it("gets the per-field messages as JSON", async () => {
    vi.stubGlobal("fetch", cmsReplies(422, { fields: { message: "A sentence or two is plenty." } }));
    const res = await POST(context(fields({ message: "no" }), { accept: "application/json" }));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "A sentence or two is plenty.",
      fields: { message: "A sentence or two is plenty." },
    });
  });

  it("reports a discarded submission so a caller does not notify on spam", async () => {
    // The CMS answers 202-with-a-sentinel for its invisible spam checks, so a bot
    // learns nothing. Anything wired to "sent" must be able to tell the difference.
    vi.stubGlobal("fetch", cmsReplies(200, { submissionId: "sub_discarded" }));
    const res = await POST(context(fields(), { accept: "application/json" }));
    await expect(res.json()).resolves.toEqual({ ok: true, discarded: true });
  });
});

describe("POST /api/submit — what it sends to the CMS", () => {
  it("forwards only the visitor's answers, never the control fields", async () => {
    const spy = cmsReplies(200, { submissionId: "sub_1" });
    vi.stubGlobal("fetch", spy);
    await POST(context(fields()));

    const sent = JSON.parse(String(spy.mock.calls[0][1].body));
    expect(Object.keys(sent.values).sort()).toEqual(["consent", "email", "message", "name"]);
    // Unknown keys are rejected by the CMS (422), so leaking a control field
    // here would fail every submission.
    expect(sent.values).not.toHaveProperty("pb_form_id");
    expect(sent.values).not.toHaveProperty("pb_return_to");
    expect(sent.values).not.toHaveProperty("pb_contact_reason");
  });

  it("sends a real duration when the JS timer reported nothing", async () => {
    // Without this the CMS reads 0ms as a bot and discards a genuine enquiry.
    const spy = cmsReplies(200, { submissionId: "sub_1" });
    vi.stubGlobal("fetch", spy);
    await POST(context(fields({ pb_elapsed_ms: "0" })));

    const sent = JSON.parse(String(spy.mock.calls[0][1].body));
    expect(sent.elapsedMs).toBeGreaterThanOrEqual(9000);
  });
});
