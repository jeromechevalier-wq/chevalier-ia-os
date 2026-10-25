// Pastille « état du devis » sur la carte d'affaire : choix du devis le plus récent, texte, cas vide. Pur : aucun navigateur.
import test from 'node:test';
import assert from 'node:assert/strict';
import { devisRecentDeAffaire, pastilleDevisDeAffaire, texteEnvoye } from '../js/modules/devis/pastille-affaire.js';

const JOUR = 86400000;
const MAINT = Date.parse('2026-10-25T10:00:00Z');
const devis = [
  { id: 'd1', affaireId: 'a1', statut: 'remplace', version: 1, creeLe: new Date(MAINT - 20 * JOUR) },
  { id: 'd2', affaireId: 'a1', statut: 'envoye', version: 2, creeLe: new Date(MAINT - 10 * JOUR), envoyeLe: new Date(MAINT - 3 * JOUR), expireLe: '2026-12-31' },
  { id: 'd3', affaireId: 'a2', statut: 'brouillon', version: 1, creeLe: new Date(MAINT - 1 * JOUR) },
];
const opts = { aujourdhui: '2026-10-25', maintenantMs: MAINT };

test('1 la pastille montre le devis le plus récent de l’affaire (une version remplacée est ignorée)', () => {
  assert.equal(devisRecentDeAffaire(devis, 'a1').id, 'd2');
  assert.equal(devisRecentDeAffaire([...devis, { id: 'd4', affaireId: 'a1', statut: 'brouillon', version: 3, creeLe: new Date(MAINT) }], 'a1').id, 'd4');
});

test('2 un devis envoyé dit « il y a N jours » (aujourd’hui, 1 jour, N jours)', () => {
  assert.equal(pastilleDevisDeAffaire(devis, 'a1', opts).texte, 'Devis : Envoyé il y a 3 jours');
  assert.equal(texteEnvoye(new Date(MAINT - 1 * JOUR), MAINT), 'Envoyé il y a 1 jour');
  assert.equal(texteEnvoye(new Date(MAINT - 3600000), MAINT), 'Envoyé aujourd’hui');
  assert.equal(texteEnvoye(new Date(MAINT + JOUR), MAINT), 'Envoyé aujourd’hui');
  assert.equal(texteEnvoye(null, MAINT), 'Envoyé');
});

test('3 un brouillon, un devis finalisé, signé et expiré utilisent les libellés du module Devis', () => {
  assert.equal(pastilleDevisDeAffaire(devis, 'a2', opts).texte, 'Devis : Brouillon');
  const un = (statut, extra = {}) => pastilleDevisDeAffaire([{ id: 'x', affaireId: 'z', statut, creeLe: new Date(MAINT), ...extra }], 'z', opts).texte;
  assert.equal(un('en_attente_envoi'), 'Devis : Finalisé');
  assert.equal(un('accepte'), 'Devis : Signé');
  assert.equal(un('refuse'), 'Devis : Refusé');
  assert.equal(un('envoye', { expireLe: '2026-10-01', envoyeLe: new Date(MAINT) }), 'Devis : Expiré');
});

test('4 cas vide : pas de devis, pas d’affaire ou liste absente = aucune pastille', () => {
  assert.equal(pastilleDevisDeAffaire(devis, 'a-sans-devis', opts), null);
  assert.equal(pastilleDevisDeAffaire(devis, null, opts), null);
  assert.equal(pastilleDevisDeAffaire(undefined, 'a1', opts), null);
  assert.equal(pastilleDevisDeAffaire([{ id: 'r', affaireId: 'a9', statut: 'remplace' }], 'a9', opts), null);
  assert.equal(pastilleDevisDeAffaire([{ id: 'x', affaireId: 'a9', statut: 'brouillon', archive: true }], 'a9', opts), null); // un devis archivé n’est pas montré
});

test('5 module éteint = aucun fournisseur inscrit = aucune pastille ; retirer le fournisseur retire la pastille', async () => {
  const P = await import('../js/modules/crm/pastilles-externes.js');
  assert.deepEqual(P.pastillesDeAffaire('a1'), []);
  let appels = 0;
  const retirer = P.inscrirePastilleAffaire((id) => (id === 'a1' ? { texte: 'Devis : Brouillon', couleur: '#8d8993', statut: 'brouillon' } : null));
  const arret = P.surChangementPastilles(() => { appels += 1; });
  assert.equal(P.pastillesDeAffaire('a1').length, 1);
  assert.deepEqual(P.pastillesDeAffaire('a2'), []);
  P.signaler();
  assert.equal(appels, 1);
  retirer(); arret();
  assert.deepEqual(P.pastillesDeAffaire('a1'), []);
});

test('6 la pastille porte le lien du devis (elle l\'ouvre en un clic)', () => {
  const p = pastilleDevisDeAffaire([{ id: 'dv9', affaireId: 'a1', statut: 'brouillon', creeLe: new Date(MAINT) }], 'a1', opts);
  assert.equal(p.lien, 'devis/editeur/dv9');
});

test('6b un devis finalisé s\'ouvre en visualisation (jamais en édition)', () => {
  const p = pastilleDevisDeAffaire([{ id: 'dv9', affaireId: 'a1', statut: 'envoye', creeLe: new Date(MAINT) }], 'a1', opts);
  assert.equal(p.lien, 'devis/voir/dv9');
});
