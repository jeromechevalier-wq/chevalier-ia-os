// Modules allumés dans une maison (27/11/2026) : champ facultatif `modules` de reglages_maison/ecran (js/os/maison-modules.js). Sans réseau ni émulateur, adresses inventées.
// Parcours dans le navigateur : tests/e2e/maison-modules.spec.js (captures dans tests/e2e/captures/maison-modules/).
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { lireModulesMaison, modulesDeLaMaison } from '../js/os/maison-modules.js';
import { remplirComptesMaison, viderComptesMaison, modulesEcranBrut } from '../js/os/comptes-maison.js';
import { MODULES_DECLARES, verifierActivation, modulesActifsDuClient } from '../js/os/registre.js';

// Les modules montables, sans leur montage (js/os/modules.js importe le code des modules) : mêmes id et même champ seulJerome.
const TOUS = MODULES_DECLARES.map((d) => ({ id: d.id, ...(d.seulJerome ? { seulJerome: true } : {}) }));
const ids = (r) => r.modules.map((m) => m.id);
const ACHATS_SCAB = ['achatsfactures', 'tableauachats', 'achatschantiers', 'achatsfournisseurs', 'achatsarticles'];
const ACHATS = ['achatsfournisseurs', 'achatschantiers', 'achatsarticles', 'achatsfactures', 'tableauachats'];

beforeEach(() => viderComptesMaison());

test('1 sans réglage (champ absent ou null) : comportement d’avant — tout pour le titulaire, ni Console ni Achats pour un autre compte, accueil d’avant', () => {
  for (const brut of [undefined, null]) {
    const t = modulesDeLaMaison(TOUS, { titulaire: true, brut });
    assert.deepEqual(ids(t), TOUS.map((m) => m.id));
    assert.equal(t.accueil, null);
    const a = modulesDeLaMaison(TOUS, { titulaire: false, brut });
    assert.deepEqual(ids(a), TOUS.filter((m) => !m.seulJerome).map((m) => m.id));
    assert.ok(!ids(a).includes('console') && !ACHATS.some((id) => ids(a).includes(id)));
    assert.deepEqual(a.avertissements, []);
  }
  remplirComptesMaison({ personnes: [], comptes_jerome_seul: [] });
  assert.equal(modulesEcranBrut(), undefined);
});

test('2 réglage = 5 modules Achats, compte NON titulaire : exactement ces 5 modules, arrivée sur Factures, jamais la Console', () => {
  const r = modulesDeLaMaison(TOUS, { titulaire: false, brut: ACHATS_SCAB });
  assert.deepEqual(ids(r), ACHATS); // ordre de démarrage (celui du menu)
  assert.equal(r.accueil, 'achatsfactures/liste'); // premier module de la liste du réglage
  assert.ok(!ids(r).includes('console') && !ids(r).includes('affaires'));
  assert.deepEqual(r.avertissements, []);
  // La Console listée dans le réglage ne s'ouvre pas pour autant à un autre compte.
  const c = modulesDeLaMaison(TOUS, { titulaire: false, brut: [...ACHATS_SCAB, 'console'] });
  assert.ok(!ids(c).includes('console'));
  assert.match(c.avertissements.join(' '), /console/);
});

test('3 même réglage, compte titulaire : les 5 modules Achats ET la Console, arrivée sur Factures', () => {
  const r = modulesDeLaMaison(TOUS, { titulaire: true, brut: ACHATS_SCAB });
  assert.deepEqual(ids(r), [...ACHATS, 'console']);
  assert.equal(r.accueil, 'achatsfactures/liste');
});

test('4 un identifiant inconnu est ignoré avec un avertissement ; les autres modules restent allumés', () => {
  const r = modulesDeLaMaison(TOUS, { titulaire: false, brut: ['achatsfactures', 'inconnu', 42, ''] });
  assert.deepEqual(ids(r), ['achatsfactures']);
  assert.equal(r.avertissements.length, 3);
  assert.match(r.avertissements[0], /module inconnu ignoré : « inconnu »/);
  assert.deepEqual(lireModulesMaison(['achatsfactures', ' achatsfactures ']).demandes, ['achatsfactures']); // doublon et espaces
});

test('5 dépendances vérifiées par la logique de la plateforme ; une valeur qui n’est pas une liste n’allume rien ; liste vide = Réglages seul', () => {
  const sansAffaires = modulesDeLaMaison(TOUS, { titulaire: false, brut: ['projets'] });
  assert.deepEqual(ids(sansAffaires), []); // Projets exige Affaires
  assert.match(sansAffaires.avertissements.join(' '), /ne peut pas être activé sans : Affaires/);
  assert.equal(sansAffaires.accueil, 'reglages');
  const crm = modulesDeLaMaison(TOUS, { titulaire: false, brut: ['affaires', 'projets'] });
  assert.deepEqual(ids(crm), ['affaires', 'projets']);
  assert.equal(crm.accueil, 'crm/accueil');
  for (const brut of [{ achatsfactures: true }, 'achatsfactures', true]) {
    const r = modulesDeLaMaison(TOUS, { titulaire: false, brut });
    assert.deepEqual(ids(r), [], JSON.stringify(brut));
    assert.equal(r.avertissements.length, 1);
  }
  assert.equal(modulesDeLaMaison(TOUS, { titulaire: true, brut: [] }).accueil, 'console/vue');
  assert.equal(modulesDeLaMaison(TOUS, { titulaire: false, brut: [] }).accueil, 'reglages');
});

test('6 plateforme des clients inchangée : sans l’option `maison`, tout module réservé reste refusé ; la Console n’est jamais activable, même en maison', () => {
  assert.deepEqual(verifierActivation(['achatsfactures']).actifs, []);
  assert.deepEqual(modulesActifsDuClient({ modules: { achatsfactures: true, affaires: true } }).actifs, ['affaires']);
  assert.deepEqual(verifierActivation(['console'], { maison: true }).actifs, []);
  assert.deepEqual(verifierActivation(['achatsfactures'], { maison: true }).actifs, ['achatsfactures']);
});

test('7 lecture du document `ecran` : le champ est copié, oublié à la déconnexion ; js/main.js passe par ce filtre et sert « Page introuvable » pour un module éteint', () => {
  const doc = { personnes: [], modules: ['achatsfactures'] };
  remplirComptesMaison(doc);
  const lu = modulesEcranBrut();
  lu.push('affaires');
  assert.deepEqual(modulesEcranBrut(), ['achatsfactures']);
  viderComptesMaison();
  assert.equal(modulesEcranBrut(), undefined);
  const main = readFileSync(new URL('../js/main.js', import.meta.url), 'utf8');
  assert.match(main, /modulesDeLaMaison\(MODULES_TOUS, \{ titulaire: peutVoirConsole\(compte\), brut: modulesEcranBrut\(\) \}\)/);
  assert.match(main, /if \(!m && accueilMaison\)/);
  assert.match(main, /'Page introuvable'/);
});
