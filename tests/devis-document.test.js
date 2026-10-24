// Tests H (module Devis, document HTML imprimable) : js/modules/devis/document.js et la vue client complétée. node --test, sans navigateur.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../js/modules/devis/logique.js';
import { devisHtml, formaterMontant, ATTESTATION_TVA_REDUITE } from '../js/modules/devis/document.js';

const ctx = { maintenant: new Date('2026-10-24T10:00:00Z'), auteur: 'moi@exemple.test', nouvelId: (n) => `${n}_1` };
const reglages = { modeMarge: 'majoration', marge: 20, tauxTvaDefaut: 20, regimeTva: 'assujetti', dureeValiditeJours: 90 };
const ligne = (id, prixAchat, quantite, extra = {}) => ({ id, libelle: `Article ${id}`, unite: 'u', quantite, prixAchat, ...extra });

/** Devis finalisé d'essai : achats distinctifs (123,45 et 67,89), marge 20 % (jamais visible), deux taux de TVA. */
function devisFige(extra = {}, reg = reglages) {
  const base = {
    ...D.nouveauDevis({ affaireId: 'a1', destinataires: [{ email: 'client@exemple.test' }] }, ctx, reglages),
    objet: 'Rénovation de la toiture',
    adresses: { commanditaire: { id: 'a', texte: '1 rue du Test\n75000 Ville' }, facturation: null, chantier: { id: 'b', texte: '2 rue du Chantier' } },
    conditionsPaiement: '30 % à la commande, solde à la réception',
    modesPaiement: ['Virement bancaire', 'Chèque'],
    sections: [
      { id: 's1', titre: 'Toiture', lignes: [ligne('l1', 123.45, 3, { description: 'Dépose\net repose' }), ligne('l2', 67.89, 7, { tauxTva: 10 })] },
      { id: 's2', titre: 'Zinguerie', lignes: [ligne('l3', 10, 2), ligne('l4', 20, 1), ligne('l5', 30, 1)] },
    ],
    ...extra,
  };
  const r = D.figerPourFinalisation(base, { numero: 'DEV-2026-10-24-001', finaliseLe: '2026-10-24T10:00:00Z', reglages: reg });
  assert.deepEqual(r.erreurs, []);
  return r.devis;
}
const vueDe = (extra, reg, contexte = { clientNom: 'Mme Dupont', emetteur: { nom: 'Atelier Test', adresse: '3 rue de l\'Atelier', siret: '123 456 789 00012' } }) => D.vueClient(devisFige(extra, reg), contexte);
const cles = (o) => (Array.isArray(o) ? o.flatMap(cles) : o && typeof o === 'object' ? Object.entries(o).flatMap(([k, v]) => [k, ...cles(v)]) : []);

describe('Document HTML du devis', () => {
  test('H1 le HTML contient numéro, objet, désignations, totaux HT/TVA/TTC et tableau des taux, au format français', () => {
    const d = devisFige();
    const v = D.vueClient(d, { clientNom: 'Mme Dupont' });
    const h = devisHtml(v);
    assert.match(h, /^<!doctype html>/i);
    assert.match(h, /<meta charset="utf-8">/);
    assert.ok(h.includes('DEV-2026-10-24-001'));
    assert.ok(h.includes('Rénovation de la toiture'));
    for (const s of d.sections) for (const l of s.lignes) assert.ok(h.includes(l.libelle), l.libelle);
    const t = D.totauxDevis(d);
    assert.ok(h.includes(formaterMontant(t.ht)) && h.includes(formaterMontant(t.tva)) && h.includes(formaterMontant(t.ttc)));
    assert.ok(h.includes('Total net HT') && h.includes('Total TTC') && h.includes('Net à payer'));
    assert.ok(h.includes('Taux TVA') && h.includes('Base HT'));
    assert.ok(h.includes('10 %') && h.includes('20 %'));
    assert.ok(h.includes('24/10/2026'));
    assert.ok(h.includes('Mme Dupont'));
    assert.ok(!/<script|https?:\/\//i.test(h), 'aucun script ni ressource externe');
    assert.equal(formaterMontant(3451.63), '3 451,63 €');
    assert.equal(formaterMontant(1234567.8), '1 234 567,80 €');
    assert.equal(formaterMontant(0), '0,00 €');
    assert.equal(formaterMontant(-5), '-5,00 €');
  });

  test('H2 numérotation 1, 1.1, 1.2, 2, 2.1 et sous-totaux de section', () => {
    const d = devisFige();
    const v = D.vueClient(d);
    assert.deepEqual(v.sections.map((s) => s.numero), ['1', '2']);
    assert.deepEqual(v.sections.flatMap((s) => s.lignes.map((l) => l.numero)), ['1.1', '1.2', '2.1', '2.2', '2.3']);
    const h = devisHtml(v);
    const t = D.totauxDevis(d);
    assert.ok(h.includes(`Sous-total 1 : ${formaterMontant(t.sections[0].sousTotalHT)}`));
    assert.ok(h.includes(`Sous-total 2 : ${formaterMontant(t.sections[1].sousTotalHT)}`));
    assert.ok(h.indexOf('>1.1<') < h.indexOf('>1.2<') && h.indexOf('>1.2<') < h.indexOf('>2.1<'));
    assert.ok(h.includes('Dépose<br>et repose'), 'description sur plusieurs lignes');
  });

  test('H3 franchise : pas de tableau de TVA, mention 293 B ; autoliquidation : mention présente, TVA à 0', () => {
    const f = devisHtml(vueDe({}, { ...reglages, regimeTva: 'franchise' }));
    assert.ok(f.includes('293 B'));
    assert.ok(!f.includes('Taux TVA') && !f.includes('Total TTC'));
    assert.ok(f.includes('Net à payer'));
    const a = devisHtml(vueDe({ autoliquidation: true }));
    assert.ok(a.includes('Autoliquidation'));
    assert.ok(!a.includes('Taux TVA'));
    assert.ok(a.includes(`TVA</td><td class="d">${formaterMontant(0)}`));
  });

  test('H4 l\'attestation n\'apparaît qu\'avec une ligne à 10 % ou 5,5 % en régime assujetti', () => {
    assert.ok(devisHtml(vueDe({})).includes(ATTESTATION_TVA_REDUITE.slice(0, 60)));
    const a20 = { sections: [{ id: 's', titre: 'X', lignes: [ligne('a', 10, 1)] }] };
    assert.ok(!devisHtml(vueDe(a20)).includes('Attestation'));
    const a55 = { sections: [{ id: 's', titre: 'X', lignes: [ligne('a', 10, 1, { tauxTva: 5.5 })] }] };
    assert.ok(devisHtml(vueDe(a55)).includes('Attestation'));
    assert.ok(!devisHtml(vueDe({}, { ...reglages, regimeTva: 'franchise' })).includes('Attestation'));
    assert.ok(!devisHtml(vueDe({ autoliquidation: true })).includes('Attestation'));
  });

  test('H5 aucun prix d\'achat, marge ni coefficient dans le HTML', () => {
    const d = devisFige();
    d.sections[0].marge = 33; d.sections[0].lignes[0].marge = 44;
    const h = devisHtml(D.vueClient(d, { clientNom: 'X' })).toLowerCase();
    for (const x of ['123,45', '67,89', '123.45', '67.89', 'coefficient', 'marge', 'prixachat', 'prix d\'achat']) assert.ok(!h.includes(x), `fuite : ${x}`);
  });

  test('H6 échappement : aucune balise ni attribut injecté par une donnée', () => {
    const piege = '<script>alert(1)</script>"onload=alert(2) x=\'y\'';
    const d = devisFige({
      objet: piege,
      adresses: { commanditaire: { texte: piege }, facturation: { texte: piege }, chantier: { texte: piege } },
      conditionsPaiement: piege, modesPaiement: [piege],
      debutTravaux: piege, dureeEstimee: piege, acompte: piege,
      sections: [{ id: 's', titre: piege, lignes: [ligne('a', 10, 1, { libelle: piege, description: piege, unite: piege })] }],
    });
    const h = devisHtml(D.vueClient(d, { clientNom: piege, emetteur: { nom: piege, adresse: piege, siret: piege } }), { logo: 'data:image/png;base64,AAAA"onerror=alert(3)' });
    assert.ok(!h.includes('<script'), 'balise script');
    assert.ok(!/<img/.test(h), 'logo invalide ignoré');
    assert.ok(!/<[a-z]+[^>]*\sonload=/i.test(h));
    assert.ok(!h.includes('"onload='));
    assert.ok(h.includes('&lt;script&gt;'));
    const ok = devisHtml(D.vueClient(devisFige(), {}), { logo: 'data:image/png;base64,iVBORw0KGgo=' });
    assert.match(ok, /<img src="data:image\/png;base64,iVBORw0KGgo=" alt="">/);
  });

  test('H7 le filigrane BROUILLON n\'existe qu\'avec l\'option brouillon', () => {
    const v = D.vueClient(devisFige());
    assert.ok(devisHtml(v, { brouillon: true }).includes('class="filigrane"'));
    assert.ok(!devisHtml(v).includes('class="filigrane"'));
    assert.ok(!devisHtml(v, { brouillon: false }).includes('BROUILLON</div>'));
  });

  test('H9 vueClient : objet, numérotation, description, modesPaiement, mentionSignature, sans clé interdite', () => {
    const d = devisFige();
    d.sections[0].marge = 33;
    const v = D.vueClient(d);
    assert.equal(v.objet, 'Rénovation de la toiture');
    assert.equal(v.sections[0].lignes[0].description, 'Dépose\net repose');
    assert.equal(v.sections[0].lignes[1].description, '');
    assert.deepEqual(v.modesPaiement, ['Virement bancaire', 'Chèque']);
    assert.equal(v.conditionsPaiement, '30 % à la commande, solde à la réception');
    assert.equal(v.mentionSignature, D.MENTION_SIGNATURE);
    assert.match(v.mentionSignature, /bon pour accord/);
    assert.equal(v.attestationTvaReduite, ATTESTATION_TVA_REDUITE);
    assert.equal(D.vueClient(devisFige({ autoliquidation: true })).attestationTvaReduite, null);
    for (const k of cles(v)) assert.ok(!/marge|coefficient|prixachat/i.test(k), `clé interdite : ${k}`);
    assert.deepEqual(D.vueClient(devisFige({ modesPaiement: undefined, objet: undefined })).modesPaiement, []);
  });
});
