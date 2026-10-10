import { openDB, type DBSchema } from 'idb';
import { describeFile, isIgnoredEntry, isScorePath, type Score } from './library';

export interface LocalFileHandle {
  kind: 'file';
  name: string;
  getFile(): Promise<File>;
}
export interface LocalDirectoryHandle {
  kind: 'directory';
  name: string;
  values(): AsyncIterable<LocalFileHandle | LocalDirectoryHandle>;
  isSameEntry(other: LocalDirectoryHandle): Promise<boolean>;
  queryPermission(options: { mode: 'read' }): Promise<PermissionState>;
  requestPermission(options: { mode: 'read' }): Promise<PermissionState>;
}
export interface LinkedFolder {
  id: string;
  name: string;
  handle: LocalDirectoryHandle;
}
export interface LinkedEntry {
  score: Score;
  handle: LocalFileHandle;
  file: File;
}
interface CachedDocument {
  id: string;
  bytes: ArrayBuffer;
}
interface FolderDB extends DBSchema {
  folders: { key: string; value: LinkedFolder };
  progress: { key: string; value: Score };
  documents: { key: string; value: CachedDocument };
}
let database: ReturnType<typeof openDB<FolderDB>> | undefined;
function db() {
  return (database ??= openDB<FolderDB>('atril-linked-folders', 2, {
    upgrade(database, oldVersion) {
      if (oldVersion < 1) {
        database.createObjectStore('folders', { keyPath: 'id' });
        database.createObjectStore('progress', { keyPath: 'id' });
      }
      database.createObjectStore('documents', { keyPath: 'id' });
    },
  }));
}
export async function getLinkedFolders() {
  return (await db()).getAll('folders');
}
export async function linkFolder(handle: LocalDirectoryHandle) {
  for (const folder of await getLinkedFolders()) {
    if (await handle.isSameEntry(folder.handle)) return folder;
  }
  const folder = { id: crypto.randomUUID(), name: handle.name, handle };
  await (await db()).put('folders', folder);
  return folder;
}
export async function unlinkFolder(id: string) {
  const database = await db();
  const tx = database.transaction(['folders', 'progress', 'documents'], 'readwrite');
  await tx.objectStore('folders').delete(id);
  const keys = await tx.objectStore('progress').getAllKeys();
  for (const key of keys) {
    if (key.startsWith(`linked:${id}/`)) await tx.objectStore('progress').delete(key);
  }
  for (const key of await tx.objectStore('documents').getAllKeys()) {
    if (key.startsWith(`linked:${id}/`)) await tx.objectStore('documents').delete(key);
  }
  await tx.done;
}
export async function saveProgress(score: Score) {
  await (await db()).put('progress', score);
}
export async function getProgress() {
  return (await db()).getAll('progress');
}
export async function getCachedDocumentIds() {
  return (await db()).getAllKeys('documents');
}
export async function getCachedDocument(id: string) {
  return (await db()).get('documents', id);
}
export async function cacheFolderSnapshot(
  folderId: string,
  scores: Score[],
  documents: CachedDocument[],
) {
  const database = await db();
  const tx = database.transaction(['progress', 'documents'], 'readwrite');
  try {
    const present = new Set(scores.map((score) => score.id));
    for (const store of ['progress', 'documents'] as const) {
      for (const id of await tx.objectStore(store).getAllKeys()) {
        if (id.startsWith(`linked:${folderId}/`) && !present.has(id))
          await tx.objectStore(store).delete(id);
      }
    }
    for (const score of scores) await tx.objectStore('progress').put(score);
    for (const document of documents) await tx.objectStore('documents').put(document);
    await tx.done;
  } catch (error) {
    try {
      tx.abort();
    } catch {
      /* The browser may have already aborted it. */
    }
    await tx.done.catch(() => {});
    throw error;
  }
}

// Build the full snapshot first; storage copies only new or changed PDF contents.
export async function scanFolder(folder: LinkedFolder): Promise<LinkedEntry[]> {
  const entries: LinkedEntry[] = [];
  async function walk(directory: LocalDirectoryHandle, prefix: string) {
    for await (const handle of directory.values()) {
      if (isIgnoredEntry(handle.name)) continue;
      const path = `${prefix}/${handle.name}`;
      if (handle.kind === 'directory') await walk(handle, path);
      else if (isScorePath(path)) {
        const file = await handle.getFile();
        const score = describeFile(file, path);
        score.id = `linked:${folder.id}/${path}`;
        entries.push({ score, handle, file });
      }
    }
  }
  await walk(folder.handle, folder.name);
  return entries;
}
