import {
  createIcons,
  ArrowLeft,
  ArrowUpRight,
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Clock3,
  RefreshCw,
  Eye,
  EyeOff,
  FileMusic,
  Files,
  Folder,
  FolderOpen,
  FolderPlus,
  Folders,
  HardDrive,
  GripVertical,
  LayoutGrid,
  Library,
  List,
  Link2Off,
  LockKeyhole,
  Maximize,
  Minus,
  MoreHorizontal,
  Moon,
  Music2,
  PanelLeft,
  Plus,
  Scan,
  Search,
  ShieldCheck,
  Smartphone,
  Star,
  Trash2,
  WifiOff,
  X,
} from 'lucide';
const icons = {
  ArrowLeft,
  ArrowUpRight,
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Clock3,
  RefreshCw,
  Eye,
  EyeOff,
  FileMusic,
  Files,
  Folder,
  FolderOpen,
  FolderPlus,
  Folders,
  HardDrive,
  GripVertical,
  LayoutGrid,
  Library,
  List,
  Link2Off,
  LockKeyhole,
  Maximize,
  Minus,
  MoreHorizontal,
  Moon,
  Music2,
  PanelLeft,
  Plus,
  Scan,
  Search,
  ShieldCheck,
  Smartphone,
  Star,
  Trash2,
  WifiOff,
  X,
};
import { attachQueueDrag, ReaderSequence } from './reader-queue';
import { registerSW } from 'virtual:pwa-register';
import {
  folderList,
  formatBytes,
  inFolder,
  isScorePath,
  matches,
  title,
  type Score,
} from './library';
import { loadLibraryState, saveLibraryState, moveReadingList } from './library-state';
import {
  applyFolderSnapshot,
  forgetFolder,
  getFile,
  getScores,
  removeScore,
  restoreLibrary,
  saveFile,
  updateScore,
} from './storage';
import {
  getLinkedFolders,
  linkFolder,
  unlinkFolder,
  scanFolder,
  type LinkedFolder,
  type LocalDirectoryHandle,
} from './linked-folders';
import { PdfReader } from './pdf';
import { createSplitReader } from './split-reader';
import { ContinuousReader } from './continuous-reader';
import { createPdfFind } from './pdf-find';
import { createThumbnails } from './thumbnails';
import { attachFileSwipe } from './file-swipe';
import { attachLongPressSelection } from './long-press-selection';
import './style.css';

const icon = (name: string, cls = '') =>
  `<i data-lucide="${name}" class="${cls}" aria-hidden="true"></i>`;
const escape = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
const $ = <T extends HTMLElement = HTMLElement>(selector: string) =>
  document.querySelector<T>(selector)!;
const drawIcons = () => createIcons({ icons, attrs: { 'stroke-width': 1.7 } });
let scores: Score[] = [];
const savedLibrary = loadLibraryState();
let folder = savedLibrary.folder;
let section = savedLibrary.section;
const expandedFolders = new Set(savedLibrary.expandedFolders);
let readingList = savedLibrary.readingList;
let query = '';
let order = savedLibrary.order;
let layout = localStorage.getItem('atril-layout') || 'grid';
let current: Score | undefined;
let readerQueue: string[] = [];
// Only a sequence started from the library queue writes its order back to it.
let sequenceFromReadingList = false;
let priorityQueue = savedLibrary.priorityQueue || [];
const readerSequence = new ReaderSequence();
let page = 1;
let zoom = 1;
let opening = 0;
let searchMode = 'library';
let selecting = false;
let linkedFolders: LinkedFolder[] = [];
const folderProblems = new Map<string, string>();
let syncing = false;
const reader = new PdfReader();
const thumbnails = createThumbnails(() => $('#reader').hidden === true);

$('#app').innerHTML = `
  <aside class="sidebar" id="sidebar">
    <a class="brand" href="/" aria-label="Atril, inicio"><img class="brand-mark" src="/icon.svg" width="48" height="48" alt=""/><span>Atril<span class="brand-caption">TU BIBLIOTECA DE PARTITURAS</span></span></a>
    <div class="nav-label">TU BIBLIOTECA</div>
    <nav aria-label="Biblioteca">
      <button class="nav-item active" data-section="all">${icon('library')}<span>Todas las partituras</span><span class="count" id="all-count">0</span></button>
      <button class="nav-item" data-section="recent">${icon('clock-3')}<span>Recientes</span></button>
      <button class="nav-item" data-section="favorites">${icon('star')}<span>Favoritas</span><span class="count" id="favorite-count">0</span></button>
      <button class="nav-item" data-section="reading-list">${icon('list')}<span>Cola de partituras</span><span class="count" id="reading-list-count">0</span></button>
    </nav>
    <div class="nav-label folder-heading">CARPETAS<button class="icon-button" data-action="import" aria-label="Vincular carpeta">${icon('folder-plus')}</button></div>
    <nav id="folders" aria-label="Carpetas"></nav>
    <div class="sidebar-bottom"><div class="privacy-note">${icon('shield-check')}<div><strong>Solo en tu dispositivo</strong><span>Tu música se queda contigo.</span></div></div><button id="install" class="install-button">${icon('smartphone')} Instalar Atril ${icon('arrow-up-right')}</button></div>
  </aside>
  <main class="main">
    <header class="topbar"><button class="icon-button sidebar-toggle" id="menu" aria-label="Mostrar barra lateral" aria-controls="sidebar" aria-expanded="false">${icon('panel-left')}</button><span class="breadcrumb">Mi biblioteca <span>/</span> <strong id="breadcrumb">Todas las partituras</strong></span><span class="local-badge"><span></span> Archivos locales</span></header>
    <section class="library-content">
      <div class="heading-row"><div><div class="eyebrow">UN ESPACIO PARA TU MÚSICA</div><h1 id="heading">Tu biblioteca</h1><p id="subtitle">Menos tiempo buscando. Más tiempo tocando.</p></div><div class="heading-actions"><button class="button primary" data-action="open-file">${icon('folder-open')} Abrir PDF</button><button class="button secondary" data-action="import">${icon('folder')} Vincular carpeta</button><button class="button secondary" id="refresh-folders">${icon('refresh-cw')} <span>Actualizar carpetas</span></button></div></div>
      <div class="stats"><div>${icon('files')}<span><strong id="stat-scores">0</strong> partituras</span></div><div>${icon('folders')}<span><strong id="stat-folders">0</strong> carpetas</span></div><div>${icon('hard-drive')}<span><strong id="stat-size">0 KB</strong> seleccionados</span></div><span class="offline-note">${icon('wifi-off')} Disponibles sin conexión</span></div>
      <div class="library-toolbar"><label class="search-field">${icon('search')}<input id="library-search" type="search" placeholder="Buscar por nombre o carpeta…" aria-label="Buscar partituras" autocomplete="off"/><kbd>/</kbd></label><select id="sort" aria-label="Ordenar partituras"><option value="name">Nombre: A → Z</option><option value="added">Últimas seleccionadas</option><option value="opened">Últimas abiertas</option></select><div class="view-switch"><button class="icon-button" id="grid-view" aria-label="Vista de tarjetas">${icon('layout-grid')}</button><button class="icon-button" id="list-view" aria-label="Vista de lista">${icon('list')}</button></div></div>
      <div class="reading-list-toolbar" id="reading-list-toolbar" hidden><div><strong id="reading-list-summary"></strong><span>Añade partituras y sigue tu orden de ensayo.</span></div><div class="reading-list-actions"><button class="button primary" id="start-reading-list">${icon('book-open')} Abrir cola</button><button class="button secondary" data-section="reading-list">${icon('list')} Ver cola</button><button class="icon-button" id="clear-reading-list" aria-label="Vaciar cola" title="Vaciar cola">${icon('x')}</button></div></div>
      <div class="results-label" id="results-label"></div><p class="touch-selection-hint" id="touch-selection-hint" hidden>Mantén pulsada una partitura para añadirla o quitarla de la cola.</p><div id="score-list"></div>
      <footer class="library-footer"><span>${icon('lock-keyhole')} Sin cuentas. Sin nube. A tu ritmo.</span><button class="text-button" id="help">Cómo funciona ${icon('arrow-up-right')}</button></footer>
    </section>
  </main>
  <dialog id="import-dialog" class="dialog"><form method="dialog"><button class="icon-button dialog-close" aria-label="Cerrar">${icon('x')}</button></form><span class="dialog-icon">${icon('folder-plus')}</span><h2>Abre desde tu dispositivo</h2><p>Importa una o varias carpetas de tu dispositivo. Guardaremos sus PDFs en esta app para leerlos sin volver a dar acceso. Pulsa Actualizar carpetas para sincronizar los cambios; el navegador puede pedir permiso en ese momento.</p><button class="button primary wide" id="pick-folder">${icon('folder-open')} Vincular otra carpeta</button><button class="button secondary wide" id="pick-files">${icon('files')} Seleccionar archivos PDF</button><small>Las copias ocupan espacio en este dispositivo y no se suben a internet. Si el navegador no admite carpetas vinculadas, podrás elegir PDFs para esta sesión.</small></dialog>
  <dialog id="help-dialog" class="dialog"><form method="dialog"><button class="icon-button dialog-close" aria-label="Cerrar">${icon('x')}</button></form><span class="dialog-icon">${icon('music-2')}</span><h2>Listo para tocar</h2><ol><li>Vincula tus carpetas o abre un PDF desde tu dispositivo.</li><li>Busca por cualquier parte del nombre o de la ruta, con o sin tildes. Despliega las subcarpetas con su flecha; recordaremos dónde estabas.</li><li>Añade a la cola los PDFs que quieras tocar. Usa Ver cola para organizarlos y Abrir cola para seguir ese orden.</li><li>Abre una partitura. Usa la lupa del lector para cambiar de PDF o buscar texto y saltar a una página.</li></ol><p>Para instalarla, usa «Instalar app» en el menú del navegador. En iPhone: Safari → Compartir → Añadir a pantalla de inicio.</p><small>La primera apertura requiere conexión. Las siguientes pueden ser sin internet. Los PDFs de carpetas vinculadas, favoritos y progreso se guardan en este dispositivo. Al abrir la app no se accede a las carpetas. Pulsa Actualizar carpetas para revisar archivos nuevos, modificados o eliminados y autoriza el acceso si se solicita. Los PDFs elegidos sueltos duran solo esta sesión.</small></dialog>
  <input type="file" id="folder-input" webkitdirectory multiple hidden />
  <input type="file" id="file-input" accept="application/pdf,.pdf" multiple hidden />
  <dialog id="delete-dialog" class="dialog"><h2>¿Quitar esta partitura?</h2><p>Se quitará de esta sesión. El archivo original seguirá en tu dispositivo.</p><div class="dialog-actions"><button class="button secondary" id="cancel-delete">Cancelar</button><button class="button danger" id="confirm-delete">Quitar partitura</button></div></dialog>
  <section id="reader" class="reader" aria-label="Lector de partituras" hidden>
    <header class="reader-header"><button id="close-reader" class="icon-button" aria-label="Volver a la biblioteca">${icon('arrow-left')}</button><div class="reader-title"><strong id="reader-title"></strong><span id="reader-folder"></span><span id="reader-queue-position" class="reader-queue-position" hidden></span></div><button id="previous-score" class="icon-button" aria-label="PDF anterior" title="PDF anterior">${icon('chevron-left')}</button><button id="next-score" class="icon-button" aria-label="PDF siguiente" title="PDF siguiente">${icon('chevron-right')}</button><button id="reader-search-toggle" class="button secondary" aria-label="Buscar">${icon('search')}<span>Buscar</span></button><button id="reader-queue-toggle" class="button secondary" aria-label="Ver cola" title="Ver cola">${icon('list')}<span>Cola</span></button><button id="split-search" class="button secondary" aria-label="Dividir y buscar" title="Dividir y buscar">${icon('panel-left')}<span>Dividir y buscar</span></button><button id="hide-reader-controls" class="icon-button" aria-label="Ocultar controles" title="Ocultar controles">${icon('eye-off')}</button><button id="reader-theme" class="icon-button" aria-label="Cambiar fondo del lector">${icon('moon')}</button><button id="fullscreen" class="icon-button" aria-label="Pantalla completa">${icon('maximize')}</button></header>
    <div class="reader-body"><div class="canvas-scroll" id="canvas-scroll"><div id="reader-status" role="status">Abriendo partitura…</div><canvas id="pdf-canvas" aria-label="Página de la partitura" hidden></canvas></div>
      <aside id="reader-search-panel" class="reader-search-panel" hidden><div class="panel-title"><h2 id="reader-panel-title">Encuentra tu música</h2><button class="icon-button" id="close-search" aria-label="Cerrar búsqueda">${icon('x')}</button></div><div class="search-tabs"><button data-mode="queue">Cola</button><button data-mode="library" class="active">Buscar PDFs</button><button data-mode="text">En este PDF</button></div><label class="search-field" id="reader-query-field">${icon('search')}<input id="reader-search" type="search" placeholder="Nombre o carpeta…" aria-label="Buscar desde el lector" autocomplete="off"/></label><p id="search-hint">Abre otra partitura, ponla como siguiente o añádela al final de tu cola.</p><div id="reader-results" aria-live="polite"></div></aside>
    </div>
    <footer class="reader-controls"><div class="zoom-controls"><button id="zoom-out" class="icon-button" aria-label="Alejar">${icon('minus')}</button><span id="zoom-label">100%</span><button id="zoom-in" class="icon-button" aria-label="Acercar">${icon('plus')}</button><button id="fit-page" class="icon-button" aria-label="Ajustar al ancho">${icon('scan')}</button></div><div class="page-controls"><button id="previous-page" class="icon-button" aria-label="Página anterior">${icon('chevron-left')}</button><label>Página <input id="page-input" type="number" min="1" value="1" aria-label="Ir a la página"/> <span id="page-total">/ 0</span></label><button id="next-page" class="icon-button" aria-label="Página siguiente">${icon('chevron-right')}</button></div><span class="reader-tip">← → para pasar página</span></footer>
    <button id="show-reader-controls" class="button reader-restore" aria-label="Mostrar controles" title="Mostrar controles (Esc)">${icon('eye')} Mostrar controles</button>
  </section>
  <div id="toast" role="status" hidden></div>
`;
const primaryPane = document.createElement('section');
primaryPane.className = 'reader-pane primary-reader';
primaryPane.setAttribute('aria-label', 'Primera partitura');
$('.reader-body').prepend(primaryPane);
primaryPane.append($('#canvas-scroll'), $('.reader-controls'));
const continuousReader = new ContinuousReader(
  reader,
  $('#canvas-scroll'),
  $('#pdf-canvas'),
  (next) => {
    page = next;
    updatePageControls();
    void remember().catch(() => toast('No se pudo guardar la última página.'));
  },
  () => toast('No se pudo mostrar esta página. Intenta abrir otra.'),
);
const pdfFind = createPdfFind({
  pane: primaryPane,
  reader,
  view: continuousReader,
  navigate: goToPage,
  currentPage: () => page,
  enabled: () => !$('#reader').hidden && reader.pages > 0,
});
$('#canvas-scroll').tabIndex = 0;
$('#canvas-scroll').setAttribute('aria-label', 'Desplazamiento de la primera partitura');
const splitReader = createSplitReader({
  scores: () => scores,
  save: async (score) => {
    await updateScore(score);
    scores = scores.map((item) => (item.id === score.id ? score : item));
  },
  resized: () => {
    void drawPage();
  },
  icon,
  escape,
  drawIcons,
  toast,
});
primaryPane.addEventListener('pointerdown', () => splitReader.deactivate());
primaryPane.addEventListener('focusin', () => splitReader.deactivate());
$('.reader-header').addEventListener('pointerdown', () => splitReader.deactivate());
$('.reader-header').addEventListener('focusin', () => splitReader.deactivate());
$('#split-search').onclick = () => {
  toggleSearch(false);
  splitReader.showSearch();
};
$<HTMLSelectElement>('#sort').value = order;
drawIcons();

let toastTimer: ReturnType<typeof setTimeout>;
function toast(message: string) {
  $('#toast').textContent = message;
  $('#toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    $('#toast').hidden = true;
  }, 5500);
}

function rememberLibrary() {
  saveLibraryState({
    folder,
    section,
    order,
    expandedFolders: [...expandedFolders],
    readingList,
    priorityQueue,
  });
}
function availableReadingList() {
  return readingList.filter((id) => scores.some((score) => score.id === id));
}
function chooseLibrary(nextSection: string, nextFolder = '') {
  section = nextSection;
  folder = nextFolder;
  query = '';
  $<HTMLInputElement>('#library-search').value = '';
  rememberLibrary();
  refresh();
  if (sidebarMedia.matches) {
    mobileSidebarOpen = false;
    applySidebar();
  }
}

function visibleScores() {
  const visible = scores.filter(
    (s) =>
      (!folder || inFolder(s, folder)) &&
      (section !== 'reading-list' || readingList.includes(s.id)) &&
      (section !== 'favorites' || s.favorite) &&
      (section !== 'recent' || s.lastOpened > 0) &&
      matches(s, query),
  );
  return visible.sort((a, b) =>
    section === 'reading-list'
      ? readingList.indexOf(a.id) - readingList.indexOf(b.id)
      : order === 'added'
        ? b.added - a.added
        : order === 'opened' || section === 'recent'
          ? b.lastOpened - a.lastOpened
          : a.name.localeCompare(b.name, 'es', { numeric: true }),
  );
}

function renderFolder(path: string, folders: string[]): string {
  const children = folders.filter(
    (item) => item.startsWith(`${path}/`) && !item.slice(path.length + 1).includes('/'),
  );
  const expanded = expandedFolders.has(path);
  const linked = linkedFolders.filter((item) => item.name === path);
  const actions = linked
    .map(
      (item) => `
    ${folderProblems.has(item.id) ? `<p class="folder-problem">${escape(folderProblems.get(item.id)!)}</p><button class="button folder-action reconnect" data-reconnect="${item.id}" aria-label="Restablecer acceso a ${escape(item.name)}">${icon('lock-keyhole')} Restablecer acceso</button>` : ''}
    <button class="button folder-action unlink" data-unlink="${item.id}" aria-label="Desvincular ${escape(item.name)}">${icon('link-2-off')} Desvincular</button>`,
    )
    .join('');
  return `<div class="folder-node" style="--depth:${Math.min(path.split('/').length - 1, 6)}"><div class="folder-row">
    ${children.length ? `<button class="icon-button folder-toggle" data-folder-toggle="${escape(path)}" aria-label="${expanded ? 'Ocultar' : 'Mostrar'} subcarpetas de ${escape(path)}" aria-expanded="${expanded}" aria-controls="folder-children-${encodeURIComponent(path)}">${icon(expanded ? 'chevron-down' : 'chevron-right')}</button>` : '<span class="folder-toggle-spacer"></span>'}
    <button class="nav-item folder-item ${folder === path ? 'active' : ''}" data-folder="${escape(path)}" style="--depth:${Math.min(path.split('/').length - 1, 4)}" title="${escape(path)}">${icon('folder')}<span>${escape(path.split('/').at(-1)!)}</span><span class="count">${scores.filter((score) => inFolder(score, path)).length}</span>${linked.some((item) => folderProblems.has(item.id)) ? '<span class="folder-warning" aria-label="Revisar acceso">!</span>' : ''}</button>
    ${linked.length ? `<details class="folder-options"><summary class="icon-button" aria-label="Opciones de carpeta ${escape(path)}" title="Opciones de carpeta ${escape(path)}">${icon('more-horizontal')}</summary><div class="folder-menu">${actions}</div></details>` : ''}
  </div>${children.length ? `<div class="folder-children" id="folder-children-${encodeURIComponent(path)}" ${expanded ? '' : 'hidden'}>${children.map((child) => renderFolder(child, folders)).join('')}</div>` : ''}</div>`;
}

function refresh() {
  const folders = [
    ...new Set([...folderList(scores), ...linkedFolders.map((linked) => linked.name)]),
  ].sort((a, b) => a.localeCompare(b, 'es', { numeric: true }));
  $<HTMLButtonElement>('#refresh-folders').disabled = syncing || !linkedFolders.length;
  $('#refresh-folders span').textContent = syncing ? 'Actualizando…' : 'Actualizar carpetas';
  const list = availableReadingList();
  $('#reading-list-count').textContent = String(list.length);
  $('#reading-list-toolbar').hidden = !list.length;
  $('#reading-list-summary').textContent =
    `${list.length} ${list.length === 1 ? 'partitura en tu cola' : 'partituras en tu cola'}`;
  $<HTMLSelectElement>('#sort').disabled = section === 'reading-list';
  $('#all-count').textContent = String(scores.length);
  $('#favorite-count').textContent = String(scores.filter((s) => s.favorite).length);
  $('#stat-scores').textContent = String(scores.length);
  $('#stat-folders').textContent = String(new Set(scores.map((s) => s.folder)).size);
  $('#stat-size').textContent = formatBytes(scores.reduce((sum, s) => sum + s.size, 0));
  $('#folders').innerHTML = folders.length
    ? folders
        .filter((path) => !path.includes('/'))
        .map((path) => renderFolder(path, folders))
        .join('')
    : '<p class="no-folders">Tus carpetas aparecerán aquí.</p>';
  document
    .querySelectorAll<HTMLElement>('[data-section]')
    .forEach((el) => el.classList.toggle('active', !folder && el.dataset.section === section));
  const heading = folder
    ? folder.split('/').at(-1)!
    : section === 'reading-list'
      ? 'Tu cola de partituras'
      : section === 'favorites'
        ? 'Tus favoritas'
        : section === 'recent'
          ? 'Abiertas recientemente'
          : 'Tu biblioteca';
  $('#heading').textContent = heading;
  $('#breadcrumb').textContent = folder || (section === 'all' ? 'Todas las partituras' : heading);
  $('#subtitle').textContent = folder
    ? folder
    : section === 'reading-list'
      ? 'El orden que eliges para tocar. Usa las flechas para mover cada partitura.'
      : 'Menos tiempo buscando. Más tiempo tocando.';
  const visible = visibleScores();
  $('#touch-selection-hint').hidden = !visible.length;
  $('#results-label').textContent =
    `${visible.length} ${visible.length === 1 ? 'partitura' : 'partituras'}${query ? ` para «${query}»` : ''}`;
  $('#grid-view').classList.toggle('selected', layout === 'grid');
  $('#list-view').classList.toggle('selected', layout === 'list');
  $('#score-list').className = visible.length ? `score-list ${layout}` : '';
  if (!visible.length) {
    $('#score-list').innerHTML =
      section === 'reading-list'
        ? `<div class="empty-search">${icon('list')}<h2>${query ? 'No hay coincidencias en tu cola' : 'Tu cola está vacía'}</h2><p>Marca la casilla Cola de las partituras que quieras tocar.</p><button class="button secondary" data-section="all">Elegir partituras</button></div>`
        : scores.length
          ? `<div class="empty-search">${icon('search')}<h2>No encontramos partituras</h2><p>Prueba otro nombre o revisa una carpeta diferente.</p></div>`
          : `<div class="empty-state"><div class="sheet-art"><span class="art-note">♪</span><div class="paper"><span>Andante</span><div class="staff">𝄞 <span>♩ ♫ ♩</span></div><div class="staff">𝄞 <span>♫ ♩ ♬</span></div><div class="staff">𝄞 <span>♩ ♫ ♩</span></div></div><span class="art-folder">${icon('folder-open')}</span></div><span class="eyebrow">TU PRIMERA PARTITURA TE ESPERA</span><h2>Dale un lugar a tu música</h2><p>Abre un PDF directamente desde tu dispositivo.<br>Vincula tus carpetas y pulsa Actualizar carpetas para ver los cambios.</p><button class="button primary" data-action="open-file">${icon('folder-open')} Abrir PDF</button><span class="empty-footnote">Tu biblioteca guardada en este dispositivo</span></div><div class="feature-row"><div>${icon('folders')}<strong>El orden que ya conoces</strong><p>Conserva tus carpetas y subcarpetas.</p></div><div>${icon('search')}<strong>Una búsqueda, tu partitura</strong><p>Encuentra cualquier parte del nombre.</p></div><div>${icon('book-open')}<strong>Que la música siga</strong><p>Busca y cambia de PDF desde el lector.</p></div></div>`;
  } else {
    $('#score-list').innerHTML = visible
      .map(
        (s) =>
          `<article class="score-card ${readingList.includes(s.id) ? 'in-reading-list' : ''}"><button class="score-open" data-open="${escape(s.id)}" aria-label="Abrir ${escape(title(s.name))}"><div class="score-preview" data-preview="${escape(s.id)}"><div class="score-preview-placeholder" aria-hidden="true"><div class="mini-sheet-title"></div><div class="mini-staff">𝄞 ♪ ♫</div><div class="mini-staff">♩ ♫ ♩</div><div class="mini-staff">♫ ♩ ♪</div></div>${s.lastOpened ? '<span class="resume-badge">Continuar leyendo</span>' : ''}</div><div class="score-info"><h2>${escape(title(s.name))}</h2><p>${icon('folder')} ${escape(s.folder)}</p><span>${formatBytes(s.size)}${s.lastOpened ? ` · Página ${s.lastPage}` : ''}</span></div></button><label class="score-select"><input type="checkbox" data-select-score="${escape(s.id)}" aria-label="Añadir ${escape(title(s.name))} a la cola" ${readingList.includes(s.id) ? 'checked' : ''}/><span>${readingList.includes(s.id) ? `${readingList.indexOf(s.id) + 1} · Cola` : 'Cola'}</span></label>${section === 'reading-list' ? `<div class="score-order"><button class="icon-button" data-move-score="${escape(s.id)}" data-direction="-1" aria-label="Subir ${escape(title(s.name))} en la cola" ${readingList.indexOf(s.id) === 0 ? 'disabled' : ''}>${icon('chevron-up')}</button><button class="icon-button" data-move-score="${escape(s.id)}" data-direction="1" aria-label="Bajar ${escape(title(s.name))} en la cola" ${readingList.indexOf(s.id) === readingList.length - 1 ? 'disabled' : ''}>${icon('chevron-down')}</button></div>` : ''}<div class="score-actions"><button class="icon-button ${s.favorite ? 'is-favorite' : ''}" data-favorite="${escape(s.id)}" aria-label="${s.favorite ? 'Quitar de' : 'Añadir a'} favoritas">${icon('star')}</button><button class="icon-button remove-button" data-remove="${escape(s.id)}" aria-label="Quitar ${escape(title(s.name))}">${icon('trash-2')}</button></div></article>`,
      )
      .join('');
  }
  drawIcons();
  thumbnails.refresh(scores);
}

async function selectFiles(
  files: Iterable<File> | AsyncIterable<{ file: File; path: string }>,
  openSingle = false,
) {
  if (selecting) return;
  selecting = true;
  if ($<HTMLDialogElement>('#import-dialog').open) $<HTMLDialogElement>('#import-dialog').close();
  let selectedCount = 0;
  let ignored = 0;
  let selectedId: string | undefined;
  try {
    for await (const item of files) {
      const file = item instanceof File ? item : item.file;
      const path = item instanceof File ? undefined : item.path;
      if (!isScorePath(path || file.webkitRelativePath || file.name)) {
        ignored++;
        continue;
      }
      const header = await file.slice(0, 1024).text();
      if (!header.includes('%PDF-')) {
        ignored++;
        continue;
      }
      const score = await saveFile(file, path);
      scores = [...scores.filter((s) => s.id !== score.id), score];
      selectedCount++;
      selectedId = score.id;
      toast(`Seleccionando… ${selectedCount} ${selectedCount === 1 ? 'partitura' : 'partituras'}`);
    }
    if (selectedCount) {
      folder = '';
      section = 'all';
      query = '';
      $<HTMLInputElement>('#library-search').value = '';
      rememberLibrary();
    }
    toast(
      selectedCount
        ? `${selectedCount} ${selectedCount === 1 ? 'partitura disponible' : 'partituras disponibles'} en esta sesión.${ignored ? ` ${ignored} archivos ocultos o no válidos omitidos.` : ''}`
        : 'No se encontraron archivos PDF válidos.',
    );
  } catch (error) {
    console.error(error);
    toast(
      `No pudimos leer todos los archivos. ${selectedCount} PDFs disponibles en esta sesión. Intenta de nuevo.`,
    );
  } finally {
    selecting = false;
    refresh();
  }
  if (openSingle && selectedCount === 1 && selectedId) await openScore(selectedId);
}

async function syncFolders(folders = linkedFolders) {
  if (syncing || selecting) return;
  syncing = true;
  $<HTMLButtonElement>('#refresh-folders').disabled = true;
  $('#refresh-folders span').textContent = 'Actualizando…';
  // Invoke every permission request in the button's user gesture, before awaiting.
  // Opening the app never requests access or scans the original folders.
  const permissions = folders.map((linked) =>
    linked.handle.requestPermission({ mode: 'read' }).catch(() => 'denied' as const),
  );
  try {
    for (const [index, linked] of folders.entries()) {
      try {
        if ((await permissions[index]) !== 'granted') {
          folderProblems.set(linked.id, 'Actualización pendiente: se necesita permiso');
          continue;
        }
        const entries = await scanFolder(linked);
        await applyFolderSnapshot(linked.id, entries);
        folderProblems.delete(linked.id);
      } catch (error) {
        folderProblems.set(
          linked.id,
          (error as Error).name === 'QuotaExceededError'
            ? 'Sin espacio para actualizar. Se conserva la copia anterior.'
            : 'No se pudo actualizar. Se conserva la copia anterior.',
        );
      }
    }
    if (folderProblems.size)
      toast('Algunas carpetas no se actualizaron. Puedes seguir leyendo las copias guardadas.');
    scores = await getScores();
    readingList = availableReadingList();
    rememberLibrary();
    if (!$('#reader-search-panel').hidden && searchMode === 'library') void runReaderSearch();
  } finally {
    syncing = false;
    refresh();
  }
}

$('#pick-folder').onclick = async () => {
  const picker = (
    window as unknown as {
      showDirectoryPicker?: (options: { mode: 'read' }) => Promise<LocalDirectoryHandle>;
    }
  ).showDirectoryPicker;
  if (!picker) {
    toast(
      'Este navegador permite seleccionar carpetas para esta sesión, pero no vincularlas. Prueba Chrome actualizado.',
    );
    $('#folder-input').click();
    return;
  }
  try {
    const handle = await picker.call(window, { mode: 'read' });
    const linked = await linkFolder(handle);
    linkedFolders = await getLinkedFolders();
    ($('#import-dialog') as HTMLDialogElement).close();
    await syncFolders([linked]);
    if (!folderProblems.has(linked.id))
      toast('Carpeta importada. Pulsa Actualizar carpetas cuando cambien sus archivos.');
  } catch (error) {
    if ((error as Error).name !== 'AbortError')
      toast('No se pudo vincular la carpeta. Revisa el permiso y vuelve a intentar.');
  }
};
$('#refresh-folders').onclick = () => void syncFolders();

$('#pick-files').onclick = () => $('#file-input').click();
for (const selector of ['#folder-input', '#file-input']) {
  $<HTMLInputElement>(selector).onchange = () => {
    const input = $<HTMLInputElement>(selector);
    const files = [...(input.files || [])];
    input.value = '';
    if (files.length) {
      ($('#import-dialog') as HTMLDialogElement).close();
      void selectFiles(files, selector === '#file-input');
    }
  };
}

document.addEventListener('click', (event) => {
  const target = (event.target as HTMLElement).closest<HTMLElement>('button');
  if (!target) return;
  if (target.dataset.action === 'open-file') {
    if (selecting) {
      toast('Hay una selección en curso.');
      return;
    }
    $('#file-input').click();
  }
  if (target.dataset.action === 'import') {
    if (selecting) {
      toast('Hay una selección en curso.');
      return;
    }
    ($('#import-dialog') as HTMLDialogElement).showModal();
  }
  if (target.dataset.section) chooseLibrary(target.dataset.section);
  if (target.dataset.folderToggle) {
    const path = target.dataset.folderToggle;
    if (expandedFolders.has(path)) expandedFolders.delete(path);
    else expandedFolders.add(path);
    const expanded = expandedFolders.has(path);
    document.getElementById(target.getAttribute('aria-controls')!)!.hidden = !expanded;
    target.setAttribute('aria-expanded', String(expanded));
    target.setAttribute('aria-label', `${expanded ? 'Ocultar' : 'Mostrar'} subcarpetas de ${path}`);
    target.innerHTML = icon(expanded ? 'chevron-down' : 'chevron-right');
    rememberLibrary();
    drawIcons();
  }
  if (target.dataset.folder) chooseLibrary('all', target.dataset.folder);
  if (target.dataset.queueScore && current) {
    const id = target.dataset.queueScore;
    if (!scores.some((score) => score.id === id)) return;
    const position = target.dataset.queuePosition === 'next' ? 'next' : 'last';
    readerSequence.enqueue(id, position);
    saveReaderQueue();
    toast(
      position === 'next' ? 'Partitura preparada como siguiente.' : 'Partitura añadida a la cola.',
    );
  }
  if (target.dataset.moveScore) {
    readingList = moveReadingList(
      readingList,
      target.dataset.moveScore,
      Number(target.dataset.direction),
    );
    rememberLibrary();
    refresh();
  }
  if (target.dataset.queueRemove && current) {
    const entry = readerSequence.entries.find((item) => item.key === target.dataset.queueRemove);
    if (entry) {
      readerSequence.remove(entry.key);
      saveReaderQueue(!entry.queued);
    }
  }
  if (target.id === 'clear-upcoming' && current) {
    readerSequence.clearPriority();
    saveReaderQueue();
  }
  if (target.dataset.addToQueue) {
    $<HTMLInputElement>('#reader-search').value = '';
    setReaderMode('library');
    $('#reader-search').focus();
  }
  if (target.dataset.reconnect) {
    const linked = linkedFolders.find((item) => item.id === target.dataset.reconnect);
    if (linked)
      void linked.handle
        .requestPermission({ mode: 'read' })
        .then((permission) =>
          permission === 'granted'
            ? syncFolders([linked])
            : toast('No se concedió acceso a la carpeta.'),
        )
        .catch(() => toast('No se pudo restablecer el acceso. Vuelve a vincular la carpeta.'));
  }
  if (target.dataset.unlink) {
    const id = target.dataset.unlink;
    if (syncing) {
      toast('Espera a que termine la actualización.');
      return;
    }
    void unlinkFolder(id)
      .then(async () => {
        forgetFolder(id);
        linkedFolders = linkedFolders.filter((item) => item.id !== id);
        folderProblems.delete(id);
        scores = await getScores();
        readingList = availableReadingList();
        rememberLibrary();
        refresh();
        toast('Carpeta desvinculada. Sus archivos originales siguen en tu dispositivo.');
      })
      .catch(() => toast('No se pudo desvincular la carpeta.'));
  }
  if (target.dataset.open) void openScore(target.dataset.open, undefined, target.dataset.queueOpen);
  if (target.dataset.favorite) {
    const score = scores.find((s) => s.id === target.dataset.favorite)!;
    const updated = { ...score, favorite: !score.favorite };
    void updateScore(updated)
      .then(() => {
        scores = scores.map((s) => (s.id === updated.id ? updated : s));
        refresh();
      })
      .catch(() => toast('No se pudo guardar el cambio.'));
  }
  if (target.dataset.remove) {
    const id = target.dataset.remove;
    ($('#delete-dialog') as HTMLDialogElement).showModal();
    $('#confirm-delete').onclick = async () => {
      try {
        await removeScore(id);
        scores = scores.filter((s) => s.id !== id);
        readingList = availableReadingList();
        rememberLibrary();
        refresh();
        ($('#delete-dialog') as HTMLDialogElement).close();
        toast('Partitura retirada de tu biblioteca.');
      } catch {
        toast('No se pudo quitar la partitura. Intenta de nuevo.');
      }
    };
  }
});
document.addEventListener('change', (event) => {
  const input = event.target as HTMLInputElement;
  const id = input.dataset.selectScore;
  if (!id) return;
  selectReadingScore(id, input.checked);
});
function selectReadingScore(id: string, selected: boolean) {
  readingList = readingList.filter((item) => item !== id);
  if (selected) readingList.push(id);
  rememberLibrary();
  refresh();
}
attachLongPressSelection($('#score-list'), (id) => {
  selectReadingScore(id, !readingList.includes(id));
});
$('#clear-reading-list').onclick = () => {
  readingList = [];
  rememberLibrary();
  refresh();
};
$('#start-reading-list').onclick = () => {
  const list = availableReadingList();
  if (list.length) void openScore(list[0], list);
};
$('#cancel-delete').onclick = () => ($('#delete-dialog') as HTMLDialogElement).close();
const sidebarMedia = window.matchMedia('(max-width: 650px)');
let desktopSidebarOpen = localStorage.getItem('atril-sidebar') !== 'hidden';
let mobileSidebarOpen = false;
function applySidebar() {
  const visible = sidebarMedia.matches ? mobileSidebarOpen : desktopSidebarOpen;
  $('.sidebar').hidden = !visible;
  $('.sidebar').inert = !visible || !$('#reader').hidden;
  $('.sidebar').classList.toggle('mobile-open', sidebarMedia.matches && visible);
  $('#app').classList.toggle('sidebar-collapsed', !visible);
  $('#menu').setAttribute('aria-expanded', String(visible));
  const label = visible ? 'Ocultar barra lateral' : 'Mostrar barra lateral';
  $('#menu').setAttribute('aria-label', label);
  $('#menu').title = label;
}
$('#menu').onclick = () => {
  if (sidebarMedia.matches) mobileSidebarOpen = !mobileSidebarOpen;
  else {
    desktopSidebarOpen = !desktopSidebarOpen;
    localStorage.setItem('atril-sidebar', desktopSidebarOpen ? 'visible' : 'hidden');
  }
  applySidebar();
};
sidebarMedia.addEventListener('change', () => {
  mobileSidebarOpen = false;
  applySidebar();
});
applySidebar();
$('#help').onclick = () => ($('#help-dialog') as HTMLDialogElement).showModal();
$('#library-search').oninput = () => {
  query = $<HTMLInputElement>('#library-search').value;
  refresh();
};
$('#sort').onchange = () => {
  order = $<HTMLSelectElement>('#sort').value;
  rememberLibrary();
  refresh();
};
for (const view of ['grid', 'list'])
  $('#' + view + '-view').onclick = () => {
    layout = view;
    localStorage.setItem('atril-layout', view);
    refresh();
  };

async function openScore(id: string, queue?: string[], entryKey?: string) {
  const score = scores.find((s) => s.id === id);
  if (!score) return;
  if (queue || $('#reader').hidden || !readerQueue.includes(id)) {
    const fromReadingList = !!queue || readingList.includes(id);
    const normal =
      queue || (fromReadingList ? availableReadingList() : visibleScores().map((item) => item.id));
    sequenceFromReadingList = fromReadingList && normal.includes(id);
    readerSequence.start(
      normal.includes(id) ? normal : [id],
      id,
      priorityQueue.filter((item) => scores.some((score) => score.id === item)),
    );
  } else {
    readerSequence.select(
      id,
      entryKey || (readerSequence.current?.id === id ? readerSequence.current.key : undefined),
    );
  }
  readerQueue = readerSequence.entries.map((entry) => entry.id);
  priorityQueue = readerSequence.pending;
  rememberLibrary();
  updateReaderQueueControls();
  $('#canvas-scroll').scrollTop = 0;
  const request = ++opening;
  pdfFind.close();
  continuousReader.reset();
  current = score;
  page = score.lastPage;
  zoom = 1;
  $('#reader').hidden = false;
  $('.main').inert = true;
  $('.sidebar').inert = true;
  document.body.classList.add('reading');
  $('#reader-title').textContent = title(score.name);
  $('#reader-folder').textContent = score.folder;
  $('#reader-status').textContent = 'Abriendo partitura…';
  $('#reader-status').hidden = false;
  $('#pdf-canvas').hidden = true;
  $('#page-total').textContent = '/ …';
  try {
    await reader.close();
    if (request !== opening) return;
    const blob = await getFile(id);
    if (request !== opening) return;
    if (!blob) throw new Error('Archivo no disponible');
    const opened = await reader.open(blob);
    if (!opened || request !== opening) return;
    page = Math.min(Math.max(page, 1), reader.pages);
    await drawPage();
    if (request !== opening) return;
    await remember().catch(() => toast('No se pudo guardar la última página.'));
    if (!$('#reader-search-panel').hidden) void runReaderSearch();
  } catch (error) {
    if (request !== opening) return;
    console.error(error);
    $('#reader-status').textContent =
      'No se pudo abrir este PDF. Puede estar dañado o protegido con contraseña. Puedes buscar otra partitura o volver a seleccionarlo.';
    $('#reader-status').hidden = false;
  }
}

function updateReaderQueueControls() {
  const index = readerSequence.position;
  $('#reader-queue-position').hidden = readerQueue.length < 2;
  $('#reader-queue-position').textContent = `${index + 1} / ${readerQueue.length}`;
  $<HTMLButtonElement>('#previous-score').disabled = index <= 0;
  $<HTMLButtonElement>('#next-score').disabled = index >= readerQueue.length - 1;
}

function goToScore(direction: number) {
  if (!current) return;
  const entry = readerSequence.entries[readerSequence.position + direction];
  if (entry) void openScore(entry.id, undefined, entry.key);
}

function saveReaderQueue(persistNormal = false) {
  const currentKey = readerSequence.current?.key;
  readerSequence.entries = readerSequence.entries.filter((entry) =>
    scores.some((score) => score.id === entry.id),
  );
  readerSequence.position = Math.max(
    0,
    readerSequence.entries.findIndex((entry) => entry.key === currentKey),
  );
  readerQueue = readerSequence.entries.map((entry) => entry.id);
  priorityQueue = readerSequence.pending;
  if (persistNormal && sequenceFromReadingList)
    readingList = readerSequence.entries.filter((entry) => !entry.queued).map((entry) => entry.id);
  rememberLibrary();
  refresh();
  updateReaderQueueControls();
  void runReaderSearch();
}

attachQueueDrag($('#reader-results'), (key, target) => {
  if (!current) return;
  const entry = readerSequence.entries.find((item) => item.key === key);
  readerSequence.reorder(key, target);
  saveReaderQueue(entry ? !entry.queued : false);
});

function renderReaderQueue() {
  const upcoming = readerSequence.entries
    .slice(readerSequence.position + 1)
    .filter((entry) => scores.some((score) => score.id === entry.id));
  const rows = (queued: boolean) =>
    upcoming
      .filter((entry) => entry.queued === queued)
      .map((entry, position) => {
        const score = scores.find((item) => item.id === entry.id)!;
        return `<div class="queue-item" data-queue-item="${entry.key}"><button class="icon-button queue-drag" data-queue-drag="${entry.key}" aria-label="Reordenar ${escape(title(score.name))}" title="Arrastra o usa las flechas arriba y abajo">${icon('grip-vertical')}</button><button class="queue-score" data-open="${escape(entry.id)}" data-queue-open="${entry.key}" aria-label="Abrir ${escape(title(score.name))} desde la cola"><span class="queue-number">${position + 1}</span><span><strong>${escape(title(score.name))}</strong><small>${escape(score.folder)}</small></span></button><button class="icon-button" data-queue-remove="${entry.key}" aria-label="Quitar ${escape(title(score.name))} de la cola" title="Quitar de la cola">${icon('x')}</button></div>`;
      })
      .join('');
  const manual = rows(true);
  const normal = rows(false);
  $('#reader-results').innerHTML =
    `${current ? `<h3 class="queue-section-title">Ahora</h3><div class="queue-now">${icon('file-music')}<div><strong>${escape(title(current.name))}</strong><small>${escape(current.folder)}</small></div><span>Leyendo</span></div>` : ''}<div class="queue-heading"><h3 class="queue-section-title">Añadidas a la cola <span>${priorityQueue.length}</span></h3><button class="text-button" id="clear-upcoming" ${priorityQueue.length ? '' : 'disabled'}>Vaciar</button></div><div class="queue-items queue-priority">${manual || '<p class="search-message">Añade una partitura para leerla antes de continuar con la secuencia original.</p>'}</div><button class="button primary wide" data-add-to-queue="true">${icon('plus')} Agregar partituras</button><h3 class="queue-section-title">Secuencia original</h3><div class="queue-items queue-normal">${normal || '<p class="search-message">Has llegado al final de esta secuencia.</p>'}</div>`;
  drawIcons();
}
$('#previous-score').onclick = () => goToScore(-1);
$('#next-score').onclick = () => goToScore(1);
attachFileSwipe(
  $('#canvas-scroll'),
  goToScore,
  () => !!current && !$('#reader').hidden && !$('#pdf-canvas').hidden,
);

async function remember() {
  if (!current) return;
  const updated = {
    ...(scores.find((s) => s.id === current!.id) || current),
    lastPage: page,
    lastOpened: Date.now(),
  };
  await updateScore(updated);
  scores = scores.map((s) => (s.id === updated.id ? updated : s));
  if (current?.id === updated.id) current = updated;
}

function updatePageControls() {
  $<HTMLInputElement>('#page-input').value = String(page);
  $<HTMLInputElement>('#page-input').max = String(reader.pages);
  $('#page-total').textContent = `/ ${reader.pages}`;
  $<HTMLButtonElement>('#previous-page').disabled = page <= 1;
  $<HTMLButtonElement>('#next-page').disabled = page >= reader.pages;
  $('#zoom-label').textContent = `${Math.round(zoom * 100)}%`;
}

async function drawPage(navigate = false) {
  if (!reader.pages || $('#reader').hidden) return;
  const request = opening;
  updatePageControls();
  try {
    $('#reader-status').hidden = true;
    await continuousReader.render(
      page,
      Math.max(100, $('#canvas-scroll').clientWidth - 40),
      zoom,
      navigate,
    );
    if (request !== opening) return;
    $('#pdf-canvas').hidden = false;
    $('#reader-status').hidden = true;
  } catch {
    toast('No se pudo mostrar esta página. Intenta abrir otra.');
  }
}

async function goToPage(next: number) {
  if (!reader.pages || !Number.isFinite(next)) return;
  page = Math.min(reader.pages, Math.max(1, Math.floor(next)));
  await drawPage(true);
  await remember().catch(() => toast('No se pudo guardar la última página.'));
}
$('#previous-page').onclick = () => void goToPage(page - 1);
$('#next-page').onclick = () => void goToPage(page + 1);
$('#page-input').onchange = () => void goToPage(Number($<HTMLInputElement>('#page-input').value));
$('#zoom-in').onclick = () => {
  zoom = Math.min(3, zoom + 0.25);
  void drawPage();
};
$('#zoom-out').onclick = () => {
  zoom = Math.max(0.5, zoom - 0.25);
  void drawPage();
};
$('#fit-page').onclick = () => {
  zoom = 1;
  void drawPage();
};
function setReaderFocus(focus: boolean) {
  $('#reader').classList.toggle('focus-mode', focus);
  if (focus) {
    toggleSearch(false);
    splitReader.hideSearch();
    $('#show-reader-controls').focus();
  } else $('#hide-reader-controls').focus();
  requestAnimationFrame(() => {
    void drawPage();
    void splitReader.render();
  });
}
$('#hide-reader-controls').onclick = () => setReaderFocus(true);
$('#show-reader-controls').onclick = () => setReaderFocus(false);
$('#reader-theme').onclick = () => $('#reader').classList.toggle('dark');
$('#fullscreen').onclick = async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await $('#reader').requestFullscreen();
  } catch {
    toast('La pantalla completa no está disponible en este navegador.');
  }
};
$('#close-reader').onclick = async () => {
  opening++;
  pdfFind.close();
  continuousReader.reset();
  current = undefined;
  $('#reader').classList.remove('focus-mode');
  await splitReader.close();
  if (document.fullscreenElement) await document.exitFullscreen().catch(() => {});
  await reader.close();
  $('#reader').hidden = true;
  $('.main').inert = false;
  applySidebar();
  document.body.classList.remove('reading');
  refresh();
};

function toggleSearch(show: boolean) {
  $('#reader-search-panel').hidden = !show;
  $('#reader-search-toggle').classList.toggle('selected', show && searchMode !== 'queue');
  $('#reader-queue-toggle').classList.toggle('selected', show && searchMode === 'queue');
  $('#reader-queue-toggle').setAttribute('aria-expanded', String(show && searchMode === 'queue'));
  if (show) {
    if (searchMode !== 'queue') $('#reader-search').focus();
    void runReaderSearch();
  }
  void drawPage();
}
$('#reader-search-toggle').onclick = () => {
  const show = !!$('#reader-search-panel').hidden || searchMode === 'queue';
  if (show) setReaderMode('library');
  toggleSearch(show);
};
$('#reader-queue-toggle').onclick = () => {
  const show = !!$('#reader-search-panel').hidden || searchMode !== 'queue';
  setReaderMode('queue');
  toggleSearch(show);
};
$('#close-search').onclick = () => toggleSearch(false);
function setReaderMode(mode: string) {
  if (mode === 'text') {
    toggleSearch(false);
    pdfFind.show();
    return;
  }
  pdfFind.close();
  searchMode = mode;
  document
    .querySelectorAll<HTMLElement>('[data-mode]')
    .forEach((button) => button.classList.toggle('active', button.dataset.mode === mode));
  $('#reader-panel-title').textContent = mode === 'queue' ? 'Tu cola' : 'Encuentra tu música';
  $('#reader-query-field').hidden = mode === 'queue';
  $<HTMLInputElement>('#reader-search').placeholder = 'Nombre o carpeta…';
  $('#search-hint').textContent =
    mode === 'queue'
      ? 'Arrastra las líneas para ordenar. La × quita una partitura de la cola.'
      : 'Pulsa + para añadir a la cola. Abre las opciones para poner una partitura como siguiente.';
  void runReaderSearch();
}
document.querySelectorAll<HTMLElement>('[data-mode]').forEach((button) => {
  button.onclick = () => setReaderMode(button.dataset.mode!);
});
let searchTimer: ReturnType<typeof setTimeout>;
$('#reader-search').oninput = () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => void runReaderSearch(), 0);
};
async function runReaderSearch() {
  const value = $<HTMLInputElement>('#reader-search').value;
  const container = $('#reader-results');
  if (searchMode === 'queue') {
    renderReaderQueue();
    return;
  }
  if (searchMode === 'library') {
    const found = scores
      .filter((s) => matches(s, value))
      .sort((a, b) => a.name.localeCompare(b.name, 'es', { numeric: true }));
    container.innerHTML = found.length
      ? found
          .map((s) => {
            const isCurrent = current?.id === s.id;
            const inList = priorityQueue.includes(s.id);
            const isNext = !!current && readerQueue[readerSequence.position + 1] === s.id;
            const status = isCurrent ? 'Leyendo' : isNext ? 'Siguiente' : inList ? 'En cola' : '';
            return `<div class="reader-result"><div class="reader-result-row"><button class="quick-result ${isCurrent ? 'current' : ''}" data-open="${escape(s.id)}">${icon('file-music')}<span><strong>${escape(title(s.name))}</strong><small>${escape(s.folder)}${status ? ` · ${status}` : ''}</small></span>${isCurrent ? icon('check') : ''}</button>${isCurrent ? '' : `<button class="icon-button queue-add ${inList ? 'is-queued' : ''}" data-queue-score="${escape(s.id)}" data-queue-position="last" aria-label="Añadir ${escape(title(s.name))} al final de la cola" title="${inList ? 'Ya está en la cola' : 'Añadir a la cola'}" ${inList ? 'disabled' : ''}>${icon(inList ? 'check' : 'plus')}</button><details class="reader-result-menu"><summary class="icon-button" aria-label="Opciones de ${escape(title(s.name))}">${icon('more-horizontal')}</summary><div><button class="button secondary" data-queue-score="${escape(s.id)}" data-queue-position="next" aria-label="Poner ${escape(title(s.name))} como siguiente" ${isNext && inList ? 'disabled' : ''}>${icon('chevron-right')} Poner siguiente</button></div></details>`}</div></div>`;
          })
          .join('')
      : '<p class="search-message">No encontramos partituras con ese nombre.</p>';
    drawIcons();
    return;
  }
}

let resizeTimer: ReturnType<typeof setTimeout>;
function scheduleReaderResize() {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    void drawPage();
    void splitReader.render();
  }, 150);
}
window.addEventListener('resize', scheduleReaderResize);
window.visualViewport?.addEventListener('resize', scheduleReaderResize);
document.addEventListener('keydown', (event) => {
  if (
    (event.ctrlKey || event.metaKey) &&
    event.key.toLowerCase() === 'f' &&
    current &&
    !$('#reader').hidden &&
    !document.querySelector('dialog[open]')
  ) {
    event.preventDefault();
    toggleSearch(false);
    pdfFind.show();
    return;
  }
  const typing = (event.target as HTMLElement).matches('input, textarea, select');
  if (event.key === 'Escape' && current && $('#reader').classList.contains('focus-mode')) {
    event.preventDefault();
    setReaderFocus(false);
    return;
  }
  if (event.key === '/' && !typing) {
    event.preventDefault();
    if (current) {
      setReaderMode('library');
      toggleSearch(true);
    } else $('#library-search').focus();
  }
  if (event.key === 'Escape' && current && !$('#reader-search-panel').hidden) toggleSearch(false);
  if (typing || !current || document.querySelector('dialog[open]')) return;
  if (splitReader.key(event)) return;
  if (event.key === 'ArrowRight') {
    event.preventDefault();
    void goToPage(page + 1);
  }
  if (event.key === 'ArrowLeft') {
    event.preventDefault();
    void goToPage(page - 1);
  }
});

interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: string }>;
}
let installPrompt: InstallPrompt | undefined;
window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  installPrompt = event as InstallPrompt;
});
$('#install').onclick = async () => {
  if (installPrompt) {
    await installPrompt.prompt();
    await installPrompt.userChoice;
    installPrompt = undefined;
  } else ($('#help-dialog') as HTMLDialogElement).showModal();
};
window.addEventListener('appinstalled', () => {
  $('#install').hidden = true;
  toast('Atril está instalada. ¡A tocar!');
});
if (window.matchMedia('(display-mode: standalone)').matches) $('#install').hidden = true;
registerSW({
  onOfflineReady: () => toast('Atril ya está lista para abrir sin conexión.'),
  onRegisterError: () =>
    toast('No se pudo preparar el modo sin conexión. Vuelve a abrir Atril con internet.'),
});

restoreLibrary()
  .then(async () => {
    scores = await getScores();
    linkedFolders = await getLinkedFolders();
    readingList = availableReadingList();
    const folders = new Set([...folderList(scores), ...linkedFolders.map((item) => item.name)]);
    if (folder && !folders.has(folder)) {
      folder = '';
      section = 'all';
    }
    rememberLibrary();
    refresh();
  })
  .catch(() => {
    refresh();
    toast('No se pudo iniciar la sesión. Recarga la app para intentar de nuevo.');
  });
