import { afterEach, expect, it, vi } from 'vitest';
import { attachLongPressSelection } from '../src/long-press-selection';

function setup() {
  vi.useFakeTimers();
  const container = new EventTarget();
  const document = new EventTarget();
  const classes = new Set<string>();
  const card = {
    isConnected: true,
    classList: {
      add: (name: string) => classes.add(name),
      remove: (name: string) => classes.delete(name),
    },
  };
  const button = { dataset: { open: 'A' }, closest: () => card };
  Object.assign(container, { ownerDocument: document, contains: () => true });
  const toggle = vi.fn();
  attachLongPressSelection(container as HTMLElement, toggle);
  function touch(type: string, points: [number, number][] = [[10, 10]], score = true) {
    const event = new Event(type, { cancelable: true });
    Object.defineProperty(event, 'target', { value: { closest: () => (score ? button : null) } });
    Object.assign(event, {
      touches: points.map(([clientX, clientY], identifier) => ({ clientX, clientY, identifier })),
    });
    document.dispatchEvent(event);
    if (type === 'touchstart') container.dispatchEvent(event);
    return event;
  }
  function click() {
    const event = new Event('click', { cancelable: true });
    document.dispatchEvent(event);
    return event;
  }
  return { toggle, touch, click, classes, container };
}

afterEach(() => vi.useRealTimers());

it('selecciona una vez al mantener pulsado y bloquea el click posterior', () => {
  const { toggle, touch, click, classes } = setup();
  touch('touchstart');
  expect(classes.has('pressing')).toBe(true);
  vi.advanceTimersByTime(450);
  expect(toggle.mock.calls).toEqual([['A']]);
  vi.advanceTimersByTime(2000);
  expect(toggle).toHaveBeenCalledTimes(1);
  expect(touch('touchend', []).defaultPrevented).toBe(true);
  expect(click().defaultPrevented).toBe(true);
  // A fresh tap still opens normally.
  touch('touchstart');
  expect(touch('touchend', []).defaultPrevented).toBe(false);
  expect(click().defaultPrevented).toBe(false);
});

it('deja tocar brevemente y desplazarse sin seleccionar ni bloquear el scroll', () => {
  const { toggle, touch, click, classes } = setup();
  touch('touchstart');
  vi.advanceTimersByTime(200);
  touch('touchend', []);
  vi.advanceTimersByTime(500);
  expect(click().defaultPrevented).toBe(false);
  touch('touchstart');
  expect(touch('touchmove', [[10, 40]]).defaultPrevented).toBe(false);
  vi.advanceTimersByTime(500);
  expect(toggle).not.toHaveBeenCalled();
  expect(classes.has('pressing')).toBe(false);
});

it('cancela gestos de varios dedos, cancelados o sobre otras acciones', () => {
  const { toggle, touch } = setup();
  touch('touchstart');
  touch('touchmove', [
    [10, 10],
    [20, 20],
  ]);
  vi.advanceTimersByTime(500);
  touch('touchstart');
  touch('touchcancel', []);
  vi.advanceTimersByTime(500);
  touch('touchstart', [[10, 10]], false);
  vi.advanceTimersByTime(500);
  expect(toggle).not.toHaveBeenCalled();
});
