import { ATTR } from "@paperboycms/preview/protocol";

/**
 * On-page editing markers — emitted ONLY in preview.
 *
 * These tell the Paperboy admin which DOM node belongs to which field, so a
 * click in the preview pane opens the right input. They are addressed to the
 * editor, so they have no business on the public site, where they would publish
 * your internal field names to every visitor and crawler.
 *
 * Spread them rather than writing the attribute inline:
 *
 *   <h1 {...pbField("heading", preview)}>{heading}</h1>
 *
 * so public-vs-preview is one decision per element and cannot be forgotten.
 * `editing.test.ts` fails if a literal `data-pb-` attribute appears in a
 * template.
 *
 * Attribute NAMES come from `@paperboycms/preview/protocol` — the package that
 * owns this DOM contract — so they can never drift from what the admin looks
 * for. Content areas have their own helper in the client: `pbAreaAttrs`.
 */
export type PbAttrs = Record<string, string | number>;

/** An editable field region. */
export function pbField(name: string, preview: boolean): PbAttrs {
  return preview ? { [ATTR.field]: name } : {};
}

/**
 * A rendered block inside an area, so a click can be scoped to this block
 * rather than the page. `type` is omitted when unknown.
 */
export function pbBlock(index: number, type: string | undefined, preview: boolean): PbAttrs {
  if (!preview) return {};
  return type === undefined ? { [ATTR.blockIndex]: index } : { [ATTR.blockIndex]: index, [ATTR.blockType]: type };
}
