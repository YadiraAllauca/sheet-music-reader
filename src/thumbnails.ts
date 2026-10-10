import type { Score } from './library';
import { getFile } from './storage';
import { PdfReader } from './pdf';

// Small previews stay in memory only. Limit work to one visible PDF at a time.
export function createThumbnails(canRender: () => boolean) {
  const cache = new Map<string, string>();
  let queue: { element: HTMLElement; score: Score; key: string }[] = [];
  let running = false;

  function show(element: HTMLElement, src: string) {
    if (!element.isConnected) return;
    const image = document.createElement('img');
    image.className = 'score-thumbnail';
    image.alt = 'Vista previa de la primera página';
    image.src = src;
    element.querySelector('.score-preview-placeholder')?.replaceWith(image);
  }

  async function process() {
    if (running || document.hidden || !canRender()) return;
    running = true;
    try {
      while (queue.length && !document.hidden && canRender()) {
        const item = queue.shift()!;
        if (!item.element.isConnected) continue;
        const cached = cache.get(item.key);
        if (cached) {
          show(item.element, cached);
          continue;
        }
        const reader = new PdfReader();
        try {
          const file = await getFile(item.score.id);
          if (!file || !item.element.isConnected || !canRender()) continue;
          if (!(await reader.open(file))) continue;
          const canvas = document.createElement('canvas');
          await reader.render(1, canvas, 180, 1);
          const src = canvas.toDataURL('image/webp', 0.8);
          cache.set(item.key, src);
          if (cache.size > 48) cache.delete(cache.keys().next().value!);
          show(item.element, src);
        } catch {
          // A denied permission or damaged PDF keeps the sheet placeholder.
        } finally {
          await reader.close();
        }
      }
    } finally {
      running = false;
    }
  }

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const element = entry.target as HTMLElement;
        const item = pending.get(element);
        observer.unobserve(element);
        if (item) queue.push(item);
      }
      void process();
    },
    { rootMargin: '80px' },
  );
  const pending = new WeakMap<HTMLElement, { element: HTMLElement; score: Score; key: string }>();
  document.addEventListener('visibilitychange', () => void process());

  return {
    refresh(scores: Score[]) {
      observer.disconnect();
      queue = [];
      const byId = new Map(scores.map((score) => [score.id, score]));
      document.querySelectorAll<HTMLElement>('[data-preview]').forEach((element) => {
        const score = byId.get(element.dataset.preview!);
        if (!score) return;
        const key = JSON.stringify([score.id, score.size, score.modified]);
        const cached = cache.get(key);
        if (cached) {
          cache.delete(key);
          cache.set(key, cached);
          show(element, cached);
        } else {
          pending.set(element, { element, score, key });
          observer.observe(element);
        }
      });
    },
  };
}
