import { describeFile, type Score } from './library';
import {
  getProgress,
  getCachedDocument,
  getCachedDocumentIds,
  cacheFolderSnapshot,
  saveProgress,
  type LinkedEntry,
} from './linked-folders';

// Linked PDFs are read from the last committed import, never from a live handle.
const scores = new Map<string, Score>();
const files = new Map<string, File>();
const hidden = new Set<string>();

export async function restoreLibrary() {
  const available = new Set(await getCachedDocumentIds());
  for (const score of await getProgress()) {
    if (available.has(score.id)) scores.set(score.id, score);
  }
}
export async function getScores() {
  return [...scores.values()]
    .filter((score) => !hidden.has(score.id))
    .map((score) => ({ ...score }));
}
export async function getFile(id: string) {
  if (!id.startsWith('linked:')) return files.get(id);
  const score = scores.get(id);
  if (!score) return;
  const cached = await getCachedDocument(id);
  if (cached)
    return new File([cached.bytes], score.path.split('/').pop()!, {
      type: 'application/pdf',
      lastModified: score.modified,
    });
}
export async function updateScore(score: Score) {
  if (!scores.has(score.id)) return;
  if (score.id.startsWith('linked:')) await saveProgress(score);
  scores.set(score.id, { ...score });
}
export async function removeScore(id: string) {
  // Hide linked PDFs for this session; refreshing the folder does not re-add them.
  if (id.startsWith('linked:')) hidden.add(id);
  else {
    scores.delete(id);
    files.delete(id);
  }
}
function preserveProgress(score: Score, previous?: Score) {
  if (!previous) return score;
  return {
    ...score,
    favorite: previous.favorite,
    lastOpened: previous.lastOpened,
    added: previous.added,
    lastPage:
      previous.size === score.size && previous.modified === score.modified ? previous.lastPage : 1,
  };
}
export async function saveFile(file: File, path?: string) {
  const described = describeFile(file, path);
  const score = preserveProgress(described, scores.get(described.id));
  scores.set(score.id, { ...score });
  files.set(score.id, file);
  return score;
}
export async function applyFolderSnapshot(folderId: string, entries: LinkedEntry[]) {
  const prefix = `linked:${folderId}/`;
  const saved = new Map((await getProgress()).map((score) => [score.id, score]));
  const cached = new Set(await getCachedDocumentIds());
  const nextScores: Score[] = [];
  const documents: { id: string; bytes: ArrayBuffer }[] = [];
  // Read changed bytes before starting the transaction. A failed read or quota
  // error leaves the previous import intact, including deleted entries.
  for (const entry of entries) {
    const previous = saved.get(entry.score.id);
    nextScores.push(preserveProgress(entry.score, scores.get(entry.score.id) || previous));
    if (
      !cached.has(entry.score.id) ||
      previous?.size !== entry.score.size ||
      previous?.modified !== entry.score.modified
    ) {
      documents.push({ id: entry.score.id, bytes: await entry.file.arrayBuffer() });
    }
  }
  await cacheFolderSnapshot(folderId, nextScores, documents);
  const present = new Set(entries.map(({ score }) => score.id));
  for (const id of scores.keys()) {
    if (id.startsWith(prefix) && !present.has(id)) {
      scores.delete(id);
      files.delete(id);
      hidden.delete(id);
    }
  }
  for (const score of nextScores) {
    scores.set(score.id, score);
  }
}
export function forgetFolder(folderId: string) {
  const prefix = `linked:${folderId}/`;
  for (const id of scores.keys()) {
    if (id.startsWith(prefix)) {
      scores.delete(id);
      files.delete(id);
      hidden.delete(id);
    }
  }
}
