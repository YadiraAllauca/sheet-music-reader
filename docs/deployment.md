# Deployment

[Back to README](../README.md)

Atril builds into static files and can be hosted over HTTPS without an application server. The repository provides a Vercel configuration for the production output.

## Vercel setup

1. Push the repository to GitHub or GitLab.
2. Import the repository as a project in Vercel.
3. Set **Root Directory** to the repository root and select Node.js **24.x**.
4. Confirm the settings below, supplied by `vercel.json`.
5. Set **Production Branch** to `main` in the project's Git settings and deploy.

| Setting               | Value           |
| --------------------- | --------------- |
| Framework             | Vite            |
| Install command       | `npm ci`        |
| Build command         | `npm run build` |
| Output directory      | `dist`          |
| Environment variables | None required   |

Dependency installation runs `postinstall`, which prepares the local PDF.js resources before compilation.

Once the repository is connected, pushes and merges to `main` create production deployments. Other branches can create preview deployments. The Git connection and production branch are Vercel settings; committing `vercel.json` alone does not enable automatic deployments. See [Vercel's Git integration](https://vercel.com/docs/git) and [configuration reference](https://vercel.com/docs/project-configuration/vercel-json).

## Check a deployment

- Confirm that the library loads and a local PDF opens.
- On a compatible browser, link a folder and refresh it after changing a local file.
- Check the first-page previews, reader search, split view, and mobile layout.
- Wait for the offline-ready notification, then verify the app can reopen and read selected local files offline.
- Check that PDF.js resources load from the site's `/pdfjs/` path and that the service worker installs successfully.

Production builds have been exercised locally with browser tests. Account-level Vercel configuration and a live deployed URL must be verified in the actual Vercel project.

## PWA updates and local data

The service worker uses the plugin's prompt update mode. An already-open or installed app may continue using its cached version; the app currently has no dedicated update prompt UI. Reopen the app after deployment and verify that the new version is active. Clearing site data also removes folder references, reading progress, preferences, and offline resources, so it should not be a routine update procedure.

Folder permissions and browser storage belong to an origin. Preview URLs, a production URL, and a custom domain can therefore have separate local libraries and permissions. Use a stable production origin for normal use.

HTTPS is necessary for production folder linking and service worker delivery. Installing the app does not bypass browser-specific filesystem restrictions.

## Other static hosts

Run `npm ci` and `npm run build`, then publish the contents of `dist/` at the site's root over HTTPS. The current PDF.js resource URLs assume root hosting. A subdirectory deployment requires adjusting asset and PDF.js paths before release.

The host needs to serve the generated service worker, manifest, JavaScript worker, fonts, character maps, and WebAssembly files. The app currently has no client-side URL routes requiring custom SPA rewrites.
