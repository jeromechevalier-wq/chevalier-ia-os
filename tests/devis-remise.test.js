// Tests R (module Devis, remise visible par le client) : logique.js et document.js. node --test, sans navigateur.
// Chaque nom commence par le numéro du critère (R1 à R10).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../js/modules/devis/logique.js';
import { devisHtml, formaterMontant } from '../js/modules/devis/document.js';

const ctx = { maintenant: new Date('2026-10-24T10:00:00Z'), auteur: 'moi@exemple.test', nouvelId: (n) => `${n}_1` };
const reglages = { modeMarge: 'majoration', marge: 0, margeDevis: 0, tauxTvaDefaut: 20, regimeTva: 'assujetti', dureeValiditeJours: 90 };
const ligne = (id, prixAchat, quantite, extra = {}) => ({ id, libelle: `Article ${id}`, unite: 'u', quantite, prixAchat, ...extra });
const devis = (lignes, extra = {}) => ({
  ...D.nouveauDevis({ affaireId: 'a1', destinataires: [{ email: 'client@exemple.test' }] }, ctx, reglages),
  sections: [{ id: 's1', titre: 'Travaux', lignes }],
  ...extra,
});
/** Total HT brut de 1200 € à 20 %. */
const simple = (extra = {}) => devis([ligne('a', 600, 2)], extra);
const figer = (d, reg = reglages) => {
  const r = D.figerPourFinalisation(d, { numero: 'DEV-2026-10-24-001', finaliseLe: '2026-10-24T10:00:00Z', reglages: reg });
  assert.deepEqual(r.erreurs, []);
  return r.devis;
};
const centimes = (x) => Math.round(x * 100);

describe('Remise', () => {
  test('R1 pourcentage simple : 10 % sur 1200 € donne brut 1200, remise 120, net 1080, TVA 216, TTC 1296', () => {
    const t = D.totauxDevis(simple({ remise: { type: 'pourcentage', valeur: 10 } }));
    assert.equal(t.totalBrutHt, 1200);
    assert.equal(t.remiseHt, 120);
    assert.equal(t.totalHt, 1080);
    assert.equal(t.ht, 1080);
    assert.deepEqual(t.tvaParTaux, [{ taux: 20, baseHT: 1080, montant: 216 }]);
    assert.equal(t.tva, 216);
    assert.equal(t.ttc, 1296);
    assert.equal(t.sections[0].sousTotalHT, 1200, 'les sous-totaux restent bruts');
  });

  test('R2 montant fixe : 200 € sur 1200 € donne net 1000, TVA 200, TTC 1200', () => {
    const t = D.totauxDevis(simple({ remise: { type: 'montant', valeur: 200 } }));
    assert.equal(t.remiseHt, 200);
    assert.equal(t.totalHt, 1000);
    assert.equal(t.tva, 200);
    assert.equal(t.ttc, 1200);
  });

  test('R3 deux taux de TVA : bases remisées au prorata, somme exacte au centime', () => {
    const d = devis([ligne('a', 600, 1), ligne('b', 400, 1, { tauxTva: 10 })], { remise: { type: 'montant', valeur: 100 } });
    const t = D.totauxDevis(d);
    assert.equal(t.totalBrutHt, 1000);
    assert.deepEqual(t.tvaParTaux, [{ taux: 20, baseHT: 540, montant: 108 }, { taux: 10, baseHT: 360, montant: 36 }]);
    assert.equal(t.tva, 144);
    assert.equal(t.ttc, 1044);
    assert.equal(centimes(t.tvaParTaux.reduce((s, x) => s + x.baseHT, 0)), centimes(t.ht));
  });

  test('R4 arrondis : l\'écart d\'un centime va sur la plus grande base, la somme reste exacte', () => {
    // Trois bases égales (10 €) et une remise de 1 € : chaque part vaut 0,333 donc 0,33 ; il reste 0,01 pour la première des plus grandes.
    const d = devis([ligne('a', 10, 1), ligne('b', 10, 1, { tauxTva: 10 }), ligne('c', 10, 1, { tauxTva: 5.5 })], { remise: { type: 'montant', valeur: 1 } });
    const t = D.totauxDevis(d);
    assert.equal(t.totalHt, 29);
    assert.equal(centimes(t.tvaParTaux.reduce((s, x) => s + x.baseHT, 0)), 2900);
    assert.deepEqual(t.tvaParTaux.map((x) => x.baseHT).sort((a, b) => a - b), [9.66, 9.67, 9.67]);
    // Une base plus grande reçoit l'écart.
    const e = devis([ligne('a', 20, 1), ligne('b', 10, 1, { tauxTva: 10 }), ligne('c', 10, 1, { tauxTva: 5.5 })], { remise: { type: 'montant', valeur: 1 } });
    const te = D.totauxDevis(e);
    assert.equal(centimes(te.tvaParTaux.reduce((s, x) => s + x.baseHT, 0)), 3900);
    assert.equal(te.tvaParTaux.find((x) => x.taux === 20).baseHT, 19.5);
    // Pourcentage avec demi-centime : 12,5 % de 0,10 € = 0,0125 donc 0,01.
    assert.equal(D.totauxDevis(devis([ligne('a', 0.1, 1)], { remise: { type: 'pourcentage', valeur: 12.5 } })).remiseHt, 0.01);
  });

  test('R5 cumul avec la marge : marge sur prix de vente 50 % puis remise 10 %', () => {
    const d = devis([ligne('a', 500, 1)], { modeMarge: 'marge_vente', marge: 50, remise: { type: 'pourcentage', valeur: 10 } });
    const t = D.totauxDevis(d);
    assert.equal(t.totalBrutHt, 1000);
    assert.equal(t.remiseHt, 100);
    assert.equal(t.totalHt, 900);
    assert.equal(t.ttc, 1080);
  });

  test('R6 validations : pourcentage hors [0 ; 100[, montant négatif ou trop grand, type inconnu, valeur non numérique', () => {
    const erreurs = (remise) => D.erreursFinalisation(simple({ remise }));
    for (const r of [{ type: 'pourcentage', valeur: -1 }, { type: 'pourcentage', valeur: 100 }, { type: 'pourcentage', valeur: 150 },
      { type: 'montant', valeur: -5 }, { type: 'montant', valeur: 1200.01 }, { type: 'cadeau', valeur: 5 }, { type: 'montant', valeur: '10' }, 'dix']) {
      assert.equal(erreurs(r).length, 1, JSON.stringify(r));
    }
    for (const r of [null, undefined, { type: 'pourcentage', valeur: 0 }, { type: 'pourcentage', valeur: 99.99 }, { type: 'montant', valeur: 1200 }]) {
      assert.deepEqual(erreurs(r), [], JSON.stringify(r));
    }
    assert.equal(D.figerPourFinalisation(simple({ remise: { type: 'montant', valeur: 5000 } }), { numero: 'N', finaliseLe: '2026-10-24T10:00:00Z', reglages }).devis, null);
  });

  test('R7 vueClient expose la remise sans fuite (prix d\'achat, marge, coefficient)', () => {
    const d = figer(devis([ligne('a', 123.45, 3)], { marge: 25, remise: { type: 'pourcentage', valeur: 10 } }));
    const v = D.vueClient(d, { clientNom: 'X' });
    assert.deepEqual(v.remise, { libelle: 'Remise 10 %', montantHt: centimes(v.totaux.totalBrutHt - v.totaux.ht) / 100 });
    assert.equal(D.vueClient(figer(simple({ remise: { type: 'montant', valeur: 50 } }))).remise.libelle, 'Remise');
    assert.equal(D.vueClient(figer(simple())).remise, undefined, 'pas de remise : pas de clé');
    const json = JSON.stringify(v);
    for (const x of ['123.45', 'prixAchat', 'marge', 'coefficient', 'modeMarge']) assert.ok(!json.includes(x), `fuite : ${x}`);
    // La remise survit au figeage et à la nouvelle version.
    assert.deepEqual(d.remise, { type: 'pourcentage', valeur: 10 });
    assert.deepEqual(D.nouvelleVersion(d, { id: 'v2', creeLe: '2026-10-25T10:00:00Z' }).remise, { type: 'pourcentage', valeur: 10 });
    assert.ok(d.totaux.remiseHt > 0);
  });

  test('R8 document HTML : avec remise (brut, remise, net, bases remisées) et sans remise', () => {
    const d = figer(devis([ligne('a', 1000, 1), ligne('b', 200, 1, { tauxTva: 10 })], { remise: { type: 'pourcentage', valeur: 10 } }));
    const h = devisHtml(D.vueClient(d));
    assert.equal(D.totauxDevis(d).remiseHt, 120);
    assert.ok(h.includes('Total HT brut') && h.includes(formaterMontant(1200)));
    assert.ok(h.includes('Remise (10 %)') && h.includes(`− ${formaterMontant(120)}`));
    assert.ok(h.includes('Total net HT') && h.includes(formaterMontant(1080)));
    assert.ok(h.indexOf('Total HT brut') < h.indexOf('Remise (10 %)') && h.indexOf('Remise (10 %)') < h.indexOf('Total net HT'));
    assert.ok(h.includes(formaterMontant(900)) && h.includes(formaterMontant(180)), 'bases remisées dans le tableau des taux');
    const sans = devisHtml(D.vueClient(figer(simple())));
    assert.ok(!sans.includes('Total HT brut') && !sans.includes('Remise') && sans.includes('Total net HT'));
    assert.ok(!devisHtml(D.vueClient(figer(simple({ remise: { type: 'montant', valeur: 50 } })))).includes('Remise ('), 'montant fixe : libellé simple');
  });

  test('R9 franchise et autoliquidation : la remise s\'applique, sans TVA', () => {
    const fr = { ...reglages, regimeTva: 'franchise' };
    const d = figer(simple({ remise: { type: 'pourcentage', valeur: 10 } }), fr);
    assert.equal(d.totaux.totalHt, 1080);
    assert.equal(d.totaux.tva, 0);
    assert.equal(d.totaux.ttc, 1080);
    const h = devisHtml(D.vueClient(d));
    assert.ok(h.includes('Remise (10 %)') && h.includes('293 B') && !h.includes('Total TTC'));
    const a = D.totauxDevis(simple({ autoliquidation: true, remise: { type: 'montant', valeur: 200 } }));
    assert.equal(a.totalHt, 1000);
    assert.equal(a.tva, 0);
    assert.equal(a.ttc, 1000);
  });

  test('R10 remise à 0 = pas de remise', () => {
    const sans = D.totauxDevis(simple());
    for (const r of [{ type: 'pourcentage', valeur: 0 }, { type: 'montant', valeur: 0 }, null]) {
      assert.deepEqual(D.totauxDevis(simple({ remise: r })), sans);
    }
    assert.equal(sans.remiseHt, 0);
    assert.equal(sans.totalBrutHt, sans.totalHt);
    assert.equal(D.vueClient(figer(simple({ remise: { type: 'pourcentage', valeur: 0 } }))).remise, undefined);
    assert.ok(!devisHtml(D.vueClient(figer(simple({ remise: { type: 'montant', valeur: 0 } })))).includes('Remise'));
  });
});

describe('R11 plus fort reste et textes lisibles', () => {
  test('R11 cinq bases égales, remise de 3 centimes : aucune base ne dépasse son brut, somme exacte', () => {
    const lignes = [1, 2, 3, 4, 5].map((n) => ({ id: `l${n}`, designation: 'x', quantite: 1, unite: 'u', prixVente: 10, tauxTva: 10 + n }));
    const t = D.totauxDevis({ statut: 'envoye', tauxTvaDefaut: 20, remise: { type: 'montant', valeur: 0.03 }, sections: [{ id: 's', lignes }] });
    assert.equal(t.remiseHt, 0.03);
    const bases = t.tvaParTaux.map((x) => x.baseHT);
    assert.ok(bases.every((b) => b <= 10 && b >= 9.99));
    assert.equal(Math.round(bases.reduce((a, b) => a + b, 0) * 100), 4997);
  });
});
