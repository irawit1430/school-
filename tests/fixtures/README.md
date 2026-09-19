# Drivers regression checks

The Drivers page uses the existing backend contracts. Test fixture records are fictitious and never sent to a backend.

- Interaction tests: `node_modules/.bin/vitest run --config vitest.drivers.config.mts`
- Helper regressions: `node_modules/.bin/playwright test tests/drivers.spec.ts --config playwright.unit.config.ts`
- Browser preview: `node_modules/.bin/vite --config vite.drivers-preview.config.mts`, then open `http://127.0.0.1:4173/tests/fixtures/drivers-preview.html`.

The preview renders the actual Drivers component and app styles, with in-memory API methods and inert navigation links. Reloading resets the fixtures. It is separate from the Next.js app routes and production export. It verifies layout and local interactions, not authentication or live API integration.
