// Maison d'un client (26/11/2026) : reglages_maison/public peut porter nom_espace (texte) et connexion_neutre (true), deux champs facultatifs non sensibles,
// lus AVANT la connexion : page de connexion et nom de l'espace neutres (ni Jérôme, ni Charles, ni « Chevalier IA OS »). Champs absents (maison de Jérôme) : rien ne change.
// Sans réseau ni émulateur. Parcours dans le navigateur : tests/e2e/maison-connexion-neutre.spec.js (captures dans tests/e2e/captures/maison-connexion-neutre/).
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { retenirPublic, oublierPublic, connexionNeutre, maisonNeutre, nomEspaceMaison, nomAfficheMaison, nomEspaceRacine, NOM_ESPACE_DEFAUT, LONGUEUR_NOM_MAX } from '../js/os/identite-maison.js';
import { remplirComptesMaison, viderComptesMaison } from '../js/os/comptes-maison.js';

const lire = (chemin) => readFileSync(new URL(`../${chemin}`, import.meta.url), 'utf8');

beforeEach(() => { oublierPublic(); viderComptesMaison(); });

test('1 nom_espace dans « public » : connexion neutre, le nom de la maison remplace « Chevalier IA OS »', () => {
  retenirPublic({ mode_crm: true, nom_espace: '  Chevalier IA -   SCAB 04 ' });
  assert.equal(connexionNeutre(), true);
  assert.equal(maisonNeutre(), true);
  assert.equal(nomEspaceMaison(), 'Chevalier IA - SCAB 04');
  assert.equal(nomAfficheMaison(), 'Chevalier IA - SCAB 04');
  assert.equal(nomEspaceRacine('Chevalier IA OS'), 'Chevalier IA - SCAB 04');
});

test('2 connexion_neutre seul : page neutre, titre « Votre espace »', () => {
  retenirPublic({ mode_crm: true, connexion_neutre: true });
  assert.equal(connexionNeutre(), true);
  assert.equal(nomAfficheMaison(), NOM_ESPACE_DEFAUT);
  assert.equal(NOM_ESPACE_DEFAUT, 'Votre espace');
});

test('3 champs absents (maison de Jérôme) : rien ne change, « Chevalier IA OS » reste', () => {
  retenirPublic({ mode_crm: true });
  assert.equal(connexionNeutre(), false);
  assert.equal(maisonNeutre(), false);
  assert.equal(nomEspaceRacine('Chevalier IA OS'), 'Chevalier IA OS');
  retenirPublic(null); // document absent : pareil
  assert.equal(maisonNeutre(), false);
});

test('4 valeurs mal formées ignorées : connexion_neutre autre que true, nom vide ou non texte ; nom trop long coupé', () => {
  retenirPublic({ connexion_neutre: 'oui', nom_espace: 42 });
  assert.equal(connexionNeutre(), false);
  retenirPublic({ nom_espace: '   ' });
  assert.equal(connexionNeutre(), false);
  retenirPublic({ nom_espace: 'é'.repeat(200) });
  assert.equal([...nomEspaceMaison()].length, LONGUEUR_NOM_MAX);
});

test('5 configuration_crm « neutre » (document ecran) sans champ dans « public » : maison neutre après la connexion, nom « Votre espace »', () => {
  remplirComptesMaison({ personnes: [{ email: 'alice@exemple.test', nom: 'Alice' }], configuration_crm: 'neutre' });
  assert.equal(connexionNeutre(), false); // avant la connexion, « ecran » n'est pas lisible : la page de connexion ne peut pas le savoir
  assert.equal(maisonNeutre(), true);
  assert.equal(nomEspaceRacine('Chevalier IA OS'), 'Votre espace');
});

test('6 le document « public » est lu par auth.js et retenu ici ; règle Firestore inchangée (public lisible par tous) ; fichier sans Firebase', () => {
  assert.match(lire('js/os/auth.js'), /retenirPublic\(donnees\)/);
  assert.match(lire('firestore.rules'), /allow get: if id == 'public' \|\|/);
  assert.doesNotMatch(lire('js/os/identite-maison.js'), /from '[^']*firebase/);
});
