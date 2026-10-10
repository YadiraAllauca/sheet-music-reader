import { expect, it } from 'vitest';
import { reorderUpcoming } from '../src/reader-queue';

it('mueve partidas pendientes en ambas direcciones y conserva las ya leídas y la actual', () => {
  const queue = ['past', 'current', 'A', 'B', 'C'];
  expect(reorderUpcoming(queue, 'current', 'C', 'A')).toEqual(['past', 'current', 'C', 'A', 'B']);
  expect(reorderUpcoming(queue, 'current', 'A', 'C')).toEqual(['past', 'current', 'B', 'C', 'A']);
  for (const [id, target] of [
    ['past', 'C'],
    ['current', 'C'],
    ['C', 'current'],
    ['C', 'missing'],
  ])
    expect(reorderUpcoming(queue, 'current', id, target)).toEqual(queue);
  expect(reorderUpcoming(queue, 'missing', 'A', 'C')).toEqual(queue);
  expect(queue).toEqual(['past', 'current', 'A', 'B', 'C']);
});
