// Maison d'un client (26/11/2026) : reglages_maison/ecran.configuration_crm === 'neutre' → l'écran prend la configuration NEUTRE (celle d'un espace de la plateforme),
// jamais celle de Jérôme. Champ absent ou toute autre valeur → comportement inchangé (la maison de Jérôme n'a pas ce champ). Sans réseau ni émulateur.
// Parcours dans le navigateur : tests/e2e/ecran-neutre-maison.spec.js (captures dans tests/e2e/captures/ecran-neutre-maison/).
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { remplirComptesMaison, viderComptesMaison, configurationNeutre, personnesMaison } from '../js/os/comptes-maison.js';
import * as L from '../js/modules/crm/logique.js';

const lire = (chemin) => readFileSync(new URL(`../${chemin}`, import.meta.url), 'utf8');
const PERSONNES = [{ email: 'alice@exemple.test', nom: 'Alice Martin' }, { email: 'bruno@exemple.test', nom: 'Bruno Petit' }];

beforeEach(() => viderComptesMaison());

test('1a configuration_crm « neutre » : la maison est neutre', () => {
  remplirComptesMaison({ personnes: PERSONNES, configuration_crm: 'neutre' });
  assert.equal(configurationNeutre(), true);
  assert.deepEqual(personnesMaison().map((p) => p.nom), ['Alice Martin', 'Bruno Petit']);
});

test('1b la configuration neutre (celle d’un espace de la plateforme) ne contient ni Jérôme, ni Charles, ni son portrait, ni ses étapes', () => {
  const depart = JSON.stringify(L.parametresDepart({ racine: false, moisCourant: '2026-11' }));
  for (const trace of ['Jérôme', 'Charles', 'charles-portrait', 'Rendez vous fixé', 'premier_contact', 'Découverte', 'jeromechevalier', 'GoogleDrive-']) {
    assert.ok(!depart.includes(trace), `trace trouvée : ${trace}`);
  }
  const config = L.construireConfig({}, { racine: false, membres: personnesMaison() });
  assert.deepEqual(config.etapes.map((e) => e.id), L.ETAPES_NEUTRES.map((e) => e.id));
  assert.equal(L.objectifsDepart(L.CONFIG_NEUTRE).some((o) => o.id === 'flyers'), false);
});

test('1c l’écran du CRM passe par la maison pour choisir la configuration : étapes, réglages, membres, image de Charles et objectifs', () => {
  const donnees = lire('js/modules/crm/donnees.js');
  assert.match(donnees, /const configJerome = \(\) => estRacine\(\) && !configurationNeutre\(\);/);
  assert.match(donnees, /construireConfig\(\{ \.\.\.docs, reglages: etat\.reglages \}, \{ racine: configJerome\(\), membres: membresEspace\(\) \}\)/);
  assert.match(donnees, /const imageCharles = !configJerome\(\)/);
  assert.match(donnees, /const reglagesDepart = \(\) => \(configJerome\(\) \? L\.REGLAGES_JEROME/);
  assert.match(donnees, /L\.parametresDepart\(\{ racine: configJerome\(\),/);
  assert.match(donnees, /if \(configurationNeutre\(\)\) return personnesMaison\(\)/);
  assert.match(lire('js/main.js'), /configurationNeutre\(\) \? objectifsNeutres\(CONFIG_NEUTRE\)/);
  assert.match(lire('js/modules/projets/donnees.js'), /P\.planInitialiserModeles\(\{ racine: CRM\.configHistorique\(\) \}\)/);
  assert.doesNotMatch(lire('js/modules/projets/donnees.js'), /racine: CRM\.cheminDeBase\(\) === ''/);
});

test('2a champ absent (maison de Jérôme) : configuration de Jérôme, comme avant', () => {
  remplirComptesMaison({ personnes: PERSONNES, comptes_jerome_seul: ['alice@exemple.test'] });
  assert.equal(configurationNeutre(), false);
});

test('2b toute autre valeur, ou une valeur qui n’est pas du texte : configuration de Jérôme', () => {
  for (const v of ['Neutre', ' neutre', 'jerome', '', null, true, 1, ['neutre'], { neutre: true }]) {
    remplirComptesMaison({ personnes: PERSONNES, configuration_crm: v });
    assert.equal(configurationNeutre(), false, `valeur ${JSON.stringify(v)}`);
  }
});

test('2c déconnexion : la configuration lue est oubliée (rien ne passe au compte suivant)', () => {
  remplirComptesMaison({ personnes: PERSONNES, configuration_crm: 'neutre' });
  viderComptesMaison();
  assert.equal(configurationNeutre(), false);
});

test('3 Drive et Rendez-vous : les réglages de départ d’une maison neutre n’ont ni chemin du Drive de Jérôme, ni compte GitHub ; le début d’activité est le mois donné', () => {
  const r = L.parametresDepart({ racine: false, moisCourant: '2026-11' }).reglages;
  assert.equal(r.cheminProjets, '');
  assert.equal(r.proprietaireGithub, '');
  assert.equal(r.dossierParentDrive, null);
  assert.equal(r.debutActivite, '2026-11');
  assert.equal(r.prenomCelebration, '');
  assert.equal(r.imageCelebration, '');
});
