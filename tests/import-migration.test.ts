import 'fake-indexeddb/auto';
import { openDB } from 'idb';
import { expect, it } from 'vitest';
import { describeFile } from '../src/library';

it('migra la base anterior conservando favoritos y progreso al crear las primeras copias', async () => {
  const file = new File(['%PDF-1.7 migration'], 'Sonata.pdf', { lastModified: 1 });
  const score = {
    ...describeFile(file, 'Local/Sonata.pdf'),
    id: 'linked:migration/Local/Sonata.pdf',
    favorite: true,
    lastPage: 3,
  };
  const previous = await openDB('atril-linked-folders', 1, {
    upgrade(database) {
      database.createObjectStore('folders', { keyPath: 'id' });
      database.createObjectStore('progress', { keyPath: 'id' });
    },
  });
  await previous.put('progress', score);
  previous.close();

  const { restoreLibrary, getScores, applyFolderSnapshot, getFile } =
    await import('../src/storage');
  await restoreLibrary();
  // A legacy metadata record is not yet an imported document.
  expect(await getScores()).toEqual([]);
  await applyFolderSnapshot('migration', [
    {
      score: { ...score, favorite: false, lastPage: 1 },
      file,
      handle: { kind: 'file', name: file.name, getFile: async () => file },
    },
  ]);
  expect(await getScores()).toEqual([score]);
  expect(await (await getFile(score.id))!.text()).toBe('%PDF-1.7 migration');
  const upgraded = await openDB('atril-linked-folders');
  expect(upgraded.version).toBe(2);
  expect([...upgraded.objectStoreNames]).toEqual(['documents', 'folders', 'progress']);
  upgraded.close();
});
