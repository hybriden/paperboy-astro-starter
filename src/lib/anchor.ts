/**
 * In-page anchors for blocks.
 *
 * Paperboy's link editor has an "anchor" field — type `faq` and the CMS delivers
 * `/about#faq`. The CMS has no idea what ids a front end emits, so the fragment
 * is whatever the editor typed and the ids are ours to provide. Nothing did:
 * `.pb-block` carried `scroll-margin-top: 6rem` in the stylesheet, but no block
 * had an `id`, so the only anchor on any page was `#main` and that field could
 * not work.
 *
 * The id is the block's own HEADING, slugified — because the editor types the
 * fragment by hand, so it has to be something they can guess from looking at the
 * page. A block instance's `key` would be stable and unguessable, which makes a
 * hand-typed field useless; between an anchor that can rot when someone renames
 * a heading and an anchor nobody can type, the typable one wins. Rename a
 * heading and you rename its anchor: that is the trade, and it is why the
 * convention is written down in the README rather than left to be discovered.
 */

/** Ids the page itself owns. A block headed "Main" must not steal the skip link. */
export const RESERVED_ANCHORS = ["main", "pb-form", "pb-edit-root"];

const MAX = 60;

/**
 * A heading to a URL fragment. Norwegian letters are transliterated rather than
 * stripped, so "Våre løsninger" is `vare-losninger` and not `v-re-l-sninger`.
 */
export function anchorSlug(raw: string): string {
  const slug = raw
    .trim()
    .toLowerCase()
    .replace(/æ/g, "ae")
    .replace(/ø/g, "o")
    .replace(/å/g, "a")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (slug.length <= MAX) return slug;
  // Cut at a word boundary when there is one, so a truncated anchor still reads.
  const cut = slug.slice(0, MAX);
  const lastDash = cut.lastIndexOf("-");
  return (lastDash > MAX / 2 ? cut.slice(0, lastDash) : cut).replace(/-+$/, "");
}

/**
 * One id per block, in document order — `undefined` where a block has no heading
 * to name it after, because a section nobody can refer to is better off without
 * an id than with a positional one that moves when blocks are reordered.
 *
 * Duplicates get a numeric suffix: two sections both called "Contact" are
 * `contact` and `contact-2`. First one wins, so adding a second does not move
 * the first one's anchor.
 */
export function assignAnchors(headings: (string | undefined)[], reserved: readonly string[] = RESERVED_ANCHORS): (string | undefined)[] {
  const taken = new Set(reserved);
  return headings.map((heading) => {
    const base = heading ? anchorSlug(heading) : "";
    if (!base) return undefined;

    let id = base;
    for (let n = 2; taken.has(id); n += 1) id = `${base}-${n}`;
    taken.add(id);
    return id;
  });
}

/** The fields a block might be titled by, most specific first. */
const HEADING_FIELDS = ["heading", "title", "topic", "question"];

/** The heading a block should be anchored by, if it has one. */
export function headingOf(data: Record<string, unknown>): string | undefined {
  for (const name of HEADING_FIELDS) {
    const v = data[name];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return undefined;
}
