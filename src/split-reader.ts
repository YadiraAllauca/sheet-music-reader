import { matches, title, type Score } from './library';
import { getFile } from './storage';
import { PdfReader } from './pdf';

export function createSplitReader(options: {
  scores: () => Score[];
  save: (score: Score) => Promise<void>;
  resized: () => void;
  icon: (name: string) => string;
  escape: (text: string) => string;
  drawIcons: () => void;
  toast: (message: string) => void;
}) {
  const { icon, escape } = options;
  const pane = document.createElement('section');
  pane.id = 'secondary-reader';
  pane.className = 'reader-pane';
  pane.setAttribute('aria-label', 'Segunda partitura');
  pane.hidden = true;
  pane.innerHTML = `
    <header class="secondary-header"><div class="reader-title"><strong id="secondary-title">Segunda partitura</strong><span id="secondary-folder">Busca el PDF que quieres abrir aquí</span></div>
      <button class="icon-button" data-secondary="search" aria-label="Buscar segunda partitura" title="Buscar segunda partitura">${icon('search')}</button>
      <button class="icon-button" data-secondary="close" aria-label="Cerrar división" title="Cerrar división">${icon('x')}</button></header>
    <div id="secondary-search" class="secondary-search"><label class="search-field">${icon('search')}<input type="search" id="secondary-query" placeholder="Nombre o carpeta…" aria-label="Buscar segunda partitura por nombre" /></label><div id="secondary-results"></div></div>
    <div class="canvas-scroll" id="secondary-scroll" tabindex="0" aria-label="Desplazamiento de la segunda partitura"><div id="secondary-status" role="status">Selecciona una partitura para abrirla en esta sección.</div><canvas id="secondary-canvas" aria-label="Página de la segunda partitura" hidden></canvas></div>
    <footer class="reader-controls"><div class="zoom-controls">
      <button class="icon-button" data-secondary="zoom-out" aria-label="Alejar segunda partitura">${icon('minus')}</button><span id="secondary-zoom">100%</span><button class="icon-button" data-secondary="zoom-in" aria-label="Acercar segunda partitura">${icon('plus')}</button><button class="icon-button" data-secondary="fit" aria-label="Ajustar segunda partitura al ancho">${icon('scan')}</button></div>
      <div class="page-controls"><button class="icon-button" data-secondary="previous" aria-label="Página anterior de segunda partitura">${icon('chevron-left')}</button><label>Página <input id="secondary-page" type="number" min="1" value="1" aria-label="Ir a página de segunda partitura" /> <span id="secondary-total">/ 0</span></label><button class="icon-button" data-secondary="next" aria-label="Página siguiente de segunda partitura">${icon('chevron-right')}</button></div></footer>`;
  document.querySelector('.reader-body')!.append(pane);
  const $ = <T extends HTMLElement = HTMLElement>(selector: string) =>
    pane.querySelector<T>(selector)!;
  const reader = new PdfReader();
  let current: Score | undefined;
  let page = 1;
  let zoom = 1;
  let generation = 0;
  let ready = false;
  let active = false;

  function search() {
    const value = $<HTMLInputElement>('#secondary-query').value;
    const found = options
      .scores()
      .filter((score) => matches(score, value))
      .sort((a, b) => a.name.localeCompare(b.name, 'es', { numeric: true }));
    $('#secondary-results').innerHTML = found.length
      ? found
          .map(
            (score) =>
              `<button class="quick-result" data-secondary-open="${escape(score.id)}">${icon('file-music')}<span><strong>${escape(title(score.name))}</strong><small>${escape(score.folder)}</small></span>${icon('arrow-up-right')}</button>`,
          )
          .join('')
      : '<p class="search-message">No encontramos partituras con ese nombre.</p>';
    options.drawIcons();
  }

  function controls() {
    $<HTMLButtonElement>('[data-secondary="previous"]').disabled = !ready || page <= 1;
    $<HTMLButtonElement>('[data-secondary="next"]').disabled = !ready || page >= reader.pages;
    $<HTMLInputElement>('#secondary-page').disabled = !ready;
    $<HTMLInputElement>('#secondary-page').value = String(page);
    $<HTMLInputElement>('#secondary-page').max = String(reader.pages || 1);
    $('#secondary-total').textContent = `/ ${reader.pages}`;
    $('#secondary-zoom').textContent = `${Math.round(zoom * 100)}%`;
  }

  async function save() {
    if (!current || !ready) return;
    const updated = { ...current, lastPage: page, lastOpened: Date.now() };
    await options
      .save(updated)
      .catch(() => options.toast('No se pudo guardar la página de la segunda partitura.'));
    if (current?.id === updated.id) current = updated;
  }

  async function render() {
    if (!ready || pane.hidden) return;
    const request = generation;
    controls();
    try {
      await reader.render(
        page,
        $('#secondary-canvas'),
        Math.max(100, $('#secondary-scroll').clientWidth - 40),
        zoom,
      );
      if (request !== generation || pane.hidden) return;
      $('#secondary-canvas').hidden = false;
      $('#secondary-status').hidden = true;
    } catch {
      if (request === generation) options.toast('No se pudo mostrar la segunda partitura.');
    }
  }

  async function open(id: string) {
    const score = options.scores().find((item) => item.id === id);
    if (!score) return;
    const request = ++generation;
    ready = false;
    current = score;
    page = score.lastPage;
    zoom = 1;
    $('#secondary-title').textContent = title(score.name);
    $('#secondary-folder').textContent = score.folder;
    $('#secondary-search').hidden = true;
    $('#secondary-status').textContent = 'Abriendo segunda partitura…';
    $('#secondary-status').hidden = false;
    $('#secondary-canvas').hidden = true;
    $('#secondary-scroll').scrollTop = 0;
    controls();
    try {
      await reader.close();
      if (request !== generation) return;
      const file = await getFile(id);
      if (request !== generation) return;
      if (!file) throw new Error('Archivo no disponible');
      if (!(await reader.open(file)) || request !== generation) return;
      ready = true;
      page = Math.max(1, Math.min(page, reader.pages));
      await render();
      if (request === generation) await save();
    } catch {
      if (request !== generation) return;
      ready = false;
      controls();
      $('#secondary-status').textContent =
        'No se pudo abrir este PDF. Usa Buscar segunda partitura para elegir otro.';
    }
  }

  async function goToPage(next: number) {
    if (!ready || !Number.isFinite(next)) return;
    page = Math.max(1, Math.min(Math.floor(next), reader.pages));
    $('#secondary-scroll').scrollTop = 0;
    await render();
    await save();
  }

  async function close() {
    generation++;
    ready = false;
    current = undefined;
    active = false;
    pane.hidden = true;
    document.querySelector('#reader')!.classList.remove('split');
    await reader.close();
    options.resized();
  }

  pane.addEventListener('pointerdown', () => {
    active = true;
  });
  pane.addEventListener('focusin', () => {
    active = true;
  });
  pane.addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button');
    if (!button || button.disabled) return;
    if (button.dataset.secondaryOpen) {
      void open(button.dataset.secondaryOpen);
      return;
    }
    switch (button.dataset.secondary) {
      case 'close':
        void close();
        break;
      case 'search':
        $('#secondary-search').hidden = !$('#secondary-search').hidden;
        if (!$('#secondary-search').hidden) {
          search();
          $('#secondary-query').focus();
        }
        break;
      case 'previous':
        void goToPage(page - 1);
        break;
      case 'next':
        void goToPage(page + 1);
        break;
      case 'zoom-in':
        zoom = Math.min(3, zoom + 0.25);
        void render();
        break;
      case 'zoom-out':
        zoom = Math.max(0.5, zoom - 0.25);
        void render();
        break;
      case 'fit':
        zoom = 1;
        void render();
        break;
    }
  });
  $('#secondary-query').oninput = search;
  $('#secondary-page').onchange = () =>
    void goToPage(Number($<HTMLInputElement>('#secondary-page').value));
  controls();

  return {
    render,
    close,
    hideSearch() {
      $('#secondary-search').hidden = true;
    },
    deactivate() {
      active = false;
    },
    key(event: KeyboardEvent) {
      if (!active || pane.hidden) return false;
      if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
        event.preventDefault();
        void goToPage(page + (event.key === 'ArrowRight' ? 1 : -1));
        return true;
      }
      return false;
    },
    showSearch() {
      pane.hidden = false;
      document.querySelector('#reader')!.classList.add('split');
      $('#secondary-search').hidden = false;
      $<HTMLInputElement>('#secondary-query').value = '';
      search();
      $('#secondary-query').focus();
      options.resized();
      void render();
    },
  };
}
