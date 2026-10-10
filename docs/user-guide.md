# User guide

[Back to README](../README.md)

Atril's interface is currently in Spanish. The labels below match the application.

## Open your scores

Choose **Abrir PDF** to select files from your device. One selected file opens directly; multiple files appear in the library. These selections last for the current session and must be made again after reloading.

For a reusable library, choose **Vincular carpeta → Vincular otra carpeta** and grant read access. Repeat to link additional folders. Atril preserves subfolder paths and can link an empty folder. It saves local PDF copies, folder references, favorites, and reading progress. PDF copies stay on this device and are not uploaded.

Hidden entries (including Android `.trashed…` and `.pending…` files), dot directories, macOS `__MACOSX` metadata, `$RECYCLE.BIN`, and `~$` temporary entries are excluded. Previously imported hidden files are also hidden from the library; refreshing removes their saved copies.

On browsers without persistent folder access, folder selection is available only for the session. Selecting individual PDFs remains an alternative.

## Refresh and manage folders

When Atril starts, it restores the last imported PDFs without accessing their original folders or asking for permission. To review file changes, choose **Actualizar carpetas** and grant access if the browser requests it. There is no periodic refresh or background monitoring.

If you used an earlier version, refresh each linked folder once to save its first PDF copies.

Use the **⋯** menu beside a linked folder in the sidebar:

- **Restablecer acceso:** renew permission when the browser reports a pending or unavailable connection.
- **Desvincular:** remove the folder link, its saved PDF copies, and reading metadata. Original documents remain untouched.

A warning marker identifies folders whose last update failed or lacked permission. Canceling permission, a failed read, or insufficient storage leaves the previous import readable. A warning does not prevent reading saved PDFs.

File changes are detected by size and modification time. A detected change resets the saved page to page 1. If a PDF already open in the reader changes on disk, reopen it to display the new version.

## Find a score

Search any part of a filename or folder path, including punctuation. Matching ignores case and accents.

Use **Favoritas**, **Recientes**, folder navigation, sorting, and grid/list views to narrow the library. The panel button at the top left hides or shows the sidebar. Desktop visibility is remembered; on phones, selecting a folder or section closes the sidebar.

Use the chevron beside a folder to show or hide its subfolders. Clicking the folder name selects its PDFs, including descendants. Each branch keeps its own expansion state. Atril remembers the last folder or section and the sort preference; reopening it renders only that selection instead of all scores. Search text is cleared when changing location and is not restored between visits. If the saved folder is no longer available, startup returns to the full library.

First-page previews load as cards approach the viewport. A sheet-shaped placeholder appears while loading or if a PDF cannot be read. Removing a linked score from the library hides it for the current session; it returns after reloading if its copy is still imported. Refreshing removes its saved copy if it was deleted from the original folder.

## Build an ordered reading list

1. Check **Lista** on each PDF card or row in the order you want to play. On touch screens, hold the PDF preview or title for about half a second to add or remove it; a short tap still opens the PDF. Moving your finger to scroll cancels the hold. You can select across folders or search results.
2. Choose **Ver y ordenar** or **Lista de lectura** in the sidebar to review the selection. Use the up/down buttons to change its order.
3. Choose **Leer lista** to open the first PDF. **PDF anterior / PDF siguiente** and touch swipes follow that list, with a position counter in the reader.

Opening a selected PDF directly also uses the reading-list order. An unselected PDF uses the current library filters and sort order. The list view keeps its explicit order even when the normal library sort changes. Starting **Leer lista** uses the complete selection, even if a search currently hides some selected PDFs.

Uncheck a PDF to remove it from the list, or use **Vaciar lista de lectura** to clear the selection. These actions do not remove PDFs from your library or device. Linked-folder selections persist between visits; individually selected files remain session-only, so their list entries disappear after a reload. A successful refresh removes list entries for deleted PDFs. Failed updates retain the existing imported PDFs and list.

## Read a PDF

Use the lower controls to zoom, fit the page to the pane's width, or choose a page number. **← / →** navigate pages. The background toggle changes the space surrounding the PDF; it does not recolor the document itself.

**PDF anterior / PDF siguiente** switch files without returning to the library. They follow the reading list for a selected PDF, or the library order and filters captured when you enter the reader, and stop at either end. Opening an unselected result outside the library filters through reader search starts a separate, single-file selection.

On a touch screen, swipe **left for the next PDF** or **right for the previous PDF** inside the score area. Deliberate horizontal swipes change files; vertical movement scrolls the current page. Small drags and multi-finger gestures do not switch files. If the zoomed PDF is wider than its pane, horizontal dragging pans the PDF instead; fit it to the pane to use file swipes again.

Choose **Buscar**:

- **Otra partitura:** find and open another score by filename or path.
- **En este PDF:** search embedded text and jump to a matching page. Image-only scans need OCR, which Atril does not include.

Favorites and the most recent reading page persist for linked files. Files selected individually keep this information only during the session.

## Compare two scores

1. Open a score and choose **Dividir y buscar**.
2. Search for the second score and select it.
3. Scroll, zoom, or turn pages independently in either pane.

Panes are side-by-side on larger screens and stacked on narrow screens. Click or focus a pane before using the arrow keys to select which PDF receives keyboard navigation.

Use **Buscar segunda partitura** to replace the second PDF. **Cerrar división** returns to one pane and keeps the first score open. The second pane has its own page and zoom controls and supports file swipes independently. Its swipe order is the alphabetical library order captured when selecting the second score; the first pane retains its filtered selection. Previous/next-file buttons belong to the first reader.

![Two reader panes stacked on a phone](images/mobile-reader.png)

## Hide reader controls

Choose **Ocultar controles** to hide the upper and lower bars, including the second pane's controls. Both scores continue to scroll independently. Use the floating **Mostrar controles** button or **Esc** to restore the bars.

The fullscreen button uses the browser's fullscreen API when available. Fullscreen and hiding the application's controls are separate options.

## Install and use offline

Visit the deployed HTTPS site online once and wait for the offline-ready notification.

- **Android or desktop:** use **Instalar Atril** or the browser's app installation command when available.
- **iPhone/iPad:** in Safari, use Share → Add to Home Screen.

The cached application can then open local PDFs without an internet connection. Individually selected PDFs still require reselection after reloading. Imported folder PDFs can be read without permission to the original folder. Permission is needed only to import or refresh. Cloud-backed providers may need a connection during those operations.

Saved PDFs use device storage. Clearing site data or browser storage eviction removes the saved library; import the folders again to restore it. Installing the app does not guarantee permanent folder permissions or protect data from deletion.

## Troubleshooting

| Symptom                                | Action                                                                                       |
| -------------------------------------- | -------------------------------------------------------------------------------------------- |
| A linked folder has a warning          | Open its ⋯ menu and choose **Restablecer acceso**. If needed, link it again.                 |
| New or deleted files are not reflected | Choose **Actualizar carpetas**.                                                              |
| The reader shows an older version      | Refresh the library, then reopen the PDF.                                                    |
| Text search finds no matches in a scan | Use a PDF with embedded text; OCR is outside the current scope.                              |
| A PDF will not open                    | Check that it is a valid, unencrypted PDF. Refresh or reimport if its saved copy is missing. |
| Folder linking is unavailable          | Use session-only folder selection or individual files in that browser.                       |
