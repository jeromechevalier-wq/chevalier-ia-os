// B4 : l'aperçu de l'éditeur (htmlDuDevis) montre « À l’attention de » comme le PDF du serveur.
import test from 'node:test';
import assert from 'node:assert/strict';
import { htmlDuDevis } from '../js/modules/devis/html-devis.js';

const devis = { statut: 'brouillon', numero: null, version: 1, sections: [{ id: 's1', lignes: [{ id: 'l1', libelle: 'Carrelage', type: 'fourniture', quantite: 1, prixAchat: 80, prixVente: 100, tauxTva: 20 }] }], modeMarge: 'majoration', marge: 25, tauxTvaDefaut: 20 };

test('B4.1 attentionNom donne la ligne « À l’attention de Marie Dupont » ; sans attentionNom elle est absente', () => {
  assert.match(htmlDuDevis(devis, { clientNom: 'Société Exemple', attentionNom: 'Marie Dupont' }), /À l’attention de Marie Dupont/);
  assert.doesNotMatch(htmlDuDevis(devis, { clientNom: 'Société Exemple' }), /À l’attention de/);
  assert.doesNotMatch(htmlDuDevis(devis, { clientNom: 'Société Exemple', attentionNom: null }), /À l’attention de/);
});
