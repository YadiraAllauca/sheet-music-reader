import { openDB, type DBSchema } from 'idb';
import { describeFile, type Score } from './library';

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
}
interface FolderDB extends DBSchema {
  folders: { key: string; value: LinkedFolder };
  progress: { key: string; value: Score };
}
let database: ReturnType<typeof openDB<FolderDB>> | undefined;
function db() {
  return (database ??= openDB<FolderDB>('atril-linked-folders', 1, {
    upgrade(database) {
      database.createObjectStore('folders', { keyPath: 'id' });
      database.createObjectStore('progress', { keyPath: 'id' });
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
  const tx = database.transaction(['folders', 'progress'], 'readwrite');
  await tx.objectStore('folders').delete(id);
  const keys = await tx.objectStore('progress').getAllKeys();
  for (const key of keys) {
    if (key.startsWith(`linked:${id}/`)) await tx.objectStore('progress').delete(key);
  }
  await tx.done;
}
export async function saveProgress(score: Score) {
  await (await db()).put('progress', score);
}
export async function getProgress() {
  return (await db()).getAll('progress');
}

// Scan metadata only. Fetch fresh PDF bytes from the handle when the reader opens it.
// Build the full snapshot before applying it, so failed scans cannot remove valid entries.
export async function scanFolder(folder: LinkedFolder): Promise<LinkedEntry[]> {
  const entries: LinkedEntry[] = [];
  async function walk(directory: LocalDirectoryHandle, prefix: string) {
    for await (const handle of directory.values()) {
      const path = `${prefix}/${handle.name}`;
      if (handle.kind === 'directory') await walk(handle, path);
      else if (/\.pdf$/i.test(handle.name)) {
        const file = await handle.getFile();
        const score = describeFile(file, path);
        score.id = `linked:${folder.id}/${path}`;
        entries.push({ score, handle });
      }
    }
  }
  await walk(folder.handle, folder.name);
  return entries;
}
