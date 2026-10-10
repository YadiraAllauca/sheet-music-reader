import { describeFile, type Score } from './library';
import {
  getProgress,
  saveProgress,
  type LinkedEntry,
  type LocalFileHandle,
} from './linked-folders';

// PDFs are never persisted: session files or handles to the original files only.
const scores = new Map<string, Score>();
const files = new Map<string, File | LocalFileHandle>();
const hidden = new Set<string>();

export async function getScores() {
  return [...scores.values()]
    .filter((score) => !hidden.has(score.id))
    .map((score) => ({ ...score }));
}
export async function getFile(id: string) {
  const file = files.get(id);
  return file instanceof File ? file : file?.getFile();
}
export async function updateScore(score: Score) {
  if (!files.has(score.id)) return;
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
  const present = new Set(entries.map(({ score }) => score.id));
  for (const id of scores.keys()) {
    if (id.startsWith(prefix) && !present.has(id)) {
      scores.delete(id);
      files.delete(id);
      hidden.delete(id);
    }
  }
  for (const entry of entries) {
    const score = preserveProgress(
      entry.score,
      scores.get(entry.score.id) || saved.get(entry.score.id),
    );
    scores.set(score.id, score);
    files.set(score.id, entry.handle);
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
