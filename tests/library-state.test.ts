import { expect, it } from 'vitest';
import { loadLibraryState, moveReadingList } from '../src/library-state';

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

it('restaura la prioridad pendiente separada de la selección normal y sin duplicados', () => {
  const state = loadLibraryState({
    getItem: () => JSON.stringify({ readingList: ['A', 'B'], priorityQueue: ['X', 'X', 3, 'Y'] }),
  });
  expect(state.readingList).toEqual(['A', 'B']);
  expect(state.priorityQueue).toEqual(['X', 'Y']);
});
