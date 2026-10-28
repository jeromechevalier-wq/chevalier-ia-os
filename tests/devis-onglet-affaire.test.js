// Onglet « Devis » d'une affaire : filtre, tri, libellés, compteur. Pur : aucun navigateur.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { devisDeAffaire, intituleDevis, compteurOnglet, nomVoir, routeVoirDevis, actionEnteteDevis, montantDevisDeAffaire } from '../js/modules/devis/onglet-affaire-logique.js';

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
test('6 le nom accessible du lien n’est jamais vide', () => {
  assert.equal(nomVoir({ numero: 'DEV-001', statut: 'envoye' }), 'Voir le devis DEV-001');
  assert.equal(nomVoir({ statut: 'brouillon' }), 'Voir le devis brouillon');
});
test('2 le nom du devis ouvre l’éditeur d’un brouillon et la visualisation d’un devis finalisé', () => {
  assert.equal(routeVoirDevis({ id: 'd4', statut: 'brouillon' }), 'devis/editeur/d4');
  assert.equal(routeVoirDevis({ id: 'd2', statut: 'envoye' }), 'devis/voir/d2');
});
test('12 l’écran de l’onglet ne propose de suppression que celle des brouillons (supprimerBrouillon), ni archivage ni bouton jaune', () => {
  const src = readFileSync(new URL('../js/modules/devis/onglet-affaire.js', import.meta.url), 'utf8').replace(/\/\/.*$/gm, ''); // sans les commentaires
  assert.doesNotMatch(src.replace(/supprimerBrouillon|supprimer-devis|Supprimer le brouillon|enSuppression|supprimer\(/g, ''), /supprim|corbeille/i); // seule la croix des brouillons
  assert.match(src, /brouillon \? h\('button'/); // la croix n'existe que pour un brouillon
  assert.doesNotMatch(src, /archiv/i);
  assert.doesNotMatch(src, /bouton-principal/);
});
test('13 bouton d’en-tête : « Créer un devis » sans devis, « Voir le devis » (le plus récent) sinon, rien tant que les devis ne sont pas lus', () => {
  assert.equal(actionEnteteDevis(devis, 'a1', false), null);
  assert.equal(actionEnteteDevis(devis, '', true), null);
  assert.deepEqual(actionEnteteDevis(devis, 'a1', true), { mode: 'voir', libelle: 'Voir le devis', route: 'devis/editeur/d4' }); // le plus récent est le brouillon v3
  assert.deepEqual(actionEnteteDevis(devis, 'a2', true), { mode: 'voir', libelle: 'Voir le devis', route: 'devis/editeur/d3' });
  assert.deepEqual(actionEnteteDevis(devis, 'a3', true), { mode: 'creer', libelle: 'Créer un devis' });
  assert.deepEqual(actionEnteteDevis([{ id: 'x', affaireId: 'a9', archive: true }], 'a9', true), { mode: 'creer', libelle: 'Créer un devis' }); // un archivé ne compte pas
  assert.equal(actionEnteteDevis(devis, 'a3', true, false), null); // affaire gagnée ou perdue sans devis : pas de « Créer un devis »
  assert.equal(actionEnteteDevis(devis, 'a1', true, false).mode, 'voir'); // mais « Voir le devis » reste
});

test('3b libellé d’une ligne de l’onglet : le nom remplace « Brouillon », « DEV-… – Nom » une fois numéroté, sans nom l’ancien affichage', async () => {
  const { libelleLigneDevis } = await import('../js/modules/devis/onglet-affaire-logique.js');
  assert.equal(libelleLigneDevis({ statut: 'brouillon', nom: 'Variante basse' }), 'Variante basse');
  assert.equal(libelleLigneDevis({ statut: 'brouillon', nom: 'Variante basse', objet: 'Cuisine' }), 'Variante basse – Cuisine');
  assert.equal(libelleLigneDevis({ numero: 'DEV-001', version: 2, nom: 'Été' }), 'DEV-001 v2 – Été');
  assert.equal(libelleLigneDevis({ statut: 'brouillon', objet: 'Cuisine' }), 'Brouillon – Cuisine'); // 3e ancien devis : inchangé
  assert.equal(libelleLigneDevis({ statut: 'brouillon' }), 'Brouillon');
  assert.equal(libelleLigneDevis({ numero: 'DEV-001', objet: 'Cuisine', nom: '  ' }), 'DEV-001 – Cuisine');
  assert.equal(nomVoir({ statut: 'brouillon', nom: 'Variante basse' }), 'Voir le devis Variante basse');
  assert.equal(nomVoir({ statut: 'brouillon', nom: '', objet: 'Cuisine' }), 'Voir le devis Cuisine'); // un nom effacé ('') ne masque pas l'objet
  assert.equal(nomVoir({ statut: 'brouillon', nom: ' ' }), 'Voir le devis brouillon');
});

// ---------------------------------------------------------------- montant de l'en-tête de l'affaire (nuit du 28/10/2026)
const unDevis = (id, ttc, plus = {}) => ({ id, affaireId: 'a1', statut: 'en_attente_envoi', version: 1, numero: `DEV-${id}`, creeLe: new Date(MAINT - JOUR), totaux: { ht: ttc / 1.2, ttc }, ...plus });

test('M1 sans devis (ou autre affaire), pas de montant : la fiche garde le montant estimé', () => {
  assert.equal(montantDevisDeAffaire([], 'a1'), null);
  assert.equal(montantDevisDeAffaire(undefined, 'a1'), null);
  assert.equal(montantDevisDeAffaire([unDevis('1', 100, { affaireId: 'a2' })], 'a1'), null);
  assert.equal(montantDevisDeAffaire([unDevis('1', 100)], ''), null);
});
test('M2 un seul devis : « Montant du devis », son TTC', () => {
  const m = montantDevisDeAffaire([unDevis('1', 720)], 'a1');
  assert.equal(m.libelle, 'Montant du devis');
  assert.equal(m.total, 720);
  assert.equal(m.suffixe, 'TTC');
  assert.equal(m.detail.length, 1);
});
test('M3 plusieurs devis : « Total des devis (n) » = somme des TTC, sans erreur d’arrondi', () => {
  const m = montantDevisDeAffaire([unDevis('1', 0.1), unDevis('2', 0.2), unDevis('3', 100.05)], 'a1');
  assert.equal(m.libelle, 'Total des devis (3)');
  assert.equal(m.total, 100.35);
  assert.equal(m.detail.length, 3);
});
test('M4 ne comptent pas : archivé, ancienne version (Remplacé), refusé ; un devis non finalisé compte', () => {
  const liste = [
    unDevis('1', 100, { archive: true }),
    unDevis('2', 200, { statut: 'remplace' }),
    unDevis('3', 400, { statut: 'refuse' }),
    unDevis('4', 800, { statut: 'accepte' }),
    unDevis('5', 1600, { statut: 'envoye' }),
  ];
  const m = montantDevisDeAffaire(liste, 'a1');
  assert.equal(m.total, 2400);
  assert.equal(m.libelle, 'Total des devis (2)');
  assert.equal(montantDevisDeAffaire([unDevis('1', 100, { archive: true }), unDevis('3', 400, { statut: 'refuse' })], 'a1'), null);
});
test('M5 pendant une nouvelle version (v1 envoyé + v2 brouillon, même racine) : seule la v2 compte', () => {
  const v1 = unDevis('v1', 720, { racineId: 'r', statut: 'envoye', version: 1, creeLe: new Date(MAINT - 5 * JOUR) });
  const v2 = unDevis('v2', 720, { racineId: 'r', statut: 'brouillon', version: 2, creeLe: new Date(MAINT - JOUR) });
  const m = montantDevisDeAffaire([v1, v2], 'a1');
  assert.equal(m.libelle, 'Montant du devis');
  assert.equal(m.total, 720);
  assert.equal(m.detail.length, 1);
});
