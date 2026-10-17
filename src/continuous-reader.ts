import { PdfReader } from './pdf';
import type { PdfMatch } from './pdf-search';

/** Keeps page geometry in the document, but only nearby pages in bitmap memory. */
export class ContinuousReader {
  private stack = document.createElement('div');
  private canvases: HTMLCanvasElement[] = [];
  private sizes: { width: number; height: number }[] = [];
  private rendered = new Set<number>();
  private generation = 0;
  private width = 0;
  private zoom = 1;
  private density = 0;
  private active = 1;
  private layingOut = false;
  private work: Promise<void> = Promise.resolve();
  private matches: PdfMatch[] = [];
  private selected = -1;
  private layers = new Map<number, HTMLElement>();

  constructor(
    private reader: PdfReader,
    private scroll: HTMLElement,
    private firstCanvas: HTMLCanvasElement,
    private changed: (page: number) => void,
    private failed: () => void,
  ) {
    this.stack.className = 'pdf-pages';
    firstCanvas.replaceWith(this.stack);
    this.stack.append(firstCanvas);
    scroll.addEventListener(
      'scroll',
      () => {
        if (this.layingOut || !this.sizes.length) return;
        const top = scroll.getBoundingClientRect().top;
        // Follow the page at the top of the reading area, allowing for the page gap.
        const index = this.canvases.findIndex(
          (canvas) => canvas.getBoundingClientRect().bottom > top + 24,
        );
        const atEnd =
          scroll.scrollTop > 0 && scroll.scrollTop + scroll.clientHeight >= scroll.scrollHeight - 1;
        const page = atEnd || index < 0 ? this.canvases.length : index + 1;
        if (page !== this.active) {
          this.active = page;
          this.changed(page);
        }
        void this.paint().catch(this.failed);
      },
      { passive: true },
    );
  }

  reset() {
    this.generation++;
    this.sizes = [];
    for (const canvas of this.canvases) canvas.width = canvas.height = 0;
    this.canvases = [];
    this.rendered.clear();
    this.clearHighlights();
    this.matches = [];
    this.selected = -1;
    this.stack.replaceChildren(this.firstCanvas);
    this.firstCanvas.hidden = true;
    this.firstCanvas.width = this.firstCanvas.height = 0;
    this.width = 0;
    this.active = 1;
    this.layingOut = false;
  }

  async render(page: number, width: number, zoom: number, navigate = false) {
    const density = (window.devicePixelRatio || 1) * (window.visualViewport?.scale || 1);
    const relayout = width !== this.width || zoom !== this.zoom || !this.sizes.length;
    if (relayout || density !== this.density) {
      const request = ++this.generation;
      this.layingOut = true;
      await this.work.catch(() => {});
      if (request !== this.generation) return;
      const old = this.canvases[this.active - 1];
      const offset = old
        ? (this.scroll.getBoundingClientRect().top +
            this.padding -
            old.getBoundingClientRect().top) /
          old.getBoundingClientRect().height
        : 0;
      const sizes = this.sizes.length
        ? this.sizes
        : await Promise.all(
            Array.from({ length: this.reader.pages }, (_, index) =>
              this.reader.pageSize(index + 1),
            ),
          );
      if (request !== this.generation) return;
      this.sizes = sizes;
      this.width = width;
      this.zoom = zoom;
      this.density = density;
      this.rendered.clear();
      this.clearHighlights();
      if (!this.canvases.length) {
        this.canvases = sizes.map((_, index) => {
          const canvas = index === 0 ? this.firstCanvas : document.createElement('canvas');
          canvas.className = 'pdf-page';
          canvas.dataset.page = String(index + 1);
          canvas.setAttribute('aria-label', `Página ${index + 1}`);
          canvas.hidden = false;
          const sheet = document.createElement('div');
          sheet.className = 'pdf-sheet';
          sheet.append(canvas);
          this.stack.append(sheet);
          return canvas;
        });
        navigate = true;
      }
      sizes.forEach((size, index) => {
        const canvas = this.canvases[index];
        canvas.width = canvas.height = 0;
        const scale = (Math.min(width, 1100) / size.width) * zoom;
        canvas.style.width = `${size.width * scale}px`;
        canvas.style.height = `${size.height * scale}px`;
        canvas.parentElement!.style.width = canvas.style.width;
        canvas.parentElement!.style.height = canvas.style.height;
      });
      this.active = page;
      if (relayout || navigate) this.scrollTo(page, navigate ? 0 : offset);
      this.layingOut = false;
    } else if (navigate) {
      this.active = page;
      this.scrollTo(page, 0);
    }
    await this.paint();
  }

  private scrollTo(page: number, fraction: number) {
    const canvas = this.canvases[page - 1];
    if (!canvas) return;
    this.scroll.scrollTop +=
      canvas.getBoundingClientRect().top -
      this.scroll.getBoundingClientRect().top -
      this.padding +
      canvas.getBoundingClientRect().height * fraction;
  }

  private get padding() {
    return parseFloat(getComputedStyle(this.scroll).paddingTop);
  }

  private clearHighlights() {
    for (const layer of this.layers.values()) layer.remove();
    this.layers.clear();
  }

  async setMatches(matches: PdfMatch[], selected: number) {
    this.matches = matches;
    this.selected = selected;
    this.clearHighlights();
    await this.paint();
  }

  focusMatch() {
    const mark = this.stack.querySelector<HTMLElement>('.pdf-match.active');
    if (!mark) return;
    const rect = mark.getBoundingClientRect();
    const bounds = this.scroll.getBoundingClientRect();
    const sheetTop = mark.closest('.pdf-sheet')!.getBoundingClientRect().top;
    const pageStart = this.scroll.scrollTop + sheetTop - bounds.top - this.padding;
    const centered =
      this.scroll.scrollTop + rect.top + rect.height / 2 - bounds.top - bounds.height / 2;
    this.scroll.scrollTop = Math.max(pageStart, centered);
    if (rect.left < bounds.left || rect.right > bounds.right) {
      this.scroll.scrollLeft += rect.left + rect.width / 2 - bounds.left - bounds.width / 2;
    }
  }

  private paint() {
    const request = this.generation;
    this.work = this.work
      .catch(() => {})
      .then(async () => {
        if (request !== this.generation || this.layingOut) return;
        const bounds = this.scroll.getBoundingClientRect();
        const nearby = this.canvases.flatMap((canvas, index) => {
          const rect = canvas.getBoundingClientRect();
          return rect.bottom >= bounds.top - bounds.height &&
            rect.top <= bounds.bottom + bounds.height
            ? [index]
            : [];
        });
        // Free distant backing bitmaps while retaining their CSS dimensions.
        for (const index of this.rendered) {
          if (!nearby.includes(index)) {
            this.canvases[index].width = this.canvases[index].height = 0;
            this.rendered.delete(index);
            this.layers.get(index)?.remove();
            this.layers.delete(index);
          }
        }
        nearby.sort((a, b) => Math.abs(a + 1 - this.active) - Math.abs(b + 1 - this.active));
        for (const index of nearby) {
          if (request !== this.generation) return;
          if (!this.rendered.has(index)) {
            await this.reader.render(index + 1, this.canvases[index], this.width, this.zoom);
            if (request !== this.generation) return;
            this.rendered.add(index);
          }
          if (!this.layers.has(index) && this.matches.some((match) => match.page === index + 1)) {
            const layer = document.createElement('div');
            layer.className = 'pdf-text-layer';
            layer.setAttribute('aria-hidden', 'true');
            this.canvases[index].parentElement!.append(layer);
            this.layers.set(index, layer);
            await this.reader.highlight(
              index + 1,
              layer,
              this.width,
              this.zoom,
              this.matches,
              this.selected,
            );
          }
        }
      });
    return this.work;
  }
}
