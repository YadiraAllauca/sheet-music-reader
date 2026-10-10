import { describe, expect, it, vi } from 'vitest';
import { attachFileSwipe } from '../src/file-swipe';

function setup(width = 390, contentWidth = width) {
  const target = new EventTarget();
  Object.assign(target, { clientWidth: width, scrollWidth: contentWidth });
  const navigate = vi.fn();
  let enabled = true;
  attachFileSwipe(target as HTMLElement, navigate, () => enabled);
  function touch(type: string, points: [number, number][], ended: [number, number][] = []) {
    const event = new Event(type, { cancelable: true });
    const list = (items: [number, number][]) =>
      items.map(([clientX, clientY], identifier) => ({ clientX, clientY, identifier }));
    Object.assign(event, { touches: list(points), changedTouches: list(ended) });
    target.dispatchEvent(event);
    return event;
  }
  function swipe(from: [number, number], to: [number, number]) {
    touch('touchstart', [from]);
    const move = touch('touchmove', [to]);
    touch('touchend', [], [to]);
    return move;
  }
  return {
    navigate,
    touch,
    swipe,
    disable: () => {
      enabled = false;
    },
  };
}

describe('Touch file navigation', () => {
  it('navigates left to next and right to previous once per deliberate swipe', () => {
    const { navigate, swipe } = setup();
    expect(swipe([300, 100], [100, 110]).defaultPrevented).toBe(true);
    expect(navigate.mock.calls).toEqual([[1]]);
    swipe([100, 100], [300, 100]);
    expect(navigate.mock.calls).toEqual([[1], [-1]]);
  });
  it('leaves vertical scrolling and diagonal gestures alone', () => {
    const { navigate, swipe } = setup();
    expect(swipe([100, 300], [105, 100]).defaultPrevented).toBe(false);
    swipe([300, 300], [100, 100]);
    expect(navigate).not.toHaveBeenCalled();
  });
  it('ignores taps and small drags', () => {
    const { navigate, swipe } = setup();
    swipe([200, 100], [200, 100]);
    swipe([200, 100], [170, 100]);
    expect(navigate).not.toHaveBeenCalled();
  });
  it('preserves horizontal panning when a zoomed PDF is wider than its pane', () => {
    const { navigate, swipe } = setup(390, 600);
    expect(swipe([300, 100], [100, 100]).defaultPrevented).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
  });
  it('cancels multi-touch, cancelled touches, and a disabled reader', () => {
    const { navigate, touch, disable } = setup();
    touch('touchstart', [[300, 100]]);
    touch('touchstart', [
      [300, 100],
      [200, 100],
    ]);
    touch('touchmove', [[100, 100]]);
    touch('touchend', [], [[100, 100]]);
    touch('touchstart', [[300, 100]]);
    touch('touchmove', [[100, 100]]);
    touch('touchcancel', []);
    touch('touchend', [], [[100, 100]]);
    touch('touchstart', [[300, 100]]);
    touch('touchmove', [[100, 100]]);
    disable();
    touch('touchend', [], [[100, 100]]);
    expect(navigate).not.toHaveBeenCalled();
  });
});
