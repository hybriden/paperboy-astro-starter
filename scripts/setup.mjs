#!/usr/bin/env node
/**
 * One command to get this starter talking to a Paperboy.
 *
 *   npm run setup
 *
 * What it does, in order, stopping as soon as it has what it needs:
 *
 *   1. Reads an existing .env — and NEVER overwrites it without --force.
 *   2. Looks for a Paperboy checkout next door and reads its .env. This is the
 *      case worth optimising for: `docker compose up` in a sibling directory
 *      generates RANDOM delivery keys and a random PREVIEW_SECRET, so they
 *      cannot be guessed — but they can be read.
 *   3. Probes http://localhost:8091 for a running API.
 *   4. Asks, for whatever is still missing.
 *
 * Then it VERIFIES each value against the live API before writing anything, so a
 * typo fails here — in a terminal, with an explanation — rather than in
 * production as an empty page.
 *
 * Zero dependencies, on purpose: `npm run setup` has to work on a fresh clone
 * before anyone has thought about tooling.
 *
 * Flags:
 *   --api <url>     API origin (default: probed, else asked)
 *   --from <path>   A Paperboy .env to read keys from
 *   --yes           Never prompt; fail if something is missing (for CI/demos)
 *   --force         Overwrite an existing .env
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline/promises";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ENV_PATH = join(ROOT, ".env");
const DEFAULT_API = "http://localhost:8091";

/** The four values this app needs, and where a human finds each one. */
export const KEYS = [
  { name: "PAPERBOY_API_URL", hint: "your instance origin, e.g. https://cms.example.com" },
  { name: "PAPERBOY_PUBLIC_KEY", hint: "Settings -> API keys, the pk_live_... one" },
  { name: "PAPERBOY_PREVIEW_KEY", hint: "Settings -> API keys, the prv_... one (server-side only)" },
  { name: "PREVIEW_SECRET", hint: "the API's own PREVIEW_SECRET, byte-identical" },
];

const c = {
  bold: (s) => `[1m${s}[0m`,
  green: (s) => `[32m${s}[0m`,
  red: (s) => `[31m${s}[0m`,
  dim: (s) => `[2m${s}[0m`,
};

/**
 * Parse a dotenv file well enough for this job: KEY=value, `export` prefixes,
 * comments, and surrounding quotes. Not a full dotenv implementation — it reads
 * files we also write.
 *
 * @param {string} text
 * @returns {Record<string, string>}
 */
export function parseEnvFile(text) {
  /** @type {Record<string, string>} */
  const out = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 1) continue;
    const key = line.slice(0, eq).replace(/^export\s+/, "").trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (key) out[key] = value;
  }
  return out;
}

/**
 * Serialise .env, quoting only when a value would otherwise be ambiguous.
 *
 * @param {Record<string, string>} values
 * @returns {string}
 */
export function formatEnvFile(values) {
  const quote = (v) => (/^[\w./:@+-]*$/.test(v) ? v : JSON.stringify(v));
  return [
    "# Written by `npm run setup`. Safe to edit by hand.",
    "# PAPERBOY_PREVIEW_KEY and PREVIEW_SECRET are server-side only — never expose them to a browser.",
    "",
    ...KEYS.map(({ name }) => `${name}=${quote(values[name] ?? "")}`),
    "",
  ].join("\n");
}

/** Places a Paperboy checkout usually sits, relative to this starter. */
export const NEIGHBOUR_ENVS = [
  "../paperboy/.env",
  "../../paperboy/.env",
  "./paperboy/.env",
  "../cms/.env",
];

/**
 * Pull what we need out of a Paperboy .env.
 *
 * Its PAPERBOY_PUBLIC_KEY / PAPERBOY_PREVIEW_KEY are the values its seed turns
 * into delivery keys, and PREVIEW_SECRET must match on both sides for preview to
 * verify — so the file next door holds three of our four values exactly.
 *
 * @param {Record<string, string>} env
 * @param {string} [apiFallback]
 * @returns {Record<string, string>}
 */
export function fromPaperboyEnv(env, apiFallback = DEFAULT_API) {
  /** @type {Record<string, string>} */
  const found = {};
  if (env.PAPERBOY_PUBLIC_KEY) found.PAPERBOY_PUBLIC_KEY = env.PAPERBOY_PUBLIC_KEY;
  if (env.PAPERBOY_PREVIEW_KEY) found.PAPERBOY_PREVIEW_KEY = env.PAPERBOY_PREVIEW_KEY;
  if (env.PREVIEW_SECRET) found.PREVIEW_SECRET = env.PREVIEW_SECRET;
  // API_PORT is what its compose publishes; fall back to the documented 8091.
  const port = env.API_PORT || env.API_HOST_PORT || "8091";
  found.PAPERBOY_API_URL = env.PAPERBOY_API_URL || apiFallback.replace(/:\d+$/, `:${port}`);
  return found;
}

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? undefined : (args[i + 1] ?? "");
};
const has = (name) => args.includes(`--${name}`);

/**
 * GET a delivery endpoint with a key.
 *
 * @param {string} apiUrl
 * @param {string} path
 * @param {string | undefined} key
 * @returns {Promise<{ok: boolean, status: number, body?: any, error?: string}>}
 */
async function probe(apiUrl, path, key) {
  const url = `${apiUrl.replace(/\/+$/, "")}/api/v1/delivery${path}`;
  try {
    const res = await fetch(url, {
      headers: key ? { authorization: `Bearer ${key}` } : {},
      signal: AbortSignal.timeout(8000),
    });
    let body = null;
    try {
      body = await res.json();
    } catch {
      /* not JSON — fine, the status is what matters */
    }
    return { ok: res.ok, status: res.status, body };
  } catch (error) {
    return { ok: false, status: 0, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Explain a failure the way the reader can act on.
 *
 * @param {{status: number, error?: string}} result
 */
function explain(result) {
  if (result.status === 0) return `cannot reach it (${result.error})`;
  if (result.status === 401) return "the key was rejected (401) — wrong key, or it belongs to another site";
  if (result.status === 404) return "reached the server, but that is not a Paperboy delivery API (404)";
  return `unexpected status ${result.status}`;
}

async function main() {
  console.log(c.bold("\nPaperboy starter setup\n"));

  if (existsSync(ENV_PATH) && !has("force")) {
    const existing = parseEnvFile(readFileSync(ENV_PATH, "utf8"));
    const missing = KEYS.filter(({ name }) => !existing[name]).map(({ name }) => name);
    console.log(`Found an existing ${c.bold(".env")} — leaving it alone (pass --force to replace it).`);
    if (missing.length) console.log(c.red(`Still missing: ${missing.join(", ")}`));
    const verified = await verify(existing);
    process.exitCode = verified ? 0 : 1;
    return;
  }

  /** Gather candidates without asking anything yet. */
  const values = {};
  if (flag("api")) values.PAPERBOY_API_URL = flag("api");
  // The environment counts as an answer — that is how --yes works in CI.
  for (const { name } of KEYS) {
    if (!values[name] && process.env[name]) values[name] = process.env[name];
  }

  const fromPath = flag("from") ?? NEIGHBOUR_ENVS.map((p) => resolve(ROOT, p)).find((p) => existsSync(p));
  if (fromPath && existsSync(fromPath)) {
    const neighbour = fromPaperboyEnv(parseEnvFile(readFileSync(fromPath, "utf8")), values.PAPERBOY_API_URL ?? DEFAULT_API);
    Object.assign(values, { ...neighbour, ...values });
    console.log(`Read keys from a Paperboy next door: ${c.dim(fromPath)}`);
  }

  if (!values.PAPERBOY_API_URL) {
    const local = await probe(DEFAULT_API, "/pages", "");
    // 401 is a GOOD sign here: something is listening and it wants a key.
    if (local.status === 401 || local.ok) {
      values.PAPERBOY_API_URL = DEFAULT_API;
      console.log(`Found an API listening on ${c.bold(DEFAULT_API)}`);
    }
  }

  const missing = KEYS.filter(({ name }) => !values[name]);
  if (missing.length && has("yes")) {
    console.log(c.red(`\nMissing: ${missing.map((m) => m.name).join(", ")}`));
    console.log("Run without --yes to be prompted, or pass them in the environment.");
    process.exit(1);
  }

  if (missing.length) {
    console.log(`\nI need ${missing.length} value${missing.length === 1 ? "" : "s"}. Enter to accept a default.\n`);
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    for (const { name, hint } of missing) {
      const fallback = name === "PAPERBOY_API_URL" ? DEFAULT_API : "";
      const answer = (await rl.question(`${c.bold(name)} ${c.dim(`(${hint})`)}${fallback ? ` [${fallback}]` : ""}: `)).trim();
      values[name] = answer || fallback;
    }
    rl.close();
  }

  if (!(await verify(values))) {
    console.log(c.red("\nNothing was written — fix the above and run setup again."));
    process.exit(1);
  }

  writeFileSync(ENV_PATH, formatEnvFile(values), "utf8");
  console.log(`\n${c.green("Wrote .env")}`);
  console.log(`\nNext: ${c.bold("npm run dev")} → http://localhost:4321`);
  console.log(`${c.dim("Every block type, styled, with no content needed: http://localhost:4321/kitchen-sink")}\n`);
}

/**
 * Check the values against the live API and say what was found.
 *
 * Both keys are checked, not just the public one: the preview key is the half
 * that serves drafts, and a broken preview key only shows up as "preview does
 * nothing" much later, inside the CMS, where it is far harder to diagnose.
 *
 * @param {Record<string, string>} values
 * @param {(line: string) => void} [log]
 * @returns {Promise<boolean>}
 */
export async function verify(values, log = console.log) {
  const api = (values.PAPERBOY_API_URL ?? "").replace(/\/+$/, "");
  if (!api) {
    log(c.red("No PAPERBOY_API_URL — nothing to check."));
    return false;
  }
  console.log(`\nChecking ${c.bold(api)} ...`);

  let ok = true;

  const pub = await probe(api, "/pages", values.PAPERBOY_PUBLIC_KEY);
  if (pub.ok) {
    const pages = Array.isArray(pub.body?.pages) ? pub.body.pages.length : undefined;
    log(c.green(`  public key  OK${pages === undefined ? "" : ` — ${pages} published page${pages === 1 ? "" : "s"}`}`));
  } else {
    log(c.red(`  public key  FAILED — ${explain(pub)}`));
    ok = false;
  }

  const prev = await probe(api, "/pages", values.PAPERBOY_PREVIEW_KEY);
  if (prev.ok) log(c.green("  preview key OK"));
  else {
    log(c.red(`  preview key FAILED — ${explain(prev)}`));
    ok = false;
  }

  const start = await probe(api, "/start", values.PAPERBOY_PUBLIC_KEY);
  if (start.ok && start.body?.type) {
    log(c.green(`  start page  OK — "${start.body.name ?? start.body.type}" (${start.body.type})`));
  } else if (start.status === 404) {
    // Not fatal: an empty instance has no start page yet.
    log(c.dim("  start page  none configured yet (Settings -> Site -> Start page)"));
  }

  if (pub.status === 401 && prev.status === 401) {
    // Seen the first time this ran against a real stack: `docker compose up`
    // runs the seed, but the seed SKIPS a database that already holds content —
    // so a freshly generated .env can carry keys the database has never seen.
    log("");
    log("  Both keys were rejected, but the API answered — so the URL is right and");
    log("  these keys are not in its database. That happens when the instance was");
    log("  seeded with different keys (the seed skips a database that already has");
    log("  content, so a newly generated .env can disagree with it). Either mint a");
    log("  key in the admin under Settings -> API keys and paste it here, or reseed");
    log("  that instance deliberately with FORCE_SEED=1 (which erases its content).");
  }

  if (!values.PREVIEW_SECRET) {
    // Cannot be verified over HTTP — it is a shared secret, not a credential we
    // present. Say so rather than implying it was checked.
    log(c.red("  PREVIEW_SECRET missing — in-editor preview will not work"));
    ok = false;
  } else {
    log(c.dim("  PREVIEW_SECRET set (cannot be verified remotely — it must match the API's exactly)"));
  }

  return ok;
}

// Only run when executed, so the helpers above stay importable by tests.
if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main().catch((error) => {
    console.error(c.red(`\nsetup failed: ${error?.message ?? error}`));
    process.exit(1);
  });
}
