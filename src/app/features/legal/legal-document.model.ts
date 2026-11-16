import type { LangCode } from '../../core/services/language.service';
import { interpolateLegalText } from './controller-identity';

/**
 * Shape of public/i18n/legal/{lang}/{privacy|terms}.json. Strings may contain inline links in
 * the form [label](/route) or [label](mailto:address) — parsed by parseLegalText(), never
 * injected as HTML.
 */
export type LegalDocKind = 'privacy' | 'terms';

export interface LegalBlock {
  /** A paragraph. */
  p?: string;
  /** A bullet list. */
  ul?: string[];
}

export interface LegalSection {
  heading: string;
  blocks: LegalBlock[];
}

export interface LegalDocumentContent {
  title: string;
  metaDescription: string;
  /** Shown as a banner above the text. Set while a translation has not been reviewed by a lawyer. */
  reviewNotice?: string;
  sections: LegalSection[];
}

/** Replaces the {{TOKENS}} in every string of a document from the central controller identity. */
export function interpolateDocument(doc: LegalDocumentContent, lang: LangCode): LegalDocumentContent {
  const t = (text: string) => interpolateLegalText(text, lang);
  return {
    ...doc,
    title: t(doc.title),
    metaDescription: t(doc.metaDescription),
    reviewNotice: doc.reviewNotice ? t(doc.reviewNotice) : doc.reviewNotice,
    sections: doc.sections.map(section => ({
      heading: t(section.heading),
      blocks: section.blocks.map(block => ({
        ...(block.p !== undefined ? { p: t(block.p) } : {}),
        ...(block.ul !== undefined ? { ul: block.ul.map(t) } : {})
      }))
    }))
  };
}

export type LegalTextSegment =
  | { kind: 'text'; text: string }
  | { kind: 'route'; text: string; href: string }
  | { kind: 'mail'; text: string; href: string };

const LINK = /\[([^\]]+)\]\(([^)\s]+)\)/g;

/** Splits "text [label](/route) text" into plain/route/mailto segments. Only app-internal
 *  routes ("/...") and mailto: targets become links; anything else stays literal text. */
export function parseLegalText(input: string): LegalTextSegment[] {
  const out: LegalTextSegment[] = [];
  let last = 0;
  for (const m of input.matchAll(LINK)) {
    const idx = m.index ?? 0;
    if (idx > last) out.push({ kind: 'text', text: input.slice(last, idx) });
    const full = m[0];
    const label = m[1] ?? full;
    const target = m[2] ?? '';
    if (target.startsWith('/') && !target.startsWith('//')) {
      out.push({ kind: 'route', text: label, href: target });
    } else if (target.startsWith('mailto:')) {
      out.push({ kind: 'mail', text: label, href: target });
    } else {
      out.push({ kind: 'text', text: full });
    }
    last = idx + full.length;
  }
  if (last < input.length) out.push({ kind: 'text', text: input.slice(last) });
  return out;
}
