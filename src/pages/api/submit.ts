import type { APIContext } from "astro";
import { config } from "../../lib/cms";
import { backTo, elapsedMs } from "../../lib/form-post";

/**
 * Form submissions.
 *
 * The browser posts here and this route forwards to Paperboy. That server hop is
 * the point: the CMS validates the answers against the form's CURRENT PUBLISHED
 * definition, so the rules the visitor was shown are the rules actually
 * enforced, and the submission is stored before anything else can fail.
 *
 * Field names are NOT hardcoded. Whatever the form defines is forwarded as-is,
 * and the CMS REJECTS any key its definition doesn't declare (422) rather than
 * silently dropping it — so a stale frontend fails loudly instead of losing
 * answers.
 *
 * Add your own notification here (email, Slack, a CRM) after a successful store,
 * or subscribe to the `form.submitted` webhook in the admin and keep this route
 * doing one job.
 */
export const prerender = false;

/** Handled by this route or the CMS itself — not visitor answers. */
const CONTROL_FIELDS = new Set([
  "pb_form_id",
  "pb_honeypot_field",
  "pb_elapsed_ms",
  "pb_rendered_at",
  "pb_return_to",
]);

/** A fetch() caller asks for JSON; a plain form post does not. */
const wantsJson = (request: Request) => (request.headers.get("accept") ?? "").includes("application/json");

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/** 303, so the browser follows it with a GET and a refresh cannot re-submit. */
const redirect = (location: string) => new Response(null, { status: 303, headers: { location } });

export async function POST(context: APIContext): Promise<Response> {
  const env = (context.locals as { runtime?: { env?: Record<string, string | undefined> } }).runtime?.env;
  const { apiUrl, publicKey } = config(env);
  if (!apiUrl || !publicKey) return json({ error: "CMS is not configured." }, 500);

  const form = await context.request.formData();
  const formId = String(form.get("pb_form_id") ?? "");
  if (!formId) {
    if (!wantsJson(context.request)) return redirect(backTo(form, false));
    return json({ error: "Missing form id." }, 400);
  }

  // The honeypot's field name comes from the CMS, so read whichever hidden field
  // the rendered form carried rather than assuming one here.
  const honeypotName = String(form.get("pb_honeypot_field") ?? "");

  const values: Record<string, string> = {};
  for (const [key, value] of form.entries()) {
    if (CONTROL_FIELDS.has(key) || key === honeypotName) continue;
    if (typeof value === "string") values[key] = value;
  }

  const res = await fetch(`${apiUrl}/api/v1/delivery/forms/${encodeURIComponent(formId)}/submissions`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${publicKey}`,
      "content-type": "application/json",
      // Makes a retried POST idempotent instead of storing the message twice.
      "idempotency-key": crypto.randomUUID(),
    },
    body: JSON.stringify({
      values,
      elapsedMs: elapsedMs(form),
      honeypot: honeypotName ? String(form.get(honeypotName) ?? "") : "",
    }),
  });

  if (res.status === 422) {
    // Per-field messages, in the editor's own wording. Render each beside its
    // input (WCAG 3.3.1) rather than showing only the first.
    const body = (await res.json()) as { fields?: Record<string, string> };
    const first = Object.values(body.fields ?? {})[0];
    if (!wantsJson(context.request)) return redirect(backTo(form, false));
    return json({ error: first ?? "Please check the form and try again.", fields: body.fields ?? {} }, 400);
  }

  if (res.ok) {
    const body = (await res.json().catch(() => ({}))) as { submissionId?: string };
    // The CMS answers 202 with this sentinel when its invisible spam checks
    // discard a submission (hidden field filled, or completed faster than a
    // human could type). It looks like success so a bot learns nothing — so if
    // you add a notification below, skip it on this branch or the spam lands in
    // the inbox those checks exist to protect.
    const discarded = body.submissionId === "sub_discarded";
    if (!wantsJson(context.request)) return redirect(backTo(form, true));
    return json({ ok: true, discarded }, 200);
  }

  if (!wantsJson(context.request)) return redirect(backTo(form, false));
  return json({ error: "Could not send the message. Please try again." }, 502);
}
