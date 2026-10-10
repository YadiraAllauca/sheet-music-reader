// Delegate to the stable library container: selecting a score rebuilds its card.
export function attachLongPressSelection(container: HTMLElement, toggle: (id: string) => void) {
  let gesture:
    | {
        id: number;
        x: number;
        y: number;
        scoreId: string;
        card: HTMLElement;
        selected: boolean;
      }
    | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let suppressClickUntil = 0;

  function cancel() {
    clearTimeout(timer);
    gesture?.card.classList.remove('pressing');
    gesture = undefined;
  }
  // A fresh touch anywhere permits the user's next intentional action.
  container.ownerDocument.addEventListener(
    'touchstart',
    () => {
      suppressClickUntil = 0;
    },
    { passive: true, capture: true },
  );
  container.addEventListener(
    'touchstart',
    (event) => {
      cancel();
      suppressClickUntil = 0;
      if (event.touches.length !== 1) return;
      const button = (event.target as HTMLElement).closest<HTMLElement>('.score-open[data-open]');
      if (!button || !container.contains(button)) return;
      const card = button.closest<HTMLElement>('.score-card')!;
      const touch = event.touches[0];
      const current: NonNullable<typeof gesture> = {
        id: touch.identifier,
        x: touch.clientX,
        y: touch.clientY,
        scoreId: button.dataset.open!,
        card,
        selected: false,
      };
      gesture = current;
      card.classList.add('pressing');
      timer = setTimeout(() => {
        if (gesture !== current || !card.isConnected) return;
        current.selected = true;
        card.classList.remove('pressing');
        suppressClickUntil = Infinity;
        toggle(current.scoreId);
      }, 450);
    },
    { passive: true },
  );
  container.ownerDocument.addEventListener(
    'touchmove',
    (event) => {
      if (!gesture) return;
      const touch = event.touches[0];
      if (
        event.touches.length !== 1 ||
        touch.identifier !== gesture.id ||
        Math.hypot(touch.clientX - gesture.x, touch.clientY - gesture.y) > 10
      ) {
        if (gesture.selected) suppressClickUntil = Date.now() + 800;
        cancel();
      }
    },
    { passive: true },
  );
  container.ownerDocument.addEventListener(
    'touchend',
    (event) => {
      if (gesture?.selected) {
        if (event.cancelable) event.preventDefault();
        suppressClickUntil = Date.now() + 800;
      }
      cancel();
    },
    { passive: false },
  );
  container.ownerDocument.addEventListener(
    'touchcancel',
    () => {
      if (gesture?.selected) suppressClickUntil = Date.now() + 800;
      cancel();
    },
    { passive: true },
  );
  // Do not open a PDF (or hit a newly rendered control) on the release click.
  container.ownerDocument.addEventListener(
    'click',
    (event) => {
      if (Date.now() >= suppressClickUntil) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      suppressClickUntil = 0;
    },
    { capture: true },
  );
  container.addEventListener('contextmenu', (event) => {
    if (gesture || Date.now() < suppressClickUntil) event.preventDefault();
  });
}
