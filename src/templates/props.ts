import type { Delivered } from "@paperboycms/client";
import type { Data } from "../lib/values";

/**
 * The props every page template accepts.
 *
 * One shared shape, so `[...path].astro` can pick a template by content type
 * and render it without knowing which of these a given template happens to
 * use. Each template destructures what it needs and ignores the rest — that is
 * what makes adding a template a one-line change in the route.
 */
export interface TemplateProps {
  /** The delivered item's public field values. */
  data: Data;
  /** Declared type per public field — what schema-driven rendering reads. */
  types?: Record<string, string>;
  /** The item's name, for types with no heading-ish field of their own. */
  name?: string;
  /** Content locale, for date and number formatting. */
  locale?: string;
  /** Children, for list pages. Fetched by the route. */
  items?: Delivered[];
  /** 1-based page number from `?page=`. */
  page?: number;
  /** This page's own path, for building pagination links. */
  basePath?: string;
  /** True inside the CMS preview iframe: drafts, and editing markers. */
  preview?: boolean;
}
