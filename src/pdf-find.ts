import { PdfReader } from './pdf';
import { ContinuousReader } from './continuous-reader';
import type { PdfMatch } from './pdf-search';

export function createPdfFind(options: {
  pane: HTMLElement;
  reader: PdfReader;
  view: ContinuousReader;
  navigate: (page: number) => Promise<void>;
  currentPage: () => number;
  enabled: () => boolean;
}) {
  const bar = document.createElement('div');
  bar.className = 'pdf-findbar';
  bar.hidden = true;
  bar.setAttribute('role', 'search');
  bar.setAttribute('aria-label', 'Buscar texto en el PDF');
  bar.innerHTML = `<input id="pdf-find-query" type="search" placeholder="Buscar en este PDF…" aria-label="Texto en este PDF" autocomplete="off" />
    <span class="pdf-find-count" role="status" aria-live="polite"></span>
    <div class="pdf-find-actions"><button class="icon-button" data-find="previous" aria-label="Coincidencia anterior" title="Anterior (Mayús + Enter)">↑</button><button class="icon-button" data-find="next" aria-label="Coincidencia siguiente" title="Siguiente (Enter)">↓</button><button class="icon-button" data-find="close" aria-label="Cerrar búsqueda en PDF" title="Cerrar (Esc)">×</button></div>`;
  options.pane.prepend(bar);
  const query = bar.querySelector('input')!;
  const count = bar.querySelector<HTMLElement>('.pdf-find-count')!;
  const previous = bar.querySelector<HTMLButtonElement>('[data-find="previous"]')!;
  const next = bar.querySelector<HTMLButtonElement>('[data-find="next"]')!;
  let matches: PdfMatch[] = [];
  let selected = -1;
  let generation = 0;
  let searching = false;
  let timer: ReturnType<typeof setTimeout>;

  function controls(message?: string) {
    previous.disabled = next.disabled = searching || !matches.length;
    count.textContent = message ?? (matches.length ? `${selected + 1} de ${matches.length}` : '');
  }

  async function select(index: number) {
    if (!matches.length || searching) return;
    selected = (index + matches.length) % matches.length;
    controls();
    const request = ++generation;
    const match = matches[selected];
    try {
      await options.view.setMatches(matches, selected);
      if (request !== generation) return;
      await options.navigate(match.page);
      if (request === generation) options.view.focusMatch();
    } catch {
      if (request === generation) controls('No se pudo mostrar la coincidencia');
    }
  }

  async function search() {
    clearTimeout(timer);
    const request = ++generation;
    searching = true;
    matches = [];
    selected = -1;
    controls(query.value.trim() ? 'Buscando…' : '');
    try {
      await options.view.setMatches([], -1);
      if (request !== generation) return;
      if (!query.value.trim()) {
        searching = false;
        controls();
        return;
      }
      const found = await options.reader.search(
        query.value,
        (page, total) => {
          if (request === generation) controls(`Buscando… ${page}/${total}`);
        },
        () => request !== generation,
      );
      if (request !== generation) return;
      matches = found;
      searching = false;
      if (!matches.length) {
        controls('Sin coincidencias');
        return;
      }
      const first = matches.findIndex((match) => match.page >= options.currentPage());
      await select(first < 0 ? 0 : first);
    } catch {
      if (request === generation) {
        searching = false;
        matches = [];
        controls('No se pudo buscar');
      }
    }
  }

  function close() {
    generation++;
    clearTimeout(timer);
    searching = false;
    matches = [];
    selected = -1;
    const focused = bar.contains(document.activeElement);
    bar.hidden = true;
    void options.view.setMatches([], -1).catch(() => {});
    if (focused)
      options.pane.querySelector<HTMLElement>('.canvas-scroll')?.focus({ preventScroll: true });
    controls();
  }

  function show() {
    if (!options.enabled()) return;
    bar.hidden = false;
    query.focus();
    query.select();
    void search();
  }

  query.addEventListener('input', () => {
    generation++;
    clearTimeout(timer);
    searching = true;
    matches = [];
    controls(query.value.trim() ? 'Buscando…' : '');
    void options.view.setMatches([], -1).catch(() => {});
    timer = setTimeout(() => void search(), 200);
  });
  query.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      if (searching) void search();
      else void select(selected + (event.shiftKey ? -1 : 1));
    }
  });
  bar.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close();
    }
  });
  previous.onclick = () => void select(selected - 1);
  next.onclick = () => void select(selected + 1);
  bar.querySelector<HTMLButtonElement>('[data-find="close"]')!.onclick = close;
  controls();
  return { show, close };
}
