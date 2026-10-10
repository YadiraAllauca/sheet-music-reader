# User guide

[Back to README](../README.md)

Atril's interface is currently in Spanish. The labels below match the application.

## Open your scores

Choose **Abrir PDF** to select files from your device. One selected file opens directly; multiple files appear in the library. These selections last for the current session and must be made again after reloading.

For a reusable library, choose **Vincular carpeta → Vincular otra carpeta** and grant read access. Repeat to link additional folders. Atril preserves subfolder paths and can link an empty folder. It remembers folder handles rather than copying PDFs.

On browsers without persistent folder access, folder selection is available only for the session. Selecting individual PDFs remains an alternative.

## Refresh and manage folders

Linked folders load when Atril starts. To review subsequent file changes, choose **Actualizar carpetas**. There is no periodic refresh or background monitoring.

Use the **⋯** menu beside a linked folder in the sidebar:

- **Restablecer acceso:** renew permission when the browser reports a pending or unavailable connection.
- **Desvincular:** remove the folder link and its saved reading metadata. Original documents remain untouched.

A warning marker identifies folders with access problems. A failed scan keeps the existing entries rather than applying an incomplete snapshot.

File changes are detected by size and modification time. A detected change resets the saved page to page 1. If a PDF already open in the reader changes on disk, reopen it to display the new version.

## Find a score

Search any part of a filename or folder path, including punctuation. Matching ignores case and accents.

Use **Favoritas**, **Recientes**, folder navigation, sorting, and grid/list views to narrow the library. The panel button at the top left hides or shows the sidebar. Desktop visibility is remembered; on phones, selecting a folder or section closes the sidebar.

First-page previews load as cards approach the viewport. A sheet-shaped placeholder appears while loading or if a PDF cannot be read. Removing a linked score from the library hides it for the current session; it can return after reloading if it still exists in the folder.

## Read a PDF

Use the lower controls to zoom, fit the page to the pane's width, or choose a page number. **← / →** navigate pages. The background toggle changes the space surrounding the PDF; it does not recolor the document itself.

**PDF anterior / PDF siguiente** switch files without returning to the library. They follow the library order and filters captured when you enter the reader and stop at either end. Opening a result outside that selection through reader search starts a separate, single-file selection.

Choose **Buscar**:

- **Otra partitura:** find and open another score by filename or path.
- **En este PDF:** search embedded text and jump to a matching page. Image-only scans need OCR, which Atril does not include.

Favorites and the most recent reading page persist for linked files. Files selected individually keep this information only during the session.

## Compare two scores

1. Open a score and choose **Dividir y buscar**.
2. Search for the second score and select it.
3. Scroll, zoom, or turn pages independently in either pane.

Panes are side-by-side on larger screens and stacked on narrow screens. Click or focus a pane before using the arrow keys to select which PDF receives keyboard navigation.

Use **Buscar segunda partitura** to replace the second PDF. **Cerrar división** returns to one pane and keeps the first score open. The second pane has its own page and zoom controls; previous/next-file navigation belongs to the first reader.

![Two reader panes stacked on a phone](images/mobile-reader.png)

## Hide reader controls

Choose **Ocultar controles** to hide the upper and lower bars, including the second pane's controls. Both scores continue to scroll independently. Use the floating **Mostrar controles** button or **Esc** to restore the bars.

The fullscreen button uses the browser's fullscreen API when available. Fullscreen and hiding the application's controls are separate options.

## Install and use offline

Visit the deployed HTTPS site online once and wait for the offline-ready notification.

- **Android or desktop:** use **Instalar Atril** or the browser's app installation command when available.
- **iPhone/iPad:** in Safari, use Share → Add to Home Screen.

The cached application can then open local PDFs without an internet connection. Individually selected PDFs still require reselection after reloading. Linked folders require valid permissions. A file provider backed by cloud storage may need a connection even when the application itself is cached.

## Troubleshooting

| Symptom                                | Action                                                                                    |
| -------------------------------------- | ----------------------------------------------------------------------------------------- |
| A linked folder has a warning          | Open its ⋯ menu and choose **Restablecer acceso**. If needed, link it again.              |
| New or deleted files are not reflected | Choose **Actualizar carpetas**.                                                           |
| The reader shows an older version      | Refresh the library, then reopen the PDF.                                                 |
| Text search finds no matches in a scan | Use a PDF with embedded text; OCR is outside the current scope.                           |
| A PDF will not open                    | Check that it is a valid, unencrypted PDF and that the original file is still accessible. |
| Folder linking is unavailable          | Use session-only folder selection or individual files in that browser.                    |
