// Reserve deliberate, one-finger horizontal swipes for file navigation.
// Native vertical scrolling, pinch gestures, and panning a wide PDF stay untouched.
export function attachFileSwipe(
  element: HTMLElement,
  navigate: (direction: -1 | 1) => void,
  enabled: () => boolean,
) {
  let gesture:
    { id: number; x: number; y: number; started: number; horizontal: boolean } | undefined;
  const cancel = () => {
    gesture = undefined;
  };

  element.addEventListener(
    'touchstart',
    (event) => {
      cancel();
      if (event.touches.length !== 1 || !enabled() || element.scrollWidth > element.clientWidth + 2)
        return;
      const touch = event.touches[0];
      gesture = {
        id: touch.identifier,
        x: touch.clientX,
        y: touch.clientY,
        started: Date.now(),
        horizontal: false,
      };
    },
    { passive: true },
  );

  element.addEventListener(
    'touchmove',
    (event) => {
      if (!gesture) return;
      if (event.touches.length !== 1 || !enabled()) {
        cancel();
        return;
      }
      const touch = event.touches[0];
      if (touch.identifier !== gesture.id) {
        cancel();
        return;
      }
      const dx = Math.abs(touch.clientX - gesture.x);
      const dy = Math.abs(touch.clientY - gesture.y);
      if (!gesture.horizontal && dy > 12 && dy > dx) {
        cancel();
        return;
      }
      if (dx > 16 && dx > dy * 1.7) gesture.horizontal = true;
      if (gesture.horizontal && event.cancelable) event.preventDefault();
    },
    { passive: false },
  );

  element.addEventListener(
    'touchend',
    (event) => {
      const previous = gesture;
      cancel();
      if (!previous || !previous.horizontal || event.touches.length || !enabled()) return;
      const touch = Array.from(event.changedTouches).find(
        (item) => item.identifier === previous.id,
      );
      if (!touch) return;
      const dx = touch.clientX - previous.x;
      const dy = touch.clientY - previous.y;
      const threshold = Math.max(50, Math.min(100, element.clientWidth * 0.18));
      if (
        Math.abs(dx) < threshold ||
        Math.abs(dx) < Math.abs(dy) * 1.7 ||
        Date.now() - previous.started > 1200
      )
        return;
      navigate(dx < 0 ? 1 : -1);
    },
    { passive: true },
  );
  element.addEventListener('touchcancel', cancel, { passive: true });
}
