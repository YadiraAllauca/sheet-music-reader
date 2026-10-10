import { expect, it } from 'vitest';
import { ReaderSequence, reorderUpcoming } from '../src/reader-queue';

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

it('intercala PDFs prioritarios y retoma la secuencia original en el punto pendiente', () => {
  const sequence = new ReaderSequence();
  sequence.start(['A', 'B', 'C'], 'A');
  sequence.enqueue('X', 'last');
  expect(sequence.entries.map((entry) => entry.id)).toEqual(['A', 'X', 'B', 'C']);
  sequence.select('X', sequence.entries[1].key);
  expect(sequence.pending).toEqual([]);
  expect(sequence.entries[sequence.position + 1].id).toBe('B');
  sequence.select('B', sequence.entries[2].key);
  expect(sequence.entries[sequence.position + 1].id).toBe('C');
  sequence.select('X', sequence.entries[1].key);
  expect(sequence.pending).toEqual([]);
});

it('mantiene ocurrencias independientes si un PDF prioritario también pertenece al recorrido original', () => {
  const sequence = new ReaderSequence();
  sequence.start(['A', 'B', 'C'], 'A');
  sequence.enqueue('C', 'next');
  expect(sequence.entries.map((entry) => entry.id)).toEqual(['A', 'C', 'B', 'C']);
  const queued = sequence.entries[1];
  const original = sequence.entries[3];
  expect(queued.key).not.toBe(original.key);
  sequence.select('C', queued.key);
  sequence.select('B', sequence.entries[2].key);
  sequence.select('C', original.key);
  expect(sequence.position).toBe(3);
  sequence.select('C', queued.key);
  expect(sequence.position).toBe(1);
});

it('ordena y vacía únicamente la prioridad sin perder la continuación ni la partitura actual', () => {
  const sequence = new ReaderSequence();
  sequence.start(['A', 'B', 'C'], 'A', ['X', 'Y']);
  sequence.enqueue('X', 'last');
  expect(sequence.pending).toEqual(['X', 'Y']);
  sequence.enqueue('Y', 'next');
  expect(sequence.pending).toEqual(['Y', 'X']);
  const first = sequence.entries[1];
  const second = sequence.entries[2];
  sequence.reorder(second.key, first.key);
  expect(sequence.pending).toEqual(['X', 'Y']);
  sequence.reorder(sequence.entries[1].key, sequence.entries[3].key);
  expect(sequence.pending).toEqual(['X', 'Y']);
  sequence.select('X', sequence.entries[1].key);
  sequence.enqueue('Z', 'last');
  expect(sequence.pending).toEqual(['Y', 'Z']);
  sequence.remove(sequence.entries[sequence.position + 1].key);
  expect(sequence.pending).toEqual(['Z']);
  sequence.clearPriority();
  expect(sequence.current?.id).toBe('X');
  expect(sequence.entries.map((entry) => entry.id)).toEqual(['A', 'X', 'B', 'C']);
});
