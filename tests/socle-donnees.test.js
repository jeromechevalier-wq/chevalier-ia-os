// Socle commun (noyau Contacts), PR A : la couche de données du CRM sait démarrer sur deux collections seulement, sans que personne l'appelle encore.
// Tests de texte (comme registre.test.js). Un test par point, le nom commence par son numéro.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => readFileSync(join(RACINE, f), 'utf8');
const donnees = lire('js/modules/crm/donnees.js');
/** Corps d'une fonction de premier niveau : du mot « function nom( » à la première accolade fermante en début de ligne. */
const corps = (nom) => {
  const debut = donnees.search(new RegExp(`function ${nom}\\(`));
  assert.ok(debut >= 0, nom);
  return donnees.slice(debut, donnees.indexOf('\n}\n', debut) + 3);
};
const occurrences = (texte, motif) => texte.split(motif).length - 1;

describe('socle commun : couche de données', () => {
  test("S1 la signature de demarrer ne change pas et crm/index.js l'appelle sans noyau", () => {
    assert.match(donnees, /export function demarrer\(compteConnecte, base = '', options = \{\}\)/);
    assert.ok(lire('js/modules/crm/index.js').includes('D.demarrer(compte, cheminBase, { equipe, nomEspace })'));
    for (const f of ['js/main.js', 'js/os/espace-modules.js', 'js/os/modules.js', 'js/os/registre.js']) assert.ok(!/noyau/i.test(lire(f)), f);
    for (const dossier of ['devis', 'projets']) {
      for (const f of readdirSyncFichiers(`js/modules/${dossier}`)) assert.ok(!/noyau/i.test(lire(f)), f);
    }
  });
  test('S2 les listes du socle et du complet', () => {
    assert.ok(donnees.includes("export const CLES_NOYAU = Object.freeze(['personnes', 'organisations']);"));
    assert.ok(donnees.includes("export const CLES_COMPLET = Object.freeze([...CLES_NOYAU, 'affaires', 'activites', 'parametres']);"));
    const param = corps('ecouterParametres');
    assert.equal(occurrences(donnees, 'configurerCelebrations('), 1);
    assert.equal(occurrences(donnees, 'initialiserParametres('), 2); // la définition + l'appel
    assert.ok(param.includes('configurerCelebrations(') && param.includes('initialiserParametres('));
    assert.equal(occurrences(donnees, 'migrerRoles('), 2); // la définition + l'appel de notifier
    assert.ok(corps('notifier').includes('migrerRoles('));
  });
  test('S3 jamais deux écouteurs sur la même clé', () => {
    const d = corps('demarrer');
    assert.ok(d.includes('ecoutes.includes(cle)'));
    assert.equal(occurrences(d, 'ecoutes.push'), 1);
    assert.ok(corps('arreter').includes('ecoutes = []'));
  });
  test('S4 les deux suppressions refusent le socle seul', () => {
    for (const nom of ['supprimerPersonne', 'supprimerOrganisation']) {
      const c = corps(nom);
      assert.ok(c.includes('estNoyau()') && c.includes('throw'), nom);
    }
  });
  test("S5 COLLECTIONS_CRM et l'export ne changent pas", () => {
    const m = donnees.match(/export const COLLECTIONS_CRM = \[([\s\S]*?)\];/);
    const noms = [...m[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]);
    assert.deepEqual(noms, [
      'crm_personnes', 'crm_organisations', 'crm_affaires', 'crm_activites', 'crm_notes', 'crm_evenements', 'crm_parametres',
      'projets_projets', 'projets_taches', 'projets_modeles',
      'devis_articles', 'devis_parametres', 'devis_devis', 'devis_vocabulaire', 'devis_usage_articles',
      'documents_stockes',
      'veille_sources', 'veille_contenus', 'veille_resumes', 'veille_pages',
    ]);
    assert.equal(noms.length, 20);
    const exp = lire('js/modules/devis/donnees.js');
    assert.ok(exp.includes("CRM.collectionsParNoms(['devis_articles', 'devis_parametres', 'devis_devis', 'devis_vocabulaire', 'devis_usage_articles'])"));
  });
});

import { readdirSync, statSync } from 'node:fs';
function readdirSyncFichiers(dossier) {
  const sortie = [];
  for (const nom of readdirSync(join(RACINE, dossier))) {
    const chemin = `${dossier}/${nom}`;
    if (statSync(join(RACINE, chemin)).isDirectory()) sortie.push(...readdirSyncFichiers(chemin)); else if (nom.endsWith('.js')) sortie.push(chemin);
  }
  return sortie;
}
