// Parcours dans le navigateur (tests C et D), sur les émulateurs, formats ordinateur et téléphone.
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: /.*\.spec\.js/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  outputDir: './test-results',
  use: {
    baseURL: 'http://localhost:5050',
    locale: 'fr-FR',
    timezoneId: 'Europe/Paris',
    acceptDownloads: true,
    trace: 'off',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'node e2e/serveur.js',
    url: 'http://localhost:5050/index.html',
    reuseExistingServer: false,
    timeout: 20_000,
  },
  projects: [
    { name: 'ordinateur', use: { browserName: 'chromium', viewport: { width: 1440, height: 900 } } },
    { name: 'telephone', use: { browserName: 'chromium', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } },
  ],
});
