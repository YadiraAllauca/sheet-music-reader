export interface PdfTextRange {
  item: number;
  start: number;
  end: number;
}

export interface PdfMatch {
  page: number;
  ranges: PdfTextRange[];
}

function searchable(text: string) {
  let value = '';
  const starts: number[] = [];
  const ends: number[] = [];
  let offset = 0;
  for (const character of text) {
    const normalized = character.normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase('es');
    for (const part of normalized) {
      const next = /\s/u.test(part) ? ' ' : part;
      if (next === ' ' && value.endsWith(' ')) {
        ends[ends.length - 1] = offset + character.length;
        continue;
      }
      value += next;
      for (let index = 0; index < next.length; index++) {
        starts.push(offset);
        ends.push(offset + character.length);
      }
    }
    if (!normalized && ends.length) ends[ends.length - 1] = offset + character.length;
    offset += character.length;
  }
  return { value, starts, ends };
}

/** Keeps original UTF-16 offsets for highlights, including accents and ligatures. */
export function findPdfMatches(items: { str: string; hasEOL?: boolean }[], query: string) {
  const needle = searchable(query).value.trim();
  if (!needle) return [];
  let text = '';
  const segments = items.map((item) => {
    const start = text.length;
    text += item.str;
    const end = text.length;
    if (item.hasEOL) text += '\n';
    return { start, end };
  });
  const indexed = searchable(text);
  const matches: PdfTextRange[][] = [];
  let position = 0;
  while ((position = indexed.value.indexOf(needle, position)) !== -1) {
    const start = indexed.starts[position];
    const end = indexed.ends[position + needle.length - 1];
    matches.push(
      segments.flatMap((segment, item) => {
        const from = Math.max(start, segment.start);
        const to = Math.min(end, segment.end);
        return from < to ? [{ item, start: from - segment.start, end: to - segment.start }] : [];
      }),
    );
    position += needle.length;
  }
  return matches;
}
