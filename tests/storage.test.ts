import 'fake-indexeddb/auto';
import { expect, it } from 'vitest';
import { getFile, getScores, removeScore, saveFile, updateScore } from '../src/storage';

it('mantiene el archivo original y conserva favoritos y progreso durante la sesión', async () => {
  const file = new File(['%PDF-1.7\nfixture'], 'Persistencia.pdf', { lastModified: 100 });
  const score = await saveFile(file, 'Test/Persistencia.pdf');
  await updateScore({ ...score, favorite: true, lastPage: 3 });
  await saveFile(file, 'Test/Persistencia.pdf');
  const saved = (await getScores()).find((s) => s.id === score.id)!;
  expect(saved.favorite).toBe(true);
  expect(saved.lastPage).toBe(3);
  expect(await getFile(score.id)).toBe(file);
  expect(await (await getFile(score.id))!.text()).toBe('%PDF-1.7\nfixture');
  const changed = new File(['%PDF-1.7\nnew'], 'Persistencia.pdf', { lastModified: 200 });
  expect((await saveFile(changed, score.path)).lastPage).toBe(1);
  await removeScore(score.id);
  expect(await getFile(score.id)).toBeUndefined();
  expect((await getScores()).find((s) => s.id === score.id)).toBeUndefined();
});
