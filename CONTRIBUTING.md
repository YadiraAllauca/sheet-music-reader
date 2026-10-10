# Contributing

Start with the [development guide](docs/development.md) and [architecture overview](docs/architecture.md).

## Scope and style

Keep changes focused on the local PDF library and reader. Preserve read-only access to original documents and the boundary between persistent linked-folder PDF copies and session-only individually selected files. Opening the app must not request folder access; failed refreshes must preserve the previous import.

Use descriptive TypeScript names, small focused modules, and the existing HTML/CSS conventions. Format with Prettier and lint with ESLint. Write repository documentation in English; the product interface is currently Spanish.

## Verification

For behavior changes, add meaningful tests or update the relevant regression coverage. Use `tests/*.test.ts` for unit tests and `tests/e2e/*.spec.ts` for browser workflows.

```sh
npm test
npm run lint
npm run build
npm run test:e2e
```

Build before running browser tests. Validate folder selection and installation on real target devices when changing browser integrations. Use generated or legally redistributable test scores; never include private documents.

For documentation-only changes, check formatting, relative links, and referenced commands. Update screenshots when the interface changes.

## Commits and pull requests

Use concise, imperative commit subjects, such as `Add score upload validation`. A pull request should explain the problem and resulting behavior, reference related issues when available, and report verification performed. Include screenshots for visual changes and disclose checks that could not run.

Do not commit credentials, `.env` files, local environment configuration, generated build output, or private scores. Keep dependency manifest and lockfile changes together.
