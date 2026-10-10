import 'fake-indexeddb/auto';
import { expect, it } from 'vitest';
import { scanFolder, type LocalDirectoryHandle, type LocalFileHandle } from '../src/linked-folders';
import { applyFolderSnapshot, getFile, getScores, updateScore, forgetFolder } from '../src/storage';

function directory(
  name: string,
  children: (LocalDirectoryHandle | LocalFileHandle)[],
): LocalDirectoryHandle {
  return {
    name,
    kind: 'directory',
    async *values() {
      yield* children;
    },
    async isSameEntry(other) {
      return other === this;
    },
    async queryPermission() {
      return 'granted';
    },
    async requestPermission() {
      return 'granted';
    },
  };
}
function file(name: string, modified = 1): LocalFileHandle {
  return {
    name,
    kind: 'file',
    async getFile() {
      return new File(['%PDF-1.7'], name, { lastModified: modified });
    },
  };
}
it('detecta altas, cambios y bajas recursivas sin mezclar carpetas con el mismo nombre', async () => {
  const children: (LocalDirectoryHandle | LocalFileHandle)[] = [
    directory('Piano', [file('Sonata.pdf')]),
    file('nota.txt'),
  ];
  const handle = directory('Música', children);
  const folder = { id: 'first', name: handle.name, handle };
  await applyFolderSnapshot(folder.id, await scanFolder(folder));
  const score = (await getScores()).find((s) => s.id.startsWith('linked:first/'))!;
  expect(score.path).toBe('Música/Piano/Sonata.pdf');
  await updateScore({ ...score, favorite: true, lastPage: 4 });
  children[0] = directory('Piano', [file('Sonata.pdf', 2), file('Vals.pdf')]);
  await applyFolderSnapshot(folder.id, await scanFolder(folder));
  const updated = (await getScores()).find((s) => s.id === score.id)!;
  expect(updated.favorite).toBe(true);
  expect(updated.lastPage).toBe(1);
  await applyFolderSnapshot('second', await scanFolder({ ...folder, id: 'second' }));
  expect((await getScores()).filter((s) => s.name === 'Sonata.pdf')).toHaveLength(2);
  children.length = 0;
  await applyFolderSnapshot(folder.id, await scanFolder(folder));
  expect(await getFile(score.id)).toBeUndefined();
  expect((await getScores()).filter((s) => s.id.startsWith('linked:second/'))).toHaveLength(2);
  forgetFolder('first');
  forgetFolder('second');
});
it('lee la versión más reciente del archivo original al abrirlo', async () => {
  let original = new File(['%PDF-1.7 old'], 'Local.pdf');
  const handle: LocalFileHandle = {
    kind: 'file',
    name: original.name,
    async getFile() {
      return original;
    },
  };
  const folder = { id: 'fresh', name: 'Local', handle: directory('Local', [handle]) };
  const entries = await scanFolder(folder);
  await applyFolderSnapshot(folder.id, entries);
  original = new File(['%PDF-1.7 new'], 'Local.pdf');
  expect(await getFile(entries[0].score.id)).toBe(original);
  forgetFolder(folder.id);
});
it('no produce una instantánea parcial si falla una carpeta', async () => {
  const broken = directory('Privada', []);
  broken.values = async function* () {
    yield await Promise.reject(new Error('Permiso revocado'));
  };
  const folder = {
    id: 'broken',
    name: 'Local',
    handle: directory('Local', [file('Primero.pdf'), broken]),
  };
  await expect(scanFolder(folder)).rejects.toThrow('Permiso revocado');
});
