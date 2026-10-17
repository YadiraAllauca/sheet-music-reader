import { expect, it } from 'vitest';
import { findPdfMatches } from '../src/pdf-search';

it('cuenta cada aparición de un término en la misma página', () => {
  expect(findPdfMatches([{ str: 'Sol sol SOL' }], 'sol')).toEqual([
    [{ item: 0, start: 0, end: 3 }],
    [{ item: 0, start: 4, end: 7 }],
    [{ item: 0, start: 8, end: 11 }],
  ]);
});

it('busca sin distinguir tildes y conserva los índices del texto original', () => {
  expect(findPdfMatches([{ str: 'Canción y cancio\u0301n' }], 'CANCION')).toEqual([
    [{ item: 0, start: 0, end: 7 }],
    [{ item: 0, start: 10, end: 18 }],
  ]);
});

it('encuentra frases repartidas entre fragmentos y líneas del PDF', () => {
  expect(
    findPdfMatches(
      [{ str: 'Un allegro', hasEOL: true }, { str: '  molto ' }, { str: 'vivace final' }],
      'allegro molto vivace',
    ),
  ).toEqual([
    [
      { item: 0, start: 3, end: 10 },
      { item: 1, start: 0, end: 8 },
      { item: 2, start: 0, end: 6 },
    ],
  ]);
  expect(findPdfMatches([{ str: 'al' }, { str: 'legro' }], 'allegro')).toEqual([
    [
      { item: 0, start: 0, end: 2 },
      { item: 1, start: 0, end: 5 },
    ],
  ]);
});

it('tolera ligaduras tipográficas y caracteres fuera del plano básico', () => {
  expect(findPdfMatches([{ str: '𝄞 ﬁnal' }], 'final')).toEqual([[{ item: 0, start: 3, end: 7 }]]);
});

it('interpreta puntuación literalmente y descarta consultas vacías', () => {
  expect(findPdfMatches([{ str: 'do [1]+ y do [1]+' }], '[1]+')).toHaveLength(2);
  expect(findPdfMatches([{ str: 'Sol' }], '   ')).toEqual([]);
  expect(findPdfMatches([], 'sol')).toEqual([]);
  expect(findPdfMatches([{ str: 'Sol' }], 'luna')).toEqual([]);
});
