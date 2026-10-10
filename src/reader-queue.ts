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
    const panel = container.closest('.reader-search-panel');
    if (panel) {
      const bounds = panel.getBoundingClientRect();
      if (event.clientY > bounds.bottom - 48) panel.scrollTop += 12;
      else if (event.clientY < bounds.top + 48) panel.scrollTop -= 12;
    }
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
