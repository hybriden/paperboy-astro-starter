#!/usr/bin/env node
/**
 * Fill a fresh Paperboy with a demo SITE, so `docker compose -f
 * docker-compose.demo.yml up` gives you something real to click through instead
 * of an empty CMS.
 *
 * What it builds: a small fictional studio site — start page composed of blocks,
 * three service pages, a journal with six articles and working pagination, an
 * FAQ, a profile, a contact page with a real form, and a menu tying it together.
 *
 * Why a fictional company rather than pages about Paperboy: a demo whose every
 * page explains the demo shows nothing about handling real content, and you
 * cannot show it to a stakeholder. The explanation of how it was built lives on
 * /about, where someone can go looking for it.
 *
 * It talks to the Management API exactly as a person would — log in, instantiate
 * the built-in type templates, create pages, publish them — so it doubles as a
 * worked example of automating Paperboy. Zero dependencies; plain node.
 *
 * IDEMPOTENT: if the demo is already here it changes nothing, so restarting the
 * stack never overwrites your edits.
 *
 * Env: PAPERBOY_API_URL, PAPERBOY_ADMIN_EMAIL, PAPERBOY_ADMIN_PASSWORD,
 *      PAPERBOY_SITE_URL (for canonical URLs; default http://localhost:4321).
 */

const API = (process.env.PAPERBOY_API_URL ?? "http://localhost:8091").replace(/\/+$/, "");
const SITE_URL = (process.env.PAPERBOY_SITE_URL ?? "http://localhost:4321").replace(/\/+$/, "");
const EMAIL = process.env.PAPERBOY_ADMIN_EMAIL ?? "admin@paperboy.test";
const PASSWORD = process.env.PAPERBOY_ADMIN_PASSWORD ?? "Admin!Passw0rd";
const LOCALE = process.env.PAPERBOY_LOCALE || "en";

const log = (...args) => console.log("[demo-content]", ...args);

/** The API needs a moment after the container reports healthy on a cold start. */
async function waitForApi(attempts = 60) {
  for (let i = 0; i < attempts; i++) {
    try {
      if ((await fetch(`${API}/health/ready`)).ok) return true;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

let cookie = "";
let csrf = "";

async function login() {
  const res = await fetch(`${API}/api/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: API },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (!res.ok) throw new Error(`login failed (${res.status}): ${await res.text()}`);
  csrf = (await res.json()).csrfToken;
  cookie = (res.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
}

async function call(method, path, body) {
  // Only declare a JSON content-type when there IS a body: Fastify rejects
  // "content-type: application/json" with an empty body, which made every
  // DELETE fail with a confusing 400.
  const headers = { origin: API, cookie, "x-csrf-token": csrf };
  if (body !== undefined) headers["content-type"] = "application/json";
  const res = await fetch(`${API}/api/v1${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* empty or non-JSON body */
  }
  return { ok: res.ok, status: res.status, json, text };
}

// ------------------------------------------------------------------ helpers ---

const rt = (...paragraphs) => ({
  type: "doc",
  content: paragraphs.map((text) => ({ type: "paragraph", content: [{ type: "text", text }] })),
});

let blockKey = 0;
/** An INLINE block instance. `key` is required — it is how the editor tracks a row. */
const b = (blockType, data) => ({ key: `k${++blockKey}`, blockType, display: "automatic", inline: data, ref: null });
/** A content-area entry REFERENCING a document: a shared block, or a page teaser. */
const ref = (blockType, documentId) => ({ key: `k${++blockKey}`, blockType, display: "automatic", inline: null, ref: documentId });
/** A link to a PAGE by documentId, so it follows renames and moves. */
const pageLink = (documentId, text) => ({ href: "", documentId, text });

/**
 * The built-in templates this demo uses, and the fields it writes into each.
 *
 * The field list is not documentation — it is the check. A CMS may ALREADY have a
 * type with one of these names and a different shape (the stock seed ships its
 * own HeroBlock, for instance), and instantiate refuses to overwrite implicitly.
 * Writing demo data into that type then fails with "Unrecognized keys", which is
 * the API being right. So: if a same-named type is missing a field this demo
 * writes, the built-in definition is applied deliberately — and only then.
 */
const TYPES = {
  StartPage: ["heading", "mainArea"],
  SectionPage: ["heading", "intro", "body", "mainArea", "teaserTitle", "teaserText"],
  ArticlePage: ["heading", "intro", "author", "publishDate", "body", "teaserTitle", "teaserText"],
  ArticleListPage: ["heading", "intro", "listedType", "pageSize"],
  FaqPage: ["heading", "intro", "topics"],
  PersonPage: ["firstName", "lastName", "workTitle", "department", "email", "phone", "bio"],
  HeaderSettings: ["menuLinks"],
  FooterSettings: ["links", "footerText"],
  HeroBlock: ["heading", "subtitle", "primaryLink", "secondaryLink"],
  TeaserListBlock: ["heading", "intro", "teasers", "moreLink"],
  AccordionBlock: ["heading", "items"],
  AccordionItemBlock: ["heading", "body"],
  TextBlock: ["body"],
  ImageBlock: ["image", "caption"],
  QuoteBlock: ["quote", "source"],
  BannerBlock: ["heading", "text", "link"],
  PersonBlock: ["firstName", "lastName", "workTitle", "email"],
  LinkListBlock: ["heading", "links"],
  LinkItemBlock: ["link"],
  FaqTopicBlock: ["topic", "questions"],
  QuestionBlock: ["question", "answer"],
  // A form IS content: the Form block holds settings and a content area with one
  // block per question. Submissions stay in this instance's own database.
  Form: ["title", "intro", "fields", "submitLabel"],
  FormTextField: ["name", "label", "required", "placeholder", "errorMessage"],
  FormEmailField: ["name", "label", "required", "placeholder"],
  FormTextareaField: ["name", "label", "required", "rows", "minLength", "errorMessage"],
  FormConsentField: ["name", "label", "errorMessage"],
};

async function ensureType(name, needs) {
  const created = await call("POST", `/manage/type-templates/${encodeURIComponent(name)}/instantiate`, { withBlocks: true });
  if (created.ok) return "created";
  if (created.status !== 409) {
    log(`type ${name}: ${created.status} ${created.text.slice(0, 140)}`);
    return "failed";
  }

  const existing = await call("GET", `/manage/content-types/${encodeURIComponent(name)}`);
  const have = new Set((existing.json?.fields ?? []).map((f) => f.name));
  const missing = needs.filter((f) => !have.has(f));
  if (missing.length === 0) return "reused";

  log(`type ${name} exists with a different shape (no ${missing.join(", ")}) — applying the built-in definition`);
  const updated = await call("POST", `/manage/type-templates/${encodeURIComponent(name)}/instantiate`, {
    withBlocks: true,
    updateExisting: true,
  });
  if (!updated.ok) log(`type ${name}: ${updated.status} ${updated.text.slice(0, 140)}`);
  return updated.ok ? "updated" : "failed";
}

async function ensureTypes() {
  const tally = {};
  for (const [name, needs] of Object.entries(TYPES)) {
    const outcome = await ensureType(name, needs);
    tally[outcome] = (tally[outcome] ?? 0) + 1;
  }
  log(`content types: ${Object.entries(tally).map(([k, v]) => `${v} ${k}`).join(", ")}`);
}

/** create -> set data -> publish. Returns the documentId. */
async function page(type, name, data, parentId = null) {
  const created = await call("POST", "/manage/content", { type, parentId, locale: LOCALE, name });
  if (!created.ok) throw new Error(`create ${type} "${name}" failed (${created.status}): ${created.text.slice(0, 300)}`);
  const id = created.json.documentId;
  await setData(id, type, name, data);
  return id;
}

/** Set a document's fields and publish it. */
async function setData(id, type, name, data) {
  const updated = await call("PUT", `/manage/content/${id}?locale=${LOCALE}`, { data });
  if (!updated.ok) throw new Error(`update ${type} "${name}" failed (${updated.status}): ${updated.text.slice(0, 400)}`);
  const published = await call("POST", `/manage/content/${id}/publish`, { locale: LOCALE });
  if (!published.ok) log(`publish "${name}": ${published.status} ${published.text.slice(0, 200)}`);
}

/**
 * The stock seed's own demo pages, which the CMS creates before this script runs.
 *
 * They have to go: left in place, the site serves TWO parallel structures — the
 * seed's /home, /blog and RBAC fixtures alongside this one, none of them in the
 * menu, and an admin tree where you cannot tell which site is "the demo".
 *
 * Matched by NAME, deliberately, rather than "anything this script did not
 * create": that way pointing this at an instance that has real content in it
 * cannot quietly delete it.
 */
// The NAMES, taken from packages/db/src/seed.ts — not from what the seed PRINTS.
// Two of these were the console labels ("Secret draft", "Shared card") rather
// than the content names, so they never matched: the admin tree opened with a
// draft called "Unpublished — should never appear publicly" sitting above
// Services, and Shared Blocks still listed a stray CardBlock.
const STOCK_SEED_ROOTS = ["Home", "Blog", "Author Zone", "Top Secret (draft)", "Hjem"];
const STOCK_SEED_BLOCKS = ["Featured Card"];

async function removeStockSeedPages() {
  const tree = await call("GET", "/manage/content/tree");
  if (!tree.ok || !Array.isArray(tree.json)) return;

  let trashed = 0;
  for (const node of tree.json) {
    if (!STOCK_SEED_ROOTS.includes(node?.name ?? "")) continue;
    const res = await call("DELETE", `/manage/content/${node.documentId}`);
    if (res.ok) trashed += res.json?.trashed ?? 1;
    else log(`could not trash "${node.name}": ${res.status} ${res.text.slice(0, 120)}`);
  }
  // Shared blocks are not in the page tree; they have their own list.
  const blocks = await call("GET", "/manage/blocks");
  if (blocks.ok && Array.isArray(blocks.json)) {
    for (const block of blocks.json) {
      if (!STOCK_SEED_BLOCKS.includes(block?.name ?? "")) continue;
      const res = await call("DELETE", `/manage/content/${block.documentId}`);
      if (res.ok) trashed += res.json?.trashed ?? 1;
      else log(`could not trash block "${block.name}": ${res.status} ${res.text.slice(0, 120)}`);
    }
  }

  if (trashed) log(`trashed ${trashed} stock-seed item(s) — one site here, not two`);
}

/**
 * The site NAME, which delivery puts in og:site_name and this frontend shows as
 * the wordmark in the header.
 *
 * It lives in a SiteSettings global that the stock seed already created and
 * called "Paperboy" — so without this, every page of a fictional studio's site
 * is branded with the name of the CMS. Globals are one-per-type, so the existing
 * document is updated rather than duplicated, and any duplicate is cleaned up.
 */
async function setSiteName(siteName) {
  const found = await call("GET", "/manage/content/search?q=Site&limit=50");
  const globals = (Array.isArray(found.json) ? found.json : []).filter((i) => i.type === "SiteSettings");

  if (globals.length === 0) {
    await page("SiteSettings", "Site settings", { siteName });
    log(`site name set to "${siteName}" (new SiteSettings global)`);
    return;
  }

  const [keep, ...duplicates] = globals;
  await setData(keep.documentId, "SiteSettings", keep.name, { siteName });
  for (const dupe of duplicates) await call("DELETE", `/manage/content/${dupe.documentId}`);
  log(`site name set to "${siteName}"${duplicates.length ? ` (${duplicates.length} duplicate global trashed)` : ""}`);
}

/** Has this run already? Then leave everything alone. */
async function alreadySeeded() {
  const tree = await call("GET", "/manage/content/tree");
  if (!tree.ok || !Array.isArray(tree.json)) return false;
  return JSON.stringify(tree.json).includes("Nordlys Studio");
}

/* ------------------------------- photographs ------------------------------- */

/**
 * Stock photographs, fetched from Unsplash at seed time and uploaded into the
 * CMS as real assets — because an `image` field holds an asset documentId, not a
 * URL, and a demo that links to someone else's CDN would not be exercising the
 * media pipeline at all.
 *
 * Fetched rather than committed: these are not ours to redistribute in a git
 * repository, and this way each instance pulls its own copy. Unsplash's licence
 * allows free use without permission; attribution is appreciated rather than
 * required, and the photo ids below are the record of what was used.
 *
 * Every one has real alt text, written from looking at the picture. A demo that
 * ships `alt=""` on twelve photographs teaches the wrong lesson twice: it fails
 * the visitor who cannot see them, and it models the habit for whoever copies
 * this file.
 *
 * If the network is unavailable the upload is skipped and the demo is built
 * without pictures — every template already handles a missing image, which is
 * worth seeing anyway.
 */
const PHOTOS = {
  hero: {
    id: "1552664730-d307ca884978",
    crop: "w=1600&h=1200",
    alt: "A woman adding sticky notes to a whiteboard while five colleagues work at a meeting table",
  },
  officeEmpty: {
    id: "1497366754035-f200968a6e72",
    crop: "w=1600&h=900",
    alt: "An empty open-plan office with glass partitions and a long shared desk",
  },
  // /about. Replaces a corporate high-five, which is the most parodied genre in
  // stock photography and sat directly under copy about not overselling.
  studioDesk: {
    id: "1497215728101-856f4ea42174",
    crop: "w=1600&h=900",
    alt: "A long desk beside a window wall with plants and a single laptop",
  },

  // One per service, each showing that service rather than "people at laptops".
  wireframe: {
    id: "1581291518857-4e27b48ff24e",
    crop: "w=1200&h=750",
    alt: "A hand drawing a page wireframe on paper with a black pen",
  },
  deviceCheck: {
    id: "1551650975-87deedd944c3",
    crop: "w=1200&h=750",
    alt: "A hand holding a phone showing a dashboard, with the same design open on a desktop behind it",
  },
  newspapers: {
    id: "1478940020726-e9e191651f1a",
    crop: "w=1200&h=750",
    alt: "A stack of folded newspapers",
  },

  // A second, different photograph for each service page, so clicking a card
  // does not show you the same picture again.
  sketching: {
    id: "1454165804606-c3d57bc86b40",
    crop: "w=1200&h=675",
    alt: "Hands sketching a diagram in a notebook beside two open laptops",
  },
  pairing: {
    id: "1527689368864-3a821dbccc34",
    crop: "w=1200&h=675",
    alt: "Two people sharing one laptop at a table by a window, seen from behind",
  },
  workshop: {
    id: "1573167507387-6b4b98cb7c13",
    crop: "w=1200&h=675",
    alt: "A dozen people at a long meeting table, one of them presenting at the far end",
  },

  // Article leads, at 16:9 like every other figure. And all of DIFFERENT things:
  // one review counted ten of thirteen photographs containing a laptop, and the
  // round that fixed THAT left five photographs of a hand holding a pen. Check
  // the set, not the picture.
  scaffold: {
    id: "1636362556682-11231883c01c",
    crop: "w=1200&h=675",
    alt: "Scaffolding covering the front of a building against a blue sky",
  },
  deskOverhead: {
    id: "1519389950473-47ba0277781c",
    crop: "w=1200&h=675",
    alt: "A shared desk photographed from above, covered with laptops, notebooks and coffee cups",
  },
  whiteboard: {
    id: "1607703703674-df96af81dffa",
    crop: "w=1200&h=675",
    alt: "A hand writing the word AUDIENCE on a whiteboard",
  },
  archive: {
    id: "1762627105132-f6ed848a23bf",
    crop: "w=1200&h=675",
    alt: "Rows of white archive boxes on shelves either side of a wooden door",
  },

  // Both portraits in the same register: plain backdrop, direct gaze. Two staff
  // photographs from different worlds read as two different companies.
  ingrid: {
    id: "1580489944761-15a19d654956",
    crop: "w=800&h=1000",
    alt: "Ingrid Solberg",
  },
  jonas: {
    id: "1472099645785-5658abf4ff4e",
    crop: "w=800&h=1000",
    alt: "Jonas Berg",
  },
};

/**
 * Upload one photograph and return its asset documentId.
 *
 * Two calls, because the API separates them: the multipart POST stores the file
 * (server-generated name, sniffed type, 5MB cap) and the PUT sets the alt text.
 */
async function uploadPhoto(key, photo) {
  // crop=faces,edges, because the DEFAULT is a centred crop and a centred crop is
  // how a photograph of people loses their heads: it takes the middle of the
  // frame regardless of what is in it. This anchors on faces, falling back to
  // edge detection when there are none — it fixed a decapitated card, a lead
  // image that was 45% ceiling, and a portrait cropped to a forehead, all at
  // once and without changing a single photograph.
  const url = `https://images.unsplash.com/photo-${photo.id}?${photo.crop}&fit=crop&crop=faces,edges&q=75&fm=jpg`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${key}: ${res.status}`);
  const bytes = new Uint8Array(await res.arrayBuffer());

  const body = new FormData();
  body.append("file", new Blob([bytes], { type: "image/jpeg" }), `${key}.jpg`);

  // No content-type header here on purpose: FormData sets it with the boundary,
  // and overriding it makes the multipart body unparseable.
  const upload = await fetch(`${API}/api/v1/manage/assets`, {
    method: "POST",
    headers: { origin: API, cookie, "x-csrf-token": csrf },
    body,
  });
  if (!upload.ok) throw new Error(`upload ${key}: ${upload.status} ${(await upload.text()).slice(0, 120)}`);
  const asset = await upload.json();

  const alt = await call("PUT", `/manage/assets/${asset.documentId}`, { alt: photo.alt });
  if (!alt.ok) log(`alt text for ${key}: ${alt.status}`);
  return asset.documentId;
}

/** key -> asset documentId, or {} when the photographs could not be fetched. */
async function uploadPhotos() {
  const ids = {};
  for (const [key, photo] of Object.entries(PHOTOS)) {
    try {
      ids[key] = await uploadPhoto(key, photo);
    } catch (error) {
      log(`no photograph for "${key}" (${error?.message ?? error})`);
    }
  }
  const count = Object.keys(ids).length;
  log(count ? `${count} photographs uploaded` : "no photographs — building the demo without pictures");
  return ids;
}

// ------------------------------------------------------------------ content ---

const SERVICES = [
  {
    name: "Design systems",
    photo: "wireframe",
    figure: "sketching",
    caption: "Component naming, worked out on paper with the build open beside it.",
    teaser: "One set of components, documented, that survives the next redesign.",
    intro: "We build the component library, write down the rules, and leave your team able to extend it.",
    body: [
      "Most design systems fail quietly: the library exists, but nobody can find the right component, so people paste a div and move on. We treat documentation and naming as part of the deliverable rather than an afterthought.",
      "You get tokens, components, usage notes and a review checklist — in your repository, not ours.",
    ],
    quote: "The component list stopped growing once people could find what already existed.",
    quoteSource: "Design lead, retail client",
    extra:
      "Typical engagement: six to ten weeks, ending with two of your developers shipping new components without us in the room.",
  },
  {
    name: "Web development",
    photo: "deviceCheck",
    figure: "pairing",
    caption: "Two people, one screen. Most of our front-end work looks like this.",
    teaser: "Fast sites that editors can change without opening a ticket.",
    intro: "Front ends that load quickly, meet WCAG, and hand real control to the people who write the words.",
    body: [
      "We build with whatever framework your team already knows, against a headless CMS, so content and code can move at different speeds.",
      "Performance and accessibility are checked in CI, because anything checked by hand eventually is not.",
    ],
    quote: "The site got faster after launch, which in our experience never happens.",
    quoteSource: "CTO, membership organisation",
    extra:
      "We work to a performance budget agreed up front, and the build fails when a page exceeds it. Arguments about speed then happen before merge instead of after launch.",
  },
  {
    name: "Content operations",
    photo: "newspapers",
    figure: "workshop",
    caption: "A modelling workshop with the people who publish every day.",
    teaser: "Getting an editorial team from three-week deploys to publishing themselves.",
    intro: "Modelling, migration, and the training that makes both stick.",
    body: [
      "A content model is a product decision: the wrong shape shows up two years later as fifteen near-identical page types nobody dares delete.",
      "We model with your editors in the room, migrate the archive, and stay until they are publishing without us.",
    ],
  },
];

const ARTICLES = [
  {
    name: "Your content model outlives your framework",
    intro: "Frameworks get replaced every few years. The shape of your content does not.",
    author: "Ingrid Solberg",
    date: "2026-01-15T09:00:00.000Z",
    photo: "scaffold",
    body: [
      "Every rebuild starts with an argument about frameworks and ends with the same realisation: the hard part was never the rendering. It was that nobody could say what a page actually is.",
      "Model the things your organisation genuinely talks about — a course, a product, a person — and give each the fields it really has. Resist the page type that exists because one campaign needed a third column.",
    ],
  },
  {
    name: "Why we stopped building bespoke admin screens",
    intro: "Every custom editing interface is a product you then have to maintain.",
    author: "Ingrid Solberg",
    date: "2026-02-03T09:00:00.000Z",
    photo: "deskOverhead",
    body: [
      "We used to build editing interfaces for clients. They were lovely for a year and then became the thing nobody wanted to touch, because whoever wrote them had moved on.",
      "A CMS that lets editors compose pages from blocks removes most of the reason to build one at all.",
    ],
  },
  {
    name: "Accessibility is a content problem too",
    intro: "You can ship a perfect component library and still fail an audit on link text.",
    // The pull-quote below used to repeat this paragraph's own statistic, three
    // inches apart and in two voices.
    author: "Jonas Berg",
    date: "2026-03-11T09:00:00.000Z",
    photo: "whiteboard",
    body: [
      "Most accessibility findings we see on editorial sites are not code. They are twelve links that all say read more, headings chosen for their size, and images with a filename as the alt text.",
      "The fix is partly training and partly making the right thing the easy thing: a link field that asks for its text, an image field that will not save without a description.",
    ],
  },
  {
    name: "Migrating four thousand pages without a weekend",
    intro: "What we learned moving a twenty-year archive one content type at a time.",
    author: "Jonas Berg",
    date: "2026-04-22T09:00:00.000Z",
    photo: "archive",
    body: [
      "The instinct is a big-bang migration over a weekend. The alternative is duller and much safer: migrate one type at a time, run both systems behind the same URLs, and move traffic as each type finishes.",
      "It took eleven weeks instead of one weekend, and nothing was ever down.",
    ],
  },
  {
    name: "Editors do not want a page builder",
    intro: "They want to fix the sentence that is wrong, quickly, without breaking the layout.",
    author: "Ingrid Solberg",
    date: "2026-05-30T09:00:00.000Z",
    body: [
      "Ask an editor what they want and they will ask for more control. Watch one work and you see something else: they want to correct the hero and get on with their day.",
      "Blocks with sensible constraints beat a blank canvas. The canvas is only better for the two people in the organisation who enjoy it.",
    ],
  },
  {
    name: "Measuring a redesign honestly",
    intro: "Pick the numbers before you start, or you will find flattering ones afterwards.",
    author: "Jonas Berg",
    date: "2026-06-18T09:00:00.000Z",
    body: [
      "Agree three numbers before the work starts, and write down what a bad result would look like. It is the only way to have a useful conversation in month four.",
      "For editorial sites ours are usually: how long a correction takes to publish, the share of pages editors can change unaided, and how slowly the heaviest template loads on a mid-range phone.",
    ],
  },
];

async function main() {
  if (!(await waitForApi())) throw new Error(`API never became ready at ${API}`);
  await login();

  if (await alreadySeeded()) {
    log("demo content is already here — leaving it alone");
    return;
  }

  await ensureTypes();
  await removeStockSeedPages();
  await setSiteName("Nordlys Studio");
  const photo = await uploadPhotos();

  // The start page is CREATED first and filled in at the end. Children append at
  // the bottom of a manually-sorted tree, so building it last — which is what it
  // needs, since its hero links to pages that do not exist yet — left the admin
  // tree opening with the home page underneath everything else.
  const home = await page("StartPage", "Nordlys Studio", { heading: "Nordlys Studio" });

  // --- a SHARED block, referenced by several pages --------------------------
  // One document, placed in three content areas: edit it once and every page
  // carrying it changes. This is what a shared block is FOR, and it is invisible
  // unless a demo actually reuses one.
  const cta = await page("BannerBlock", "Shared CTA banner", {
    heading: "Thinking about a rebuild?",
    text: "We run a paid discovery week: you get a content model, a plan and an estimate you can take anywhere.",
    link: { href: "/contact", text: "Book a discovery week" },
    // With a background image the panel goes dark and gains a scrim, so the
    // text keeps its contrast whatever the photograph looks like.
    backgroundImage: photo.officeEmpty,
  });

  // --- services: a parent page with three children --------------------------
  const services = await page("SectionPage", "Services", {
    heading: "What we do",
    intro: "What we actually do, and the part of each that clients usually need first.",
    teaserTitle: "Services",
    teaserText: "Design systems, front-end development, and getting editorial teams self-sufficient.",
  });

  const serviceIds = [];
  for (const [i, s] of SERVICES.entries()) {
    serviceIds.push(
      await page(
        "SectionPage",
        s.name,
        {
          heading: s.name,
          intro: s.intro,
          body: rt(...s.body),
          teaserTitle: s.name,
          teaserText: s.teaser,
          teaserImage: photo[s.photo],
          // Every service page carries blocks — an article or service page with
          // an empty content area reads as a plain document, which is the
          // impression a demo exists to dispel. The last one also carries the
          // SHARED banner, so one document appears on three pages.
          // The same photograph the teaser card uses, reused as a figure on the
          // page itself — one asset, two placements, which is how a media
          // library is actually used.
          mainArea: [
            b("ImageBlock", { image: photo[s.figure], caption: s.caption }),
            ...(i === SERVICES.length - 1
              ? [ref("BannerBlock", cta)]
              : [b("QuoteBlock", { quote: s.quote, source: s.quoteSource }), b("TextBlock", { body: rt(s.extra) })]),
          ],
        },
        services,
      ),
    );
  }

  // The parent page has to lead somewhere: "Services" is a top-level menu item,
  // and without this it was a heading, one sentence and no way down to the three
  // pages it exists to introduce.
  await setData(services, "SectionPage", "Services", {
    heading: "What we do",
    intro: "Three things, and the part of each that clients usually need first.",
    teaserTitle: "Services",
    teaserText: "Design systems, front-end development, and getting editorial teams self-sufficient.",
    mainArea: [
      b("TeaserListBlock", {
        heading: "Three ways we usually help",
        intro: "Most projects start with one of these and grow into another.",
        teasers: serviceIds.map((id) => ref("SectionPage", id)),
        moreLink: { href: "/contact", text: "Talk to us about a project" },
      }),
    ],
  });

  // --- the journal ----------------------------------------------------------
  const journal = await page("ArticleListPage", "Journal", {
    heading: "Journal",
    intro: "Notes on content modelling, front-end work, and the parts of this job nobody writes down.",
    listedType: "ArticlePage",
    // Three per page against six articles, so pagination is something you can
    // see and click — not a feature the copy claims and the page never shows.
    pageSize: 3,
    teaserTitle: "Journal",
    teaserText: "Six pieces on modelling, migration and editorial work.",
  });

  const articleIds = [];
  for (const a of ARTICLES) {
    articleIds.push(
      await page(
        "ArticlePage",
        a.name,
        {
          heading: a.name,
          intro: a.intro,
          author: a.author,
          publishDate: a.date,
          body: rt(...a.body),
          teaserTitle: a.name,
          teaserText: a.intro,
          // The last two articles have no photograph on purpose: the template
          // has to look right without one, and not every post has a picture.
          mainImage: a.photo ? photo[a.photo] : undefined,
          teaserImage: a.photo ? photo[a.photo] : undefined,
        },
        journal,
      ),
    );
  }
  log(`${ARTICLES.length} articles under the journal`);

  // --- a person -------------------------------------------------------------
  const person = await page("PersonPage", "Ingrid Solberg", {
    image: photo.ingrid,
    firstName: "Ingrid",
    lastName: "Solberg",
    workTitle: "Principal consultant",
    department: "Content strategy",
    email: "ingrid@nordlys.example",
    phone: "+47 900 00 000",
    bio: rt(
      "Ingrid works on content models and the awkward conversations that come with them: which page types to delete, who owns a field, and what happens to the archive.",
      "Before Nordlys she ran editorial operations for a national broadcaster.",
    ),
  });

  // The journal bylines two people, so both need a page — otherwise the second
  // name reads as a missing feature rather than a text field.
  const person2 = await page("PersonPage", "Jonas Berg", {
    image: photo.jonas,
    firstName: "Jonas",
    lastName: "Berg",
    workTitle: "Lead developer",
    department: "Engineering",
    email: "jonas@nordlys.example",
    phone: "+47 900 00 001",
    bio: rt(
      "Jonas builds the front ends and the pipelines that keep them honest: performance budgets that fail the build, and accessibility checks that run on every pull request.",
      "He has migrated more legacy archives than he would like to talk about.",
    ),
  });

  // Two articles carry blocks, so the journal is not six plain documents: one
  // ends on the shared call to action, one on a pull quote.
  if (articleIds[0]) {
    await setData(articleIds[0], "ArticlePage", ARTICLES[0].name, {
      heading: ARTICLES[0].name,
      intro: ARTICLES[0].intro,
      author: ARTICLES[0].author,
      publishDate: ARTICLES[0].date,
      body: rt(...ARTICLES[0].body),
      teaserTitle: ARTICLES[0].name,
      teaserText: ARTICLES[0].intro,
      mainImage: photo[ARTICLES[0].photo],
      teaserImage: photo[ARTICLES[0].photo],
      mainArea: [ref("BannerBlock", cta)],
    });
  }
  if (articleIds[2]) {
    await setData(articleIds[2], "ArticlePage", ARTICLES[2].name, {
      heading: ARTICLES[2].name,
      intro: ARTICLES[2].intro,
      author: ARTICLES[2].author,
      publishDate: ARTICLES[2].date,
      body: rt(...ARTICLES[2].body),
      teaserTitle: ARTICLES[2].name,
      teaserText: ARTICLES[2].intro,
      mainImage: photo[ARTICLES[2].photo],
      teaserImage: photo[ARTICLES[2].photo],
      mainArea: [
        b("QuoteBlock", {
          quote: "The audit did not fail on our code. It failed on words we had approved ourselves.",
          source: "An audit we would rather not repeat",
        }),
      ],
    });
  }

  // --- FAQ, contact, about --------------------------------------------------
  const faqTopics = [
    b("FaqTopicBlock", {
      topic: "Working together",
      questions: [
        b("QuestionBlock", {
          question: "How do projects usually start?",
          answer: rt("With a discovery week. We interview the people who publish, model the content, and hand over a plan and an estimate. If you take it elsewhere, that is fine — you own it."),
        }),
        b("QuestionBlock", {
          question: "Can you work with our existing team?",
          answer: rt("That is most of what we do. We pair with in-house developers rather than delivering over a wall, because the handover is the part that usually fails."),
        }),
        b("QuestionBlock", {
          question: "What does an engagement cost?",
          answer: rt("The discovery week is fixed price. After that we work in monthly blocks, and you can stop at the end of any block."),
        }),
      ],
    }),
    b("FaqTopicBlock", {
      topic: "After launch",
      questions: [
        b("QuestionBlock", {
          question: "Who owns the code?",
          answer: rt("You do, in your repository, from the first commit. We keep nothing you cannot run without us."),
        }),
        b("QuestionBlock", {
          question: "Do you offer support afterwards?",
          answer: rt("A retainer if you want one, but the goal is that you do not need it. We would rather be hired again for something new."),
        }),
      ],
    }),
  ];

  const faq = await page("FaqPage", "FAQ", {
    heading: "Frequently asked questions",
    intro: "What clients ask before signing anything.",
    teaserTitle: "Questions and answers",
    teaserText: "Rates, timelines, and what happens to the work when we leave.",
    topics: faqTopics,
  });

  const contact = await page("SectionPage", "Contact", {
    heading: "Get in touch",
    intro: "Tell us roughly what you are trying to do, or write to hei@nordlys.example. We reply within two working days.",
    teaserTitle: "Contact",
    teaserText: "A form, an email address, and a human at the other end.",
  });

  const about = await page("SectionPage", "About", {
    heading: "About Nordlys Studio",
    intro: "Two people in Oslo who build content-led sites and then teach the team to run them.",
    body: rt(
      "We started in 2019, after too many projects where the site launched beautifully and then froze, because changing a sentence needed a developer.",
      "An honest note: Nordlys Studio does not exist. Every page on this site is demo content for the Paperboy CMS, created through its Management API by scripts/demo-content.mjs when this stack first started — which makes that script a decent worked example if you want to automate the CMS yourself.",
    ),
    teaserTitle: "About us",
    teaserText: "Who we are, and an honest note about what this site actually is.",
    mainArea: [
      b("PersonBlock", {
        image: photo.ingrid,
        firstName: "Ingrid",
        lastName: "Solberg",
        workTitle: "Principal consultant",
        email: "ingrid@nordlys.example",
      }),
      // Both of them. One card under "two people in Oslo" left the other half of
      // the sentence unaccounted for.
      b("PersonBlock", {
        image: photo.jonas,
        firstName: "Jonas",
        lastName: "Berg",
        workTitle: "Lead developer",
        email: "jonas@nordlys.example",
      }),
      b("ImageBlock", {
        image: photo.studioDesk,
        caption: "The Oslo office, on one of the quiet afternoons.",
      }),
      b("LinkListBlock", {
        heading: "Elsewhere on this site",
        links: [
          b("LinkItemBlock", { link: pageLink(journal, "The journal") }),
          b("LinkItemBlock", { link: pageLink(person, "Ingrid Solberg") }),
          b("LinkItemBlock", { link: pageLink(person2, "Jonas Berg") }),
          b("LinkItemBlock", { link: pageLink(faq, "Frequently asked questions") }),
        ],
      }),
      ref("BannerBlock", cta),
    ],
  });

  // --- a real form, stored as content ---------------------------------------
  const form = await page("Form", "Contact form", {
    title: "Tell us about the project",
    intro: rt("A few questions. Nothing here goes on a mailing list."),
    submitLabel: "Send enquiry",
    fields: [
      // errorMessage is the EDITOR's wording, returned per field and rendered
      // beside the input (WCAG 3.3.1). Without it a visitor gets the validator's
      // own words, which are accurate and unhelpful.
      b("FormTextField", {
        name: "name",
        label: "Your name",
        required: true,
        placeholder: "Kari Nordmann",
        errorMessage: "We would like to know who we are replying to.",
      }),
      b("FormEmailField", { name: "email", label: "Email", required: true, placeholder: "you@company.no" }),
      b("FormTextareaField", {
        name: "message",
        label: "What are you trying to do?",
        required: true,
        rows: 5,
        // A minimum the BROWSER cannot enforce on its own here, so a newcomer
        // actually sees CMS-declared validation happen in the editor's words
        // rather than a native bubble.
        minLength: 20,
        errorMessage: "A sentence or two is plenty — a couple of words is not.",
      }),
      b("FormConsentField", {
        name: "consent",
        label: "I agree to be contacted about this enquiry.",
        errorMessage: "We need your agreement before we can reply.",
      }),
    ],
  });

  // A Form must be placed as a SHARED block: submissions are posted against its
  // documentId, which an inline copy would not have.
  await setData(contact, "SectionPage", "Contact", {
    heading: "Get in touch",
    intro: "Tell us roughly what you are trying to do, or write to hei@nordlys.example. We reply within two working days.",
    teaserTitle: "Contact",
    teaserText: "A form, an email address, and a human at the other end.",
    mainArea: [ref("Form", form)],
  });

  // --- the start page, filled in now that everything it links to exists ------
  await setData(home, "StartPage", "Nordlys Studio", {
    heading: "Nordlys Studio",
    mainArea: [
      b("HeroBlock", {
        heading: "Sites your editors can actually run",
        subtitle:
          "We build content-led websites for teams who want to publish without booking a developer. Design systems, front-end work, and the training that makes it stick.",
        image: photo.hero,
        primaryLink: pageLink(contact, "Book a discovery week"),
        secondaryLink: pageLink(services, "See what we do"),
      }),
      b("TeaserListBlock", {
        heading: "Where projects start",
        intro: "Three services. Most people arrive needing one of them.",
        teasers: serviceIds.map((id) => ref("SectionPage", id)),
        moreLink: pageLink(services, "All services"),
      }),
      b("AccordionBlock", {
        heading: "How we work",
        items: [
          b("AccordionItemBlock", {
            heading: "Discovery week",
            body: rt("Interviews with the people who publish, a content model on paper, and an estimate. Fixed price, and yours to take elsewhere."),
            expanded: true,
          }),
          b("AccordionItemBlock", {
            heading: "Build in the open",
            body: rt("Monthly blocks, your repository, your CI. You can see what we are doing every day, and stop at the end of any block."),
          }),
          b("AccordionItemBlock", {
            heading: "Handover, properly",
            body: rt("We pair with your developers throughout, write down the parts that are hard to guess, and leave when your team is publishing unaided."),
          }),
        ],
      }),
      b("QuoteBlock", {
        quote: "A correction used to take three weeks and a developer. Now the desk publishes it themselves before lunch.",
        source: "Head of communications, a public-sector client",
      }),
      ref("BannerBlock", cta),
    ],
  });

  // --- navigation -----------------------------------------------------------
  await page("HeaderSettings", "Header", {
    menuLinks: [
      // The start page answers on both "/" and its own slug; a menu wants "/".
      b("LinkItemBlock", { link: { href: "/", text: "Home" } }),
      b("LinkItemBlock", { link: pageLink(services, "Services") }),
      b("LinkItemBlock", { link: pageLink(journal, "Journal") }),
      b("LinkItemBlock", { link: pageLink(about, "About") }),
      b("LinkItemBlock", { link: pageLink(faq, "FAQ") }),
      b("LinkItemBlock", { link: pageLink(contact, "Contact") }),
    ],
  });
  await page("FooterSettings", "Footer", {
    links: [
      b("LinkItemBlock", { link: pageLink(services, "Services") }),
      b("LinkItemBlock", { link: pageLink(journal, "Journal") }),
      b("LinkItemBlock", { link: pageLink(about, "About") }),
      b("LinkItemBlock", { link: pageLink(contact, "Contact") }),
      b("LinkItemBlock", { link: { href: "https://github.com/hybriden/paperboy", text: "Built with Paperboy" } }),
    ],
    footerText: rt(
      "Nordlys Studio is fictional. Every page here is demo content for the Paperboy CMS — edit any of it in the admin and reload.",
      // The Unsplash licence does not require attribution; it asks for it, and a
      // demo that models the habit costs one line.
      "Photographs from Unsplash.",
    ),
  });

  const start = await call("POST", "/manage/site/start-page", { documentId: home });
  if (!start.ok) log(`start page: ${start.status} ${start.text.slice(0, 200)}`);

  // Generated robots.txt / sitemap.xml / llms.txt need an origin to build
  // absolute URLs from. Without one the sitemap is served EMPTY and llms.txt
  // 404s, which reads as a broken feature rather than an unconfigured one.
  const files = await call("POST", "/manage/site/public-files", {
    canonicalBaseUrl: SITE_URL,
    llmsSummary: "Demo content for the Paperboy CMS, in the shape of a small design studio's website.",
    securityContact: "mailto:security@example.com",
  });
  if (!files.ok) log(`public files: ${files.status} ${files.text.slice(0, 200)}`);

  log(`done — site ${SITE_URL} · admin http://localhost:8090`);
}

main().catch((error) => {
  // Loud, and non-fatal for the stack: a demo without demo content is still a
  // working CMS, and failing the whole compose run over sample copy is worse.
  console.error("[demo-content] FAILED:", error?.message ?? error);
  process.exitCode = 1;
});
