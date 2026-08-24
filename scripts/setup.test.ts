import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
// Plain JS with JSDoc types, on purpose: the setup script has to run on a fresh
// clone with nothing installed but node.
import { formatEnvFile, fromPaperboyEnv, parseEnvFile, verify } from "./setup.mjs";

/**
 * `npm run setup` is the first thing anyone runs, so its failure modes matter
 * more than most code here: it must never clobber a .env, never write values it
 * could not verify, and must say something actionable when a key is wrong.
 */

describe("parseEnvFile", () => {
  it("reads the shapes a real .env has", () => {
    const parsed = parseEnvFile(
      [
        "# a comment",
        "",
        "PAPERBOY_API_URL=http://localhost:8091",
        "export PAPERBOY_PUBLIC_KEY=pk_live_abc",
        'PREVIEW_SECRET="quoted secret"',
        "SINGLE='single quoted'",
        "WITH_EQUALS=a=b=c",
        "  SPACED = spaced  ",
        "NOT_A_LINE",
        "=novalue",
      ].join("\n"),
    );
    expect(parsed.PAPERBOY_API_URL).toBe("http://localhost:8091");
    expect(parsed.PAPERBOY_PUBLIC_KEY).toBe("pk_live_abc");
    expect(parsed.PREVIEW_SECRET).toBe("quoted secret");
    expect(parsed.SINGLE).toBe("single quoted");
    // A base64-ish secret can contain "=" — truncating at the first one would
    // silently produce a secret that never verifies.
    expect(parsed.WITH_EQUALS).toBe("a=b=c");
    expect(parsed.SPACED).toBe("spaced");
    expect(parsed.NOT_A_LINE).toBeUndefined();
  });
});

describe("formatEnvFile", () => {
  it("round-trips through the parser", () => {
    const values = {
      PAPERBOY_API_URL: "https://cms.example.com",
      PAPERBOY_PUBLIC_KEY: "pk_live_abc123",
      PAPERBOY_PREVIEW_KEY: "prv_def456",
      PREVIEW_SECRET: "s3cret==",
    };
    expect(parseEnvFile(formatEnvFile(values))).toMatchObject(values);
  });

  it("warns in the file itself which values are server-side only", () => {
    expect(formatEnvFile({})).toContain("server-side only");
  });
});

describe("fromPaperboyEnv", () => {
  it("takes the keys a Paperboy install generated", () => {
    // Its setup script randomises these, so reading them is the only way.
    const found = fromPaperboyEnv({
      PAPERBOY_PUBLIC_KEY: "pk_live_random",
      PAPERBOY_PREVIEW_KEY: "prv_random",
      PREVIEW_SECRET: "random-secret",
      SESSION_SECRET: "not ours",
    });
    expect(found).toEqual({
      PAPERBOY_PUBLIC_KEY: "pk_live_random",
      PAPERBOY_PREVIEW_KEY: "prv_random",
      PREVIEW_SECRET: "random-secret",
      PAPERBOY_API_URL: "http://localhost:8091",
    });
  });

  it("follows a non-default API port", () => {
    expect(fromPaperboyEnv({ API_PORT: "9091" }).PAPERBOY_API_URL).toBe("http://localhost:9091");
  });
});

/** A stand-in Paperboy: 200 for the right bearer, 401 for anything else. */
function stubApi(keys: { public: string; preview: string }) {
  return createServer((req, res) => {
    const auth = (req.headers.authorization ?? "").replace(/^Bearer /, "");
    const known = auth === keys.public || auth === keys.preview;
    if (!known) {
      res.writeHead(401, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "unauthorized" }));
      return;
    }
    if (req.url?.startsWith("/api/v1/delivery/pages")) {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ pages: [{ urlPath: "/" }, { urlPath: "/about" }] }));
      return;
    }
    if (req.url?.startsWith("/api/v1/delivery/start")) {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ type: "StartPage", name: "Home" }));
      return;
    }
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "not found" }));
  });
}

describe("verify", () => {
  let server: Server;
  let api = "";

  beforeAll(async () => {
    server = stubApi({ public: "pk_live_good", preview: "prv_good" });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const addr = server.address();
    api = typeof addr === "object" && addr ? `http://127.0.0.1:${addr.port}` : "";
  });

  afterAll(() => new Promise<void>((r) => server.close(() => r())));

  const run = async (values: Record<string, string>) => {
    const lines: string[] = [];
    const ok = await verify(values, (line: string) => lines.push(String(line)));
    // Strip the ANSI colours so assertions read the words, not the escapes.
    return { ok, out: lines.join("\n").replace(/\[\d+m/g, "") };
  };

  it("passes on good values and reports what it found", async () => {
    const { ok, out } = await run({
      PAPERBOY_API_URL: api,
      PAPERBOY_PUBLIC_KEY: "pk_live_good",
      PAPERBOY_PREVIEW_KEY: "prv_good",
      PREVIEW_SECRET: "shared",
    });
    expect(ok).toBe(true);
    expect(out).toContain("public key  OK");
    expect(out).toContain("2 published pages");
    expect(out).toContain("preview key OK");
    expect(out).toContain('start page  OK — "Home" (StartPage)');
  });

  it("fails, and names the key, when a key is rejected", async () => {
    const { ok, out } = await run({
      PAPERBOY_API_URL: api,
      PAPERBOY_PUBLIC_KEY: "pk_live_wrong",
      PAPERBOY_PREVIEW_KEY: "prv_good",
      PREVIEW_SECRET: "shared",
    });
    expect(ok).toBe(false);
    expect(out).toContain("public key  FAILED");
    expect(out).toContain("401");
    expect(out).toContain("preview key OK"); // the good one still passes
  });

  it("checks the PREVIEW key too, not just the public one", async () => {
    // A broken preview key otherwise shows up much later as "preview does
    // nothing", inside the CMS, where it is far harder to diagnose.
    const { ok, out } = await run({
      PAPERBOY_API_URL: api,
      PAPERBOY_PUBLIC_KEY: "pk_live_good",
      PAPERBOY_PREVIEW_KEY: "prv_wrong",
      PREVIEW_SECRET: "shared",
    });
    expect(ok).toBe(false);
    expect(out).toContain("preview key FAILED");
  });

  it("fails when PREVIEW_SECRET is missing, and says it cannot be checked remotely", async () => {
    const { ok, out } = await run({
      PAPERBOY_API_URL: api,
      PAPERBOY_PUBLIC_KEY: "pk_live_good",
      PAPERBOY_PREVIEW_KEY: "prv_good",
    });
    expect(ok).toBe(false);
    expect(out).toContain("PREVIEW_SECRET missing");
  });

  it("explains an unreachable API instead of throwing", async () => {
    const { ok, out } = await run({
      PAPERBOY_API_URL: "http://127.0.0.1:1",
      PAPERBOY_PUBLIC_KEY: "pk_live_good",
      PAPERBOY_PREVIEW_KEY: "prv_good",
      PREVIEW_SECRET: "shared",
    });
    expect(ok).toBe(false);
    expect(out).toContain("cannot reach it");
  });

  it("refuses to check nothing", async () => {
    const { ok, out } = await run({ PAPERBOY_PUBLIC_KEY: "pk_live_good" });
    expect(ok).toBe(false);
    expect(out).toContain("No PAPERBOY_API_URL");
  });
});
