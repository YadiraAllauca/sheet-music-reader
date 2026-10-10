import { expect, it } from 'vitest';
import { loadLibraryState, moveReadingList, queueReadingScore } from '../src/library-state';

it('restaura ubicación, carpetas expandidas y el orden de la lista sin duplicados', () => {
  expect(
    loadLibraryState({
      getItem: () =>
        JSON.stringify({
          folder: 'Música/Piano',
          section: 'all',
          order: 'opened',
          expandedFolders: ['Música', 'Música', 3],
          readingList: ['C', 'A', 'C'],
        }),
    }),
  ).toEqual({
    folder: 'Música/Piano',
    section: 'all',
    order: 'opened',
    expandedFolders: ['Música'],
    readingList: ['C', 'A'],
  });
});
it('tolera preferencias antiguas o dañadas para no impedir abrir la biblioteca', () => {
  for (const value of ['invalid', 'null', '{"section":"unknown","readingList":{}}']) {
    expect(loadLibraryState({ getItem: () => value })).toEqual({
      folder: '',
      section: 'all',
      order: 'name',
      expandedFolders: [],
      readingList: [],
    });
  }
});
it('reordena la lista respetando extremos y documentos que ya no existen', () => {
  const ids = ['C', 'A', 'B'];
  expect(moveReadingList(ids, 'A', -1)).toEqual(['A', 'C', 'B']);
  expect(moveReadingList(ids, 'A', 1)).toEqual(['C', 'B', 'A']);
  expect(moveReadingList(ids, 'C', -1)).toEqual(ids);
  expect(moveReadingList(ids, 'B', 1)).toEqual(ids);
  expect(moveReadingList(ids, 'missing', 1)).toEqual(ids);
  expect(ids).toEqual(['C', 'A', 'B']);
});

it('prepara el siguiente PDF sin duplicarlo ni alterar el historial o el resto de la lista', () => {
  const ids = ['A', 'B', 'C', 'D'];
  expect(queueReadingScore(ids, 'B', 'D', 'next')).toEqual(['A', 'B', 'D', 'C']);
  expect(queueReadingScore(ids, 'B', 'A', 'next')).toEqual(['B', 'A', 'C', 'D']);
  expect(queueReadingScore(ids, 'B', 'E', 'next')).toEqual(['A', 'B', 'E', 'C', 'D']);
  expect(queueReadingScore(ids, 'B', 'B', 'next')).toEqual(ids);
  expect(ids).toEqual(['A', 'B', 'C', 'D']);
});

it('inicia una lista desde el PDF abierto y permite añadir al final sin duplicados', () => {
  expect(queueReadingScore([], 'A', 'C', 'next')).toEqual(['A', 'C']);
  expect(queueReadingScore(['B', 'C'], 'A', 'D', 'last')).toEqual(['A', 'B', 'C', 'D']);
  expect(queueReadingScore(['A', 'C'], 'A', 'B', 'last')).toEqual(['A', 'C', 'B']);
  expect(queueReadingScore(['A', 'C'], 'A', 'C', 'last')).toEqual(['A', 'C']);
});
