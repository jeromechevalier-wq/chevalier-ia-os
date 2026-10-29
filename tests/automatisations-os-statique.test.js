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
    for (const f of ['n8n.js', 'etiquettes.js', 'synchro.js', 'libelle.js']) assert.equal(lire(`functions/partage/automatisations/${f}`), lire(`functions-plateforme/src/${f}`), f);
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

// ---------------------------------------------------------------- renommer un workflow chez Jérôme (28/10/2026)
describe('4. Renommer chez Jérôme : fonction automatisationsRenommer (collection racine « workflows »)', () => {
  const EFFACER = Symbol('effacer');
  const JEROME = 'jerome.chevalier@gmail.com';
  /** Double minimal de Firestore : documents en mémoire, `update` fusionne (le symbole EFFACER retire le champ). */
  function fausseBase(docs) {
    const donnees = new Map(Object.entries(docs));
    return {
      donnees,
      db: () => ({
        doc: (chemin) => ({
          get: async () => ({ exists: donnees.has(chemin) }),
          update: async (champs) => {
            const cible = { ...donnees.get(chemin) };
            for (const [k, v] of Object.entries(champs)) { if (v === EFFACER) delete cible[k]; else cible[k] = v; }
            donnees.set(chemin, cible);
          },
        }),
      }),
    };
  }
  const requete = (data, email = JEROME, verifie = true) => ({ auth: { token: { email, email_verified: verifie } }, data });
  async function code(promesse) {
    try { await promesse; } catch (e) { return e.code; }
    return 'aucun-refus';
  }
  async function monter(docs = { 'workflows/wf1': { workflowId: 'wf1', nom: 'Lire une fiche' } }) {
    const { creerAppelRenommer } = await import('../functions/src/automatisations/renommer-appel.js');
    const base = fausseBase(docs);
    const lignes = [];
    return { base, lignes, appel: creerAppelRenommer({ db: base.db, effacer: EFFACER, journal: (e) => lignes.push(e) }) };
  }

  test('R1 un compte autorisé renomme : seul « libelle » change, la réponse redonne le nom propre (accents compris)', async () => {
    const { base, appel } = await monter();
    assert.deepEqual(await appel(requete({ client: undefined, workflowId: 'wf1', libelle: '  Présences\n du  matin é ' })), { ok: true, libelle: 'Présences du matin é' });
    assert.deepEqual(base.donnees.get('workflows/wf1'), { workflowId: 'wf1', nom: 'Lire une fiche', libelle: 'Présences du matin é' });
  });
  test('R2 refusés : sans connexion, e-mail non vérifié, compte inconnu (aucune écriture)', async () => {
    const { base, appel } = await monter();
    const d = { workflowId: 'wf1', libelle: 'Non' };
    assert.equal(await code(appel({ data: d })), 'unauthenticated');
    assert.equal(await code(appel(requete(d, JEROME, false))), 'permission-denied');
    assert.equal(await code(appel(requete(d, 'inconnu@exemple.test'))), 'permission-denied');
    assert.equal(base.donnees.get('workflows/wf1').libelle, undefined);
  });
  test('R3 un nom vide retire le champ « libelle » (retour au nom d\'origine)', async () => {
    const { base, appel } = await monter({ 'workflows/wf1': { workflowId: 'wf1', nom: 'Lire une fiche', libelle: 'Ancien' } });
    assert.deepEqual(await appel(requete({ workflowId: 'wf1', libelle: '   ' })), { ok: true, libelle: '' });
    assert.deepEqual(base.donnees.get('workflows/wf1'), { workflowId: 'wf1', nom: 'Lire une fiche' });
  });
  test('R4 nom trop long refusé (80 caractères au plus, comme chez les clients) ; 80 passe', async () => {
    const { appel } = await monter();
    assert.equal(await code(appel(requete({ workflowId: 'wf1', libelle: 'x'.repeat(81) }))), 'invalid-argument');
    assert.equal((await appel(requete({ workflowId: 'wf1', libelle: 'x'.repeat(80) }))).libelle.length, 80);
  });
  test('R5 demandes invalides : identifiant douteux, nom absent ou pas un texte, corps vide', async () => {
    const { appel } = await monter();
    for (const d of [{ workflowId: 'a/b', libelle: 'x' }, { workflowId: '', libelle: 'x' }, { workflowId: '../x', libelle: 'x' }, { workflowId: 5, libelle: 'x' }, { workflowId: 'wf1' }, { workflowId: 'wf1', libelle: 5 }, null, undefined, {}]) {
      assert.equal(await code(appel(requete(d))), 'invalid-argument', JSON.stringify(d));
    }
  });
  test('R6 un workflow inconnu n\'est pas créé par un renommage', async () => {
    const { base, appel } = await monter();
    assert.equal(await code(appel(requete({ workflowId: 'inconnu', libelle: 'x' }))), 'not-found');
    assert.equal(base.donnees.has('workflows/inconnu'), false);
  });
  test('R7 le journal ne contient ni le nom saisi, ni l\'identifiant, ni l\'adresse de l\'appelant', async () => {
    const { lignes, appel } = await monter();
    await appel(requete({ workflowId: 'wf1', libelle: 'Nom secret' }));
    await code(appel(requete({ workflowId: 'wf1', libelle: 'x'.repeat(81) })));
    const { ligneDeJournalRenommer } = await import('../functions/src/automatisations/renommer-appel.js');
    const texte = lignes.map(ligneDeJournalRenommer).join('\n');
    assert.match(texte, /automatisationsRenommer/);
    assert.ok(!/Nom secret|wf1|jerome|gmail/.test(texte));
  });
  test('R8 la fonction est déclarée comme celles des devis (Paris, compte de service de la porte, aucun secret) et le code pur est SANS dépendance', async () => {
    process.env.GCLOUD_PROJECT ??= 'demo-chevalier-ia-os';
    const m = await import('../functions/src/index.js');
    assert.deepEqual(m.automatisationsRenommer.__endpoint.region, ['europe-west9']);
    assert.equal(m.automatisationsRenommer.__endpoint.serviceAccountEmail, 'porte-serveur@chevalier-ia-os.iam.gserviceaccount.com');
    assert.equal(m.automatisationsRenommer.__endpoint.secretEnvironmentVariables, undefined);
    const pur = lire('functions-plateforme/src/libelle.js').replace(/\/\/.*$/gm, '');
    assert.deepEqual([...pur.matchAll(/^import .* from '(.*)'/gm)].map((x) => x[1]), ['./etiquettes.js']);
    assert.ok(!/firebase|logger/.test(pur));
  });
});
