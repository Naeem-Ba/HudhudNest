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
  sections: LegalSection[];
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
    const [full, label, target] = m;
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
