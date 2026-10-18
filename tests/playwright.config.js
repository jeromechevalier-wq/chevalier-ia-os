// Parcours dans le navigateur (tests C et D), sur les émulateurs, formats ordinateur et téléphone.
// Ports : voir ports.js (TESTS_DECALAGE). Workers : TESTS_WORKERS (défaut : la moitié des cœurs, 3 au plus : 3 workers vont aussi vite que 4 sur le Mac de Jérôme et se gênent moins).
import os from 'node:os';
import { defineConfig } from '@playwright/test';
import { portsCourants, decalage } from './ports.js';

const ports = portsCourants();
const WORKERS = Number(process.env.TESTS_WORKERS) || Math.max(1, Math.min(3, Math.floor(os.cpus().length / 2)));

export default defineConfig({
  testDir: './e2e',
  testMatch: /.*\.spec\.js/,
  fullyParallel: false,
  workers: WORKERS,
  retries: process.env.CI ? 2 : 0, // sur GitHub : deux reprises (machine lente) (un scénario qui ne passe qu'à la 2e fois est signalé « flaky » dans le rapport)
  timeout: 90_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]] : [['list']],
  outputDir: `./test-results/${decalage()}`, // un dossier par session : deux suites en même temps ne s'effacent pas
  use: {
    baseURL: `http://localhost:${ports.serveur}`,
    locale: 'fr-FR',
    timezoneId: 'Europe/Paris',
    acceptDownloads: true,
    trace: 'off',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'node e2e/serveur.js',
    env: { PORT: String(ports.serveur) },
    url: `http://localhost:${ports.serveur}/index.html`,
    reuseExistingServer: false,
    timeout: 20_000,
  },
  projects: [
    { name: 'ordinateur', use: { browserName: 'chromium', viewport: { width: 1440, height: 900 } } },
    // Les scénarios étiquetés @sans-telephone ne dépendent pas de la taille de l'écran : ils ne tournent qu'en format ordinateur.
    { name: 'telephone', grepInvert: /@sans-telephone/, use: { browserName: 'chromium', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } },
  ],
});
