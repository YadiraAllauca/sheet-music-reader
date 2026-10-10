# Repository Guidelines

## Project structure

Atril is a client-side sheet music PDF reader built with TypeScript, Vite, and PDF.js. The application has no backend.

- `src/`: library, local storage, folder linking, PDF readers, thumbnails, and responsive styles.
- `tests/`: Vitest unit tests and Playwright browser tests.
- `scripts/`: PDF.js asset preparation and documentation screenshots.
- `public/`: app icons and generated PDF.js resources.
- `docs/`: English guides and screenshots.

Use the actual implementation and [architecture guide](docs/architecture.md) when deciding where changes belong. `.agents/`, `.codex/`, `.aws/`, and `.vercel/` are local environment configuration, not application modules.

## Build, test, and development

Use Node.js 24.x and npm. Node.js 22.12+ within the 22.x series is also supported by the manifest.

- `npm ci`: install locked dependencies and prepare PDF.js assets.
- `npm run dev`: start development.
- `npm run build`: application type checking and production/PWA build.
- `npm test`: unit tests.
- `npm run lint`: lint source and tests.
- `npm run test:e2e`: desktop/mobile browser tests; build first and install the browser.
- `npm run docs:screenshots`: regenerate documentation images from a production build.
- `git diff --check`: detect whitespace errors.

See [development](docs/development.md) for browser setup and complete commands. Keep dependency manifests and lockfiles consistent.

## Coding and documentation

Follow existing TypeScript conventions. Use descriptive names and small focused modules. Prettier specifies two-space indentation, single quotes, trailing commas, and a 100-character line width; ESLint checks application and test TypeScript.

Avoid unrelated formatting changes. Write documentation in English and keep it aligned with the current implementation. Product labels are currently Spanish; user guides should reference their actual labels.

## Tests and assets

Add meaningful tests with new behavior and regression tests with bug fixes. Use `*.test.ts` for unit tests and `*.spec.ts` for browser flows. No coverage threshold is configured.

Keep sample scores small and legally redistributable. Documentation screenshots use original generated notation from `scripts/capture-docs.mjs`. Browser emulation does not replace physical-device verification of folder permissions and installation.

## Commits and pull requests

Use concise, imperative subjects, for example `Add score upload validation`. Keep each commit focused. Pull requests should describe resulting behavior, reference related issues when available, report validation, include screenshots for visual changes, and disclose checks that could not run.

## Privacy and configuration

Never commit credentials, local configuration, or private scores. Keep `.gitignore` aligned with generated and local files.

Preserve read-only filesystem access. PDF bytes and thumbnails must not be persisted or uploaded. IndexedDB holds linked folder references and reading metadata; session-only files remain in memory. See [architecture](docs/architecture.md) for storage boundaries and [deployment](docs/deployment.md) for Vercel setup.
