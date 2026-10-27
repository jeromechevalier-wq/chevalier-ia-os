// Onglet « Devis » d'une affaire : filtre, tri, libellés, compteur. Pur : aucun navigateur.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { devisDeAffaire, intituleDevis, compteurOnglet, libelleOuvrirPdf, nomVoir, nomOuvrirPdf, nomTelecharger, routeVoirDevis, estIntrouvable, adresseTelechargeable, actionEnteteDevis } from '../js/modules/devis/onglet-affaire-logique.js';

const JOUR = 86400000;
const MAINT = Date.parse('2026-10-25T10:00:00Z');
const devis = [
  { id: 'd1', affaireId: 'a1', statut: 'remplace', version: 1, numero: 'DEV-001', creeLe: new Date(MAINT - 20 * JOUR) },
  { id: 'd2', affaireId: 'a1', statut: 'envoye', version: 2, numero: 'DEV-001', creeLe: new Date(MAINT - 10 * JOUR) },
  { id: 'd3', affaireId: 'a2', statut: 'brouillon', version: 1, creeLe: new Date(MAINT - 1 * JOUR) },
  { id: 'd4', affaireId: 'a1', statut: 'brouillon', version: 3, numero: null, objet: 'Cuisine', creeLe: new Date(MAINT - 1 * JOUR) },
  { id: 'd5', affaireId: 'a1', statut: 'accepte', version: 1, numero: 'DEV-000', archive: true, creeLe: new Date(MAINT - 30 * JOUR) },
];

test('2 les devis de l’affaire sont triés du plus récent au plus ancien', () => {
  assert.deepEqual(devisDeAffaire(devis, 'a1').map((d) => d.id), ['d4', 'd2', 'd1']);
});
test('2 à date égale, la version la plus haute passe d’abord ; sans date de création, la date de finalisation compte', () => {
  const m = new Date(MAINT);
  assert.deepEqual(devisDeAffaire([{ id: 'x', affaireId: 'a', version: 1, creeLe: m }, { id: 'y', affaireId: 'a', version: 2, creeLe: m }], 'a').map((d) => d.id), ['y', 'x']);
  assert.deepEqual(devisDeAffaire([{ id: 'x', affaireId: 'a', finaliseLe: new Date(MAINT - JOUR) }, { id: 'y', affaireId: 'a', finaliseLe: new Date(MAINT) }], 'a').map((d) => d.id), ['y', 'x']);
});
test('9 un devis d’une autre affaire n’apparaît pas, un archivé non plus, un « Remplacé » oui', () => {
  const ids = devisDeAffaire(devis, 'a1').map((d) => d.id);
  assert.ok(!ids.includes('d3'));
  assert.ok(!ids.includes('d5'));
  assert.ok(ids.includes('d1'));
  assert.deepEqual(devisDeAffaire(devis, 'inconnue'), []);
  assert.deepEqual(devisDeAffaire(devis, ''), []);
  assert.deepEqual(devisDeAffaire(null, 'a1'), []);
});
test('2 le compteur est le nombre de lignes, et absent tant que les devis ne sont pas lus', () => {
  assert.equal(compteurOnglet(devisDeAffaire(devis, 'a1'), true), 3);
  assert.equal(compteurOnglet([], true), 0);
  assert.equal(compteurOnglet([], false), null);
});
test('2 numéro et version : « Brouillon », « DEV-001 », « DEV-001 v2 »', () => {
  assert.equal(intituleDevis({ numero: null, version: 1 }), 'Brouillon');
  assert.equal(intituleDevis({ numero: 'DEV-001', version: 1 }), 'DEV-001');
  assert.equal(intituleDevis({ numero: 'DEV-001', version: 2 }), 'DEV-001 v2');
});
test('6 les noms accessibles ne sont jamais vides', () => {
  assert.equal(nomTelecharger({ numero: 'DEV-001', statut: 'envoye' }), 'Télécharger le PDF du devis DEV-001');
  assert.equal(nomTelecharger({ statut: 'brouillon', objet: 'Cuisine' }), 'Télécharger le PDF brouillon du devis Cuisine');
  assert.equal(nomTelecharger({ statut: 'brouillon' }), 'Télécharger le PDF brouillon du devis sans objet');
  assert.equal(nomOuvrirPdf({ numero: 'DEV-001', statut: 'envoye' }), 'Ouvrir le PDF du devis DEV-001');
  assert.equal(nomVoir({ statut: 'brouillon' }), 'Voir le devis brouillon');
  assert.equal(libelleOuvrirPdf({ statut: 'brouillon' }), 'Ouvrir le PDF brouillon');
  assert.equal(libelleOuvrirPdf({ statut: 'envoye' }), 'Ouvrir le PDF');
});
test('2 « Voir » ouvre l’éditeur d’un brouillon et la visualisation d’un devis finalisé', () => {
  assert.equal(routeVoirDevis({ id: 'd4', statut: 'brouillon' }), 'devis/editeur/d4');
  assert.equal(routeVoirDevis({ id: 'd2', statut: 'envoye' }), 'devis/voir/d2');
});
test('8 « introuvable » se reconnaît avec ou sans le préfixe « functions/ » ; seule une adresse https se télécharge', () => {
  assert.equal(estIntrouvable({ code: 'functions/not-found' }), true);
  assert.equal(estIntrouvable({ code: 'not-found' }), true);
  assert.equal(estIntrouvable({ code: 'functions/internal' }), false);
  assert.equal(estIntrouvable(null), false);
  assert.equal(adresseTelechargeable('https://fichiers.test/a.pdf'), true);
  assert.equal(adresseTelechargeable('http://fichiers.test/a.pdf'), false);
  assert.equal(adresseTelechargeable('javascript:alert(1)'), false);
  assert.equal(adresseTelechargeable(undefined), false);
});
test('12 l’écran de l’onglet ne propose aucune suppression ni bouton jaune', () => {
  const src = readFileSync(new URL('../js/modules/devis/onglet-affaire.js', import.meta.url), 'utf8').replace(/\/\/.*$/gm, ''); // sans les commentaires
  assert.doesNotMatch(src, /supprim|archiver|corbeille/i);
  assert.doesNotMatch(src, /bouton-principal/);
});
test('13 bouton d’en-tête : « Créer un devis » sans devis, « Voir le devis » (le plus récent) sinon, rien tant que les devis ne sont pas lus', () => {
  assert.equal(actionEnteteDevis(devis, 'a1', false), null);
  assert.equal(actionEnteteDevis(devis, '', true), null);
  assert.deepEqual(actionEnteteDevis(devis, 'a1', true), { mode: 'voir', libelle: 'Voir le devis', route: 'devis/editeur/d4' }); // le plus récent est le brouillon v3
  assert.deepEqual(actionEnteteDevis(devis, 'a2', true), { mode: 'voir', libelle: 'Voir le devis', route: 'devis/editeur/d3' });
  assert.deepEqual(actionEnteteDevis(devis, 'a3', true), { mode: 'creer', libelle: 'Créer un devis' });
  assert.deepEqual(actionEnteteDevis([{ id: 'x', affaireId: 'a9', archive: true }], 'a9', true), { mode: 'creer', libelle: 'Créer un devis' }); // un archivé ne compte pas
});
