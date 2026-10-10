import {
  getDocument,
  GlobalWorkerOptions,
  type PDFDocumentProxy,
  type RenderTask,
} from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { normalize } from './library';
import { pdfResolution } from './pdf-resolution';

GlobalWorkerOptions.workerSrc = workerUrl;

export class PdfReader {
  private document?: PDFDocumentProxy;
  private task?: RenderTask;
  private generation = 0;
  private texts = new Map<number, string>();
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

  async search(
    query: string,
    onProgress: (page: number, total: number) => void,
    cancelled: () => boolean,
  ) {
    const document = this.document;
    if (!document) return [];
    const results: { page: number; snippet: string }[] = [];
    const needle = normalize(query.trim());
    if (!needle) return results;
    for (let page = 1; page <= document.numPages; page++) {
      if (cancelled() || document !== this.document) return [];
      let text = this.texts.get(page);
      if (text === undefined) {
        const content = await (await document.getPage(page)).getTextContent();
        text = content.items.map((item) => ('str' in item ? item.str : '')).join(' ');
        if (cancelled() || document !== this.document) return [];
        this.texts.set(page, text);
      }
      const index = normalize(text).indexOf(needle);
      if (index >= 0)
        results.push({
          page,
          snippet: text.slice(Math.max(0, index - 35), index + needle.length + 90),
        });
      onProgress(page, document.numPages);
    }
    return results;
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
