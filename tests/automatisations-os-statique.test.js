// Contrôles sans réseau du module Automatisations côté Chevalier IA OS (2.7.0) : accès administrateur, lecture seule des clients, interrupteur de mise en service.
// Lancé après « npm run preparer » (il lit les copies générées dans functions/partage/).
import assert from 'node:assert/strict';
import { test, describe } from 'node:test';
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => readFileSync(join(RACINE, f), 'utf8');

describe('Chevalier IA OS : copie de tes workflows et vue administrateur (2.7.0)', () => {
  const OS = (f) => lire(`functions/src/automatisations/${f}`).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/ .*$/gm, '');
  test('l\'accès administrateur vient d\'un seul fichier, le même pour l\'écran et le serveur ; le compte d\'assistant n\'y est pas', () => {
    const a = lire('js/os/administrateur.js');
    assert.match(a, /ADMINISTRATEURS = Object\.freeze\(\['jerome\.chevalier@gmail\.com'\]\)/);
    assert.ok(!/jeromebot/.test(a));
    assert.match(OS('appels.js'), /estAdministrateur\(jeton\.email, jeton\.email_verified\)/);
    assert.match(readFileSync(join(RACINE, 'scripts/preparer-fonctions.js'), 'utf8'), /administrateur\.js/);
  });
  test('la base de Chevalier IA APP n\'est jamais écrite par ce code : aucune écriture sur `dbPlateforme`', () => {
    const c = OS('appels.js');
    assert.ok(!/dbPlateforme\s*\.\s*(?:doc|collection)\([^)]*\)\s*\.\s*(?:set|update|delete|create|add)\b/.test(c));
    assert.ok(!/dbPlateforme\s*\.\s*(?:batch|runTransaction|bulkWriter|recursiveDelete)\b/.test(c));
    const lecture = c.slice(c.indexOf('export async function lireVueAdministrateur'), c.indexOf('export async function administrateur'));
    assert.ok(!/\.(set|update|delete|create|add)\s*\(/.test(lecture), 'la vue administrateur ne fait que lire');
    assert.ok(!/(?:fetch|fetchImpl)\s*\(/.test(c), 'aucun appel réseau : n8n passe par le lecteur partagé (GET seulement)');
  });
  test('les copies partagées sont identiques aux fichiers d\'origine (après « npm run preparer »)', () => {
    for (const f of ['n8n.js', 'etiquettes.js', 'synchro.js']) assert.equal(lire(`functions/partage/automatisations/${f}`), lire(`functions-plateforme/src/${f}`), f);
    assert.equal(lire('functions/partage/administrateur.js'), lire('js/os/administrateur.js'));
  });
  test('interrupteur allumé (17/10/2026, secret et comptes en place) : les deux fonctions sont celles décrites par le guide', async () => {
    process.env.GCLOUD_PROJECT ??= 'demo-chevalier-ia-os';
    const source = lire('functions/src/index.js');
    assert.match(source, /export const AUTOMATISATIONS_EN_SERVICE = true;/);
    const m = await import('../functions/src/index.js');
    for (const f of [m.automatisationsAdmin, m.automatisationsInterneHoraire]) {
      assert.deepEqual(f.__endpoint.region, ['europe-west9']);
      assert.deepEqual(f.__endpoint.secretEnvironmentVariables, [{ key: 'N8N_API_KEY' }]);
      assert.equal(f.__endpoint.serviceAccountEmail, 'automatisations-serveur@chevalier-ia-os.iam.gserviceaccount.com');
    }
    assert.equal(m.automatisationsInterneHoraire.__endpoint.scheduleTrigger.schedule, '0 * * * *');
  });
  test('aucun secret ni clé dans les fichiers ajoutés', () => {
    for (const f of ['functions/src/automatisations/appels.js', 'js/os/administrateur.js', 'functions-plateforme/src/etiquettes.js', 'docs/automatisations-n8n.md']) {
      const t = lire(f);
      assert.ok(!/AIza[0-9A-Za-z_-]{20,}|-----BEGIN|cle-n8n\.[a-z]+\.[A-Za-z0-9_-]{30,}|eyJ[A-Za-z0-9_-]{30,}/.test(t), f);
    }
  });
});
