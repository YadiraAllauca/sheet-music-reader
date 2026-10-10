import 'fake-indexeddb/auto';
import { expect, it, vi } from 'vitest';
import {
  scanFolder,
  cacheFolderSnapshot,
  unlinkFolder,
  getCachedDocument,
  getProgress,
  type LocalDirectoryHandle,
  type LocalFileHandle,
} from '../src/linked-folders';
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
it('lee la copia importada hasta actualizar y la restaura sin acceder a los originales', async () => {
  let original = new File(['%PDF-1.7 old'], 'Local.pdf', { lastModified: 1 });
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
  original = new File(['%PDF-1.7 new'], 'Local.pdf', { lastModified: 2 });
  expect(await (await getFile(entries[0].score.id))!.text()).toBe('%PDF-1.7 old');
  forgetFolder(folder.id);
  const { restoreLibrary } = await import('../src/storage');
  handle.getFile = vi.fn().mockRejectedValue(new Error('Sin permiso'));
  await restoreLibrary();
  expect(await (await getFile(entries[0].score.id))!.text()).toBe('%PDF-1.7 old');
  expect(handle.getFile).not.toHaveBeenCalled();
  handle.getFile = async () => original;
  await applyFolderSnapshot(folder.id, await scanFolder(folder));
  expect(await (await getFile(entries[0].score.id))!.text()).toBe('%PDF-1.7 new');
  await unlinkFolder(folder.id);
  expect(await getCachedDocument(entries[0].score.id)).toBeUndefined();
  expect((await getProgress()).some((score) => score.id === entries[0].score.id)).toBe(false);
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
it('ignora archivos y directorios ocultos antes de intentar leerlos', async () => {
  const trash = directory('.Trash', []);
  trash.values = vi.fn().mockImplementation(() => {
    throw new Error('No leer papelera');
  });
  const trashed = file('.trashed-123-Sonata.pdf');
  trashed.getFile = vi.fn().mockRejectedValue(new Error('No leer archivo oculto'));
  const entries = await scanFolder({
    id: 'filtered',
    name: 'Música',
    handle: directory('Música', [trashed, trash, file('Sonata.pdf')]),
  });
  expect(entries.map((entry) => entry.score.name)).toEqual(['Sonata.pdf']);
  expect(trash.values).not.toHaveBeenCalled();
  expect(trashed.getFile).not.toHaveBeenCalled();
});

it('oculta copias antiguas de papelera al restaurar sin necesitar acceso a la carpeta', async () => {
  const original = new File(['%PDF-1.7'], '.trashed-123-Sonata.pdf');
  const { describeFile } = await import('../src/library');
  const score = {
    ...describeFile(original, 'Local/.trashed-123-Sonata.pdf'),
    id: 'linked:old-trash/Local/.trashed-123-Sonata.pdf',
  };
  await cacheFolderSnapshot(
    'old-trash',
    [score],
    [{ id: score.id, bytes: await original.arrayBuffer() }],
  );
  const { restoreLibrary } = await import('../src/storage');
  await restoreLibrary();
  expect((await getScores()).some((item) => item.id === score.id)).toBe(false);
  expect(await getFile(score.id)).toBeUndefined();
  await unlinkFolder('old-trash');
});

it('conserva la instantánea anterior completa si falla la lectura de una copia nueva', async () => {
  const folder = {
    id: 'atomic',
    name: 'Local',
    handle: directory('Local', [file('Anterior.pdf')]),
  };
  const initial = await scanFolder(folder);
  await applyFolderSnapshot(folder.id, initial);
  const next = await scanFolder({ ...folder, handle: directory('Local', [file('Nuevo.pdf')]) });
  next[0].file.arrayBuffer = async () => {
    throw new Error('No se pudo copiar');
  };
  await expect(applyFolderSnapshot(folder.id, next)).rejects.toThrow('No se pudo copiar');
  expect((await getScores()).filter((score) => score.id.startsWith('linked:atomic/'))).toEqual([
    initial[0].score,
  ]);
  expect(await getCachedDocument(initial[0].score.id)).toBeDefined();
  expect(await getCachedDocument(next[0].score.id)).toBeUndefined();
  await unlinkFolder(folder.id);
  forgetFolder(folder.id);
});

it('reutiliza los bytes guardados de PDFs sin cambios durante la actualización', async () => {
  const folder = {
    id: 'unchanged',
    name: 'Local',
    handle: directory('Local', [file('Igual.pdf')]),
  };
  await applyFolderSnapshot(folder.id, await scanFolder(folder));
  const entries = await scanFolder(folder);
  const read = vi.spyOn(entries[0].file, 'arrayBuffer');
  await applyFolderSnapshot(folder.id, entries);
  expect(read).not.toHaveBeenCalled();
  expect(await (await getFile(entries[0].score.id))!.text()).toBe('%PDF-1.7');
  await unlinkFolder(folder.id);
  forgetFolder(folder.id);
});

it('revierte metadatos y bajas si falta espacio al guardar nuevos PDFs', async () => {
  const folder = {
    id: 'quota',
    name: 'Local',
    handle: directory('Local', [file('Anterior.pdf')]),
  };
  const initial = await scanFolder(folder);
  await applyFolderSnapshot(folder.id, initial);
  const next = await scanFolder({ ...folder, handle: directory('Local', [file('Nuevo.pdf')]) });
  const put = IDBObjectStore.prototype.put;
  const failingPut = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
    this: IDBObjectStore,
    value: unknown,
    key?: IDBValidKey,
  ) {
    if (this.name === 'documents') throw new DOMException('Sin espacio', 'QuotaExceededError');
    return put.call(this, value, key);
  });
  try {
    await expect(applyFolderSnapshot(folder.id, next)).rejects.toMatchObject({
      name: 'QuotaExceededError',
    });
  } finally {
    failingPut.mockRestore();
  }
  expect((await getScores()).filter((score) => score.id.startsWith('linked:quota/'))).toEqual([
    initial[0].score,
  ]);
  expect(await getCachedDocument(initial[0].score.id)).toBeDefined();
  expect(await getCachedDocument(next[0].score.id)).toBeUndefined();
  expect((await getProgress()).filter((score) => score.id.startsWith('linked:quota/'))).toEqual([
    initial[0].score,
  ]);
  await unlinkFolder(folder.id);
  forgetFolder(folder.id);
});
