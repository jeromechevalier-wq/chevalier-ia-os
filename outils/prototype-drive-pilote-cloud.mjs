// Pilote du test E pour une session cloud (sans écran) : ouvre la page de `prototype-drive.js --navigateur` dans un
// Chromium sans interface et clique sur « Envoyer 50 Mo de test ». Usage : node outils/prototype-drive-pilote-cloud.mjs <adresse>
// Playwright n'est pas une dépendance du dépôt : il est cherché dans l'installation globale de la session cloud.
import { createRequire } from 'node:module';
import { createHash, X509Certificate } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';

const adresse = process.argv[2];
if (!adresse) { console.error('Usage : node outils/prototype-drive-pilote-cloud.mjs <adresse de la page>'); process.exit(1); }

let chromium;
try {
  ({ chromium } = (await import('playwright')).default ?? (await import('playwright')));
} catch {
  ({ chromium } = createRequire('/opt/node-tools/node_modules/')('playwright'));
}
// Le proxy de la session cloud ré-émet les certificats avec sa propre autorité : on fait confiance à SA clé, et à elle seule
// (jamais de désactivation générale de la vérification TLS). Le navigateur lit le proxy dans l'environnement.
const args = [];
const autorite = '/root/.ccr/agent-proxy-ca.crt';
if (existsSync(autorite)) {
  const spki = createHash('sha256').update(new X509Certificate(readFileSync(autorite)).publicKey.export({ type: 'spki', format: 'der' })).digest('base64');
  args.push(`--ignore-certificate-errors-spki-list=${spki}`);
}
const navigateur = await chromium.launch({ args });
const page = await navigateur.newPage();
page.on('console', (m) => { if (m.type() === 'error') console.log('console du navigateur :', m.text()); });
await page.goto(adresse);
await page.click('#gros');
await page.waitForFunction(() => /Terminé|✗/.test(document.getElementById('journal').textContent), null, { timeout: 5 * 60 * 1000 });
console.log(await page.textContent('#journal'));
await navigateur.close();
