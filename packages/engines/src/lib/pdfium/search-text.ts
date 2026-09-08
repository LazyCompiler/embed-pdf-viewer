/**
 * Whitespace-insensitive text matching for page search.
 *
 * PDFium's own `FPDFText_FindStart` matches the keyword literally, so a page
 * whose text carries whitespace where the reader sees none — OCR'd scans and
 * tracked-out headings emit `i n v o i c e`, justified lines break a word in
 * two — is unsearchable with the word as typed. Matching over a compacted
 * plane (every whitespace character dropped on BOTH sides) fixes that: the
 * needle no longer has to reproduce the page's spacing, and the page no longer
 * has to spell the word the way the needle does.
 *
 * The index map keeps hits in the ORIGINAL character space, so a match spans
 * the dropped whitespace as well (`i n v o i c e` highlights as one run) and
 * PDFium's rect/context helpers keep working unchanged.
 */

/** Whitespace, PDFium's soft-hyphen/BOM markers, and other control characters. */
const IGNORED_CODE_POINTS = new Set([0xfffe, 0xfeff]);

function isIgnored(character: string): boolean {
  const code = character.charCodeAt(0);
  return character.trim() === '' || code < 0x20 || IGNORED_CODE_POINTS.has(code);
}

/**
 * Case folding that never changes a character's length, so the index map stays
 * one-to-one (`toLowerCase()` expands a few code points, e.g. U+0130).
 */
function toComparable(character: string, matchCase: boolean): string {
  if (matchCase) return character;
  const lowerCased = character.toLowerCase();
  return lowerCased.length === character.length ? lowerCased : character;
}

export interface CompactedText {
  /** The text with every ignored character removed (and case-folded). */
  readonly compacted: string;
  /** `originalIndices[i]` is where `compacted[i]` sits in the source string. */
  readonly originalIndices: ReadonlyArray<number>;
}

export function compactText(text: string, matchCase: boolean): CompactedText {
  const compacted: string[] = [];
  const originalIndices: number[] = [];

  for (let index = 0; index < text.length; index++) {
    const character = text[index];
    if (isIgnored(character)) continue;
    compacted.push(toComparable(character, matchCase));
    originalIndices.push(index);
  }

  return { compacted: compacted.join(''), originalIndices };
}

const WORD_CHARACTER = /[\p{L}\p{N}_]/u;

/**
 * Whether a hit stands alone as a word. Checked on the ORIGINAL text: dropping
 * whitespace glues neighbours together on the compacted plane (`i n v o i c e 42`
 * compacts to `invoice42`), which would reject a genuine whole word.
 */
export function isWholeWordMatch(text: string, charIndex: number, charCount: number): boolean {
  const before = text[charIndex - 1];
  const after = text[charIndex + charCount];
  return (
    (before === undefined || !WORD_CHARACTER.test(before)) &&
    (after === undefined || !WORD_CHARACTER.test(after))
  );
}
