import {
  getDocument,
  GlobalWorkerOptions,
  TextLayer,
  type PDFDocumentProxy,
  type PDFPageProxy,
  type RenderTask,
} from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { findPdfMatches, type PdfMatch } from './pdf-search';
import { pdfResolution } from './pdf-resolution';

GlobalWorkerOptions.workerSrc = workerUrl;

export class PdfReader {
  private document?: PDFDocumentProxy;
  private task?: RenderTask;
  private generation = 0;
  private texts = new Map<number, Awaited<ReturnType<PDFPageProxy['getTextContent']>>>();
  get pages() {
    return this.document?.numPages ?? 0;
  }

  async open(blob: Blob) {
    await this.close();
    const generation = this.generation;
    const loading = getDocument({
      data: new Uint8Array(await blob.arrayBuffer()),
      cMapUrl: '/pdfjs/cmaps/',
      cMapPacked: true,
      standardFontDataUrl: '/pdfjs/standard_fonts/',
      wasmUrl: '/pdfjs/wasm/',
    });
    const document = await loading.promise;
    if (generation !== this.generation) {
      await loading.destroy();
      return false;
    }
    this.document = document;
    return true;
  }

  async render(pageNumber: number, canvas: HTMLCanvasElement, width: number, zoom: number) {
    const document = this.document;
    if (!document) return;
    const generation = ++this.generation;
    this.task?.cancel();
    const page = await document.getPage(pageNumber);
    if (generation !== this.generation) return;
    const base = page.getViewport({ scale: 1 });
    const scale = (Math.min(width, 1100) / base.width) * zoom;
    const viewport = page.getViewport({ scale });
    const output = pdfResolution(
      viewport.width,
      viewport.height,
      (window.devicePixelRatio || 1) * (window.visualViewport?.scale || 1),
    );
    const ratio = output.ratio;
    canvas.width = output.width;
    canvas.height = output.height;
    canvas.style.width = `${viewport.width}px`;
    canvas.style.height = `${viewport.height}px`;
    this.task = page.render({
      canvas,
      viewport,
      transform: ratio !== 1 ? [ratio, 0, 0, ratio, 0, 0] : undefined,
    });
    try {
      await this.task.promise;
    } catch (error) {
      if ((error as Error).name !== 'RenderingCancelledException') throw error;
    }
  }

  async pageSize(pageNumber: number) {
    const page = await this.document!.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1 });
    return { width: viewport.width, height: viewport.height };
  }

  async search(
    query: string,
    onProgress: (page: number, total: number) => void,
    cancelled: () => boolean,
  ) {
    const document = this.document;
    if (!document) return [];
    const results: PdfMatch[] = [];
    if (!query.trim()) return results;
    for (let page = 1; page <= document.numPages; page++) {
      if (cancelled() || document !== this.document) return [];
      const content = await this.textContent(page);
      if (cancelled() || document !== this.document) return [];
      const items = content.items.filter((item) => 'str' in item);
      for (const ranges of findPdfMatches(items, query)) results.push({ page, ranges });
      onProgress(page, document.numPages);
    }
    return results;
  }

  private async textContent(page: number) {
    const document = this.document!;
    const cached = this.texts.get(page);
    if (cached) return cached;
    const content = await (await document.getPage(page)).getTextContent();
    if (document === this.document) this.texts.set(page, content);
    return content;
  }

  async highlight(
    pageNumber: number,
    container: HTMLElement,
    width: number,
    zoom: number,
    matches: PdfMatch[],
    selected: number,
  ) {
    const document = this.document;
    if (!document) return;
    const page = await document.getPage(pageNumber);
    const content = await this.textContent(pageNumber);
    if (document !== this.document || !container.isConnected) return;
    const base = page.getViewport({ scale: 1 });
    const scale = (Math.min(width, 1100) / base.width) * zoom;
    container.style.setProperty('--total-scale-factor', String(scale));
    const layer = new TextLayer({
      textContentSource: content,
      container,
      viewport: page.getViewport({ scale }),
    });
    await layer.render();
    if (document !== this.document || !container.isConnected) return;
    const byItem = new Map<number, { start: number; end: number; active: boolean }[]>();
    matches.forEach((match, index) => {
      if (match.page !== pageNumber) return;
      for (const range of match.ranges) {
        const ranges = byItem.get(range.item) || [];
        ranges.push({ ...range, active: index === selected });
        byItem.set(range.item, ranges);
      }
    });
    for (const [item, ranges] of byItem) {
      const span = layer.textDivs[item];
      const text = layer.textContentItemsStr[item];
      const fragment = window.document.createDocumentFragment();
      let offset = 0;
      for (const range of ranges.sort((a, b) => a.start - b.start)) {
        fragment.append(text.slice(offset, range.start));
        const mark = window.document.createElement('mark');
        mark.className = range.active ? 'pdf-match active' : 'pdf-match';
        mark.textContent = text.slice(range.start, range.end);
        fragment.append(mark);
        offset = range.end;
      }
      fragment.append(text.slice(offset));
      span.replaceChildren(fragment);
    }
  }

  async close() {
    this.generation++;
    this.task?.cancel();
    const document = this.document;
    this.document = undefined;
    this.texts.clear();
    await document?.loadingTask.destroy();
  }
}
