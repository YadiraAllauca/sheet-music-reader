export function reorderUpcoming(ids: string[], current: string, id: string, target: string) {
  const currentIndex = ids.indexOf(current);
  const from = ids.indexOf(id);
  const to = ids.indexOf(target);
  if (currentIndex < 0 || from <= currentIndex || to <= currentIndex || from === to)
    return [...ids];
  const result = ids.filter((item) => item !== id);
  result.splice(to, 0, id);
  return result;
}

export interface ReaderEntry {
  key: string;
  id: string;
  queued: boolean;
  played: boolean;
}

// Priority entries interrupt the original sequence without moving its cursor.
export class ReaderSequence {
  entries: ReaderEntry[] = [];
  position = 0;
  private serial = 0;

  get current() {
    return this.entries[this.position];
  }
  get pending() {
    return this.entries
      .slice(this.position + 1)
      .filter((entry) => entry.queued && !entry.played)
      .map((entry) => entry.id);
  }
  start(ids: string[], current: string, pending: string[] = []) {
    this.entries = [...new Set(ids)].map((id) => this.entry(id, false));
    this.position = Math.max(
      0,
      this.entries.findIndex((entry) => entry.id === current),
    );
    for (const id of pending) this.enqueue(id, 'last');
  }
  private entry(id: string, queued: boolean): ReaderEntry {
    return { key: String(++this.serial), id, queued, played: false };
  }
  select(id: string, key?: string) {
    const index = key
      ? this.entries.findIndex((entry) => entry.key === key)
      : this.entries.findIndex((entry) => entry.id === id);
    if (index < 0) return;
    for (let i = this.position + 1; i <= index; i++)
      if (this.entries[i].queued) this.entries[i].played = true;
    this.position = index;
  }
  enqueue(id: string, position: 'next' | 'last') {
    if (!this.current || id === this.current.id) return;
    const existing = this.entries.findIndex(
      (entry, index) => index > this.position && entry.queued && !entry.played && entry.id === id,
    );
    if (existing >= 0 && position === 'last') return;
    if (existing >= 0) this.entries.splice(existing, 1);
    let index = this.position + 1;
    if (position === 'last') while (this.entries[index]?.queued) index++;
    this.entries.splice(index, 0, this.entry(id, true));
  }
  remove(key: string) {
    const index = this.entries.findIndex((entry) => entry.key === key);
    if (index > this.position) this.entries.splice(index, 1);
  }
  clearPriority() {
    this.entries = this.entries.filter(
      (entry, index) => index <= this.position || !entry.queued || entry.played,
    );
  }
  reorder(key: string, target: string) {
    const from = this.entries.find((entry) => entry.key === key);
    const to = this.entries.find((entry) => entry.key === target);
    if (!this.current || !from || !to || from.queued !== to.queued) return;
    const keys = reorderUpcoming(
      this.entries.map((entry) => entry.key),
      this.current.key,
      key,
      target,
    );
    this.entries = keys.map((item) => this.entries.find((entry) => entry.key === item)!);
  }
}

export function attachQueueDrag(
  container: HTMLElement,
  move: (id: string, target: string) => void,
) {
  let drag: { pointer: number; id: string; target: string } | undefined;
  const reset = () => {
    if (drag && container.hasPointerCapture(drag.pointer))
      container.releasePointerCapture(drag.pointer);
    drag = undefined;
    container
      .querySelectorAll('.queue-dragging, .queue-drop-target')
      .forEach((row) => row.classList.remove('queue-dragging', 'queue-drop-target'));
  };
  container.addEventListener('pointerdown', (event) => {
    const handle = (event.target as HTMLElement).closest<HTMLElement>('[data-queue-drag]');
    if (!handle || event.button !== 0 || !event.isPrimary) return;
    event.preventDefault();
    reset();
    const id = handle.dataset.queueDrag!;
    drag = { pointer: event.pointerId, id, target: id };
    container.setPointerCapture(event.pointerId);
    handle.closest('.queue-item')?.classList.add('queue-dragging');
  });
  container.addEventListener('pointermove', (event) => {
    if (!drag || drag.pointer !== event.pointerId) return;
    const row = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest<HTMLElement>('[data-queue-item]');
    container.querySelector('.queue-drop-target')?.classList.remove('queue-drop-target');
    if (row && container.contains(row)) {
      drag.target = row.dataset.queueItem!;
      if (drag.target !== drag.id) row.classList.add('queue-drop-target');
    }
    const bounds = container.getBoundingClientRect();
    if (event.clientY > bounds.bottom - 48) container.scrollTop += 12;
    else if (event.clientY < bounds.top + 48) container.scrollTop -= 12;
  });
  container.addEventListener('pointerup', (event) => {
    if (!drag || drag.pointer !== event.pointerId) return;
    const { id, target } = drag;
    reset();
    if (id !== target) move(id, target);
  });
  container.addEventListener('pointercancel', reset);
  container.addEventListener('lostpointercapture', reset);
  container.addEventListener('keydown', (event) => {
    const handle = (event.target as HTMLElement).closest<HTMLElement>('[data-queue-drag]');
    if (!handle || !['ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    const handles = [...container.querySelectorAll<HTMLElement>('[data-queue-drag]')];
    const index = handles.indexOf(handle);
    const next = handles[index + (event.key === 'ArrowUp' ? -1 : 1)];
    if (next) {
      const id = handle.dataset.queueDrag!;
      move(id, next.dataset.queueDrag!);
      [...container.querySelectorAll<HTMLElement>('[data-queue-drag]')]
        .find((item) => item.dataset.queueDrag === id)
        ?.focus();
    }
  });
}
