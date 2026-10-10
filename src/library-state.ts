export interface LibraryState {
  folder: string;
  section: string;
  order: string;
  expandedFolders: string[];
  readingList: string[];
  priorityQueue?: string[];
}

const key = 'atril-library-state';
const defaults = (): LibraryState => ({
  folder: '',
  section: 'all',
  order: 'name',
  expandedFolders: [],
  readingList: [],
});
function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? [...new Set(value.filter((item): item is string => typeof item === 'string'))]
    : [];
}
export function loadLibraryState(storage: Pick<Storage, 'getItem'> = localStorage): LibraryState {
  try {
    const saved = JSON.parse(storage.getItem(key) || '{}');
    return {
      folder: typeof saved.folder === 'string' ? saved.folder : '',
      section: ['all', 'recent', 'favorites', 'reading-list'].includes(saved.section)
        ? saved.section
        : 'all',
      order: ['name', 'added', 'opened'].includes(saved.order) ? saved.order : 'name',
      expandedFolders: strings(saved.expandedFolders),
      readingList: strings(saved.readingList),
      ...(Array.isArray(saved.priorityQueue)
        ? { priorityQueue: strings(saved.priorityQueue) }
        : {}),
    };
  } catch {
    return defaults();
  }
}
export function saveLibraryState(state: LibraryState) {
  localStorage.setItem(key, JSON.stringify(state));
}
export function moveReadingList(ids: string[], id: string, direction: number) {
  const index = ids.indexOf(id);
  const next = index + direction;
  const result = [...ids];
  if (index >= 0 && next >= 0 && next < ids.length)
    [result[index], result[next]] = [result[next], result[index]];
  return result;
}
