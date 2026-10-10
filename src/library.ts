export interface Score {
  id: string;
  name: string;
  path: string;
  folder: string;
  size: number;
  modified: number;
  added: number;
  favorite: boolean;
  lastPage: number;
  lastOpened: number;
}

export const normalize = (text: string) =>
  text.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('es');
export const title = (name: string) => name.replace(/\.pdf$/i, '').replace(/[_]/g, ' ');
export const formatBytes = (bytes: number) =>
  bytes === 0
    ? '0 KB'
    : bytes < 1024 * 1024
      ? `${Math.max(1, Math.round(bytes / 1024))} KB`
      : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
export const matches = (score: Score, query: string) =>
  normalize(`${score.name} ${score.path}`).includes(normalize(query.trim()));

// Android trash/pending files and macOS resource forks are hidden dot files.
// Skip their directories too, before opening any file handles.
export function isScorePath(path: string) {
  const parts = path.replace(/\\/g, '/').split('/');
  return /\.pdf$/i.test(parts.at(-1) || '') && parts.every((part) => !isIgnoredEntry(part));
}
export function isIgnoredEntry(name: string) {
  return (
    name.startsWith('.') ||
    name.startsWith('~$') ||
    ['__macosx', '$recycle.bin'].includes(name.toLowerCase())
  );
}

export function describeFile(file: File, relativePath?: string): Score {
  const path = relativePath || file.webkitRelativePath || `Importados/${file.name}`;
  return {
    id: path,
    name: file.name,
    path,
    folder: path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : 'Importados',
    size: file.size,
    modified: file.lastModified,
    added: Date.now(),
    favorite: false,
    lastPage: 1,
    lastOpened: 0,
  };
}

export function folderList(scores: Score[]): string[] {
  const folders = new Set<string>();
  for (const score of scores) {
    const parts = score.folder.split('/');
    for (let i = 1; i <= parts.length; i++) folders.add(parts.slice(0, i).join('/'));
  }
  return [...folders].sort((a, b) => a.localeCompare(b, 'es', { numeric: true }));
}

export function inFolder(score: Score, folder: string) {
  return score.folder === folder || score.folder.startsWith(`${folder}/`);
}
