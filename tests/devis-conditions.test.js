// Tests C (module Devis, conditions de paiement) : acompte, primes, retenue de garantie, déchets, textes, saut de page.
// Calcul pur (logique.js) et gabarit (document.js). node --test, sans navigateur. Chaque nom commence par le numéro du critère (C1 à C10).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../js/modules/devis/logique.js';
import { devisHtml, formaterMontant } from '../js/modules/devis/document.js';

const ctx = { maintenant: new Date('2026-10-24T10:00:00Z'), auteur: 'moi@exemple.test', nouvelId: (n) => `${n}_1` };
const reglages = { modeMarge: 'majoration', marge: 0, tauxTvaDefaut: 20, regimeTva: 'assujetti', dureeValiditeJours: 90 };
const ligne = (id, prixAchat, quantite, extra = {}) => ({ id, libelle: `Article ${id}`, unite: 'u', quantite, prixAchat, ...extra });
/** Devis de référence : HT 3 265,81 + TVA 653,16 = TTC 3 918,97. */
const devis = (extra = {}) => ({
  ...D.nouveauDevis({ affaireId: 'a1', destinataires: [{ email: 'client@exemple.test' }] }, ctx, reglages),
  sections: [{ id: 's1', titre: 'Travaux', lignes: [ligne('a', 3265.81, 1)] }],
  ...extra,
});
const figer = (d, reg = reglages) => {
  const r = D.figerPourFinalisation(d, { numero: 'DEV-2026-10-24-001', finaliseLe: '2026-10-24T10:00:00Z', reglages: reg });
  assert.deepEqual(r.erreurs, []);
  return r.devis;
};
const html = (d, reg) => devisHtml(D.vueClient(figer(d, reg))).replace(/ /g, ' ');
const sans = (s) => s.replace(/ /g, ' ');
const acompte30 = { type: 'pourcentage', valeur: 30, moment: 'signature' };
const prime = { id: 'p1', libelle: 'Prime rénov', montant: 500 };
const retenue5 = { pourcentage: 5, echeance: '2027-10-24' };

describe('Conditions de paiement', () => {
  test('C1 exemple de référence : acompte 30 % = 1 175,69, reste 2 743,28, retenue 195,95, net 3 223,02', () => {
    const t = D.totauxDevis(devis({ acompte: acompte30, primes: [prime], retenueGarantie: retenue5 }));
    assert.equal(t.ttc, 3918.97);
    assert.equal(t.acompteTtc, 1175.69);
    assert.equal(t.resteAFacturerTtc, 2743.28);
    assert.equal(t.retenueGarantieMontant, 195.95);
    assert.equal(t.totalPrimes, 500);
    assert.equal(t.netAPayer, 3223.02);
    assert.equal(t.ht, 3265.81, 'les totaux existants ne bougent pas');
    assert.equal(t.tva, 653.16);
    const h = html(devis({ acompte: acompte30, primes: [prime], retenueGarantie: retenue5 }));
    assert.ok(h.includes('Acompte de 30,00 % à la signature soit 1 175,69 € TTC'));
    assert.ok(h.includes('Reste à facturer : 2 743,28 € TTC'));
    assert.ok(h.includes('Retenue de garantie de 5,00 % due au 24/10/2027'));
  });

  test('C2 acompte en montant : phrase sans « soit », moments, texte libre, l\'acompte ne change pas le net', () => {
    const d = devis({ acompte: { type: 'montant', valeur: 500, moment: 'debut_travaux' } });
    const t = D.totauxDevis(d);
    assert.equal(t.acompteTtc, 500);
    assert.equal(t.resteAFacturerTtc, 3418.97);
    assert.equal(t.netAPayer, t.ttc);
    const h = html(d);
    assert.ok(h.includes('Acompte de 500,00 € au début des travaux') && !h.includes('soit 500'));
    assert.ok(h.includes('Reste à facturer : 3 418,97 € TTC'));
    assert.ok(html(devis({ acompte: { ...acompte30, moment: 'mi_travaux' } })).includes('à la moitié des travaux'));
    assert.ok(html(devis({ acompte: { ...acompte30, moment: 'libre', texteMoment: 'à la livraison du bois' } })).includes('Acompte de 30,00 % à la livraison du bois soit'));
    assert.equal(D.totauxDevis(devis({ acompte: { type: 'pourcentage', valeur: 100, moment: 'signature' } })).resteAFacturerTtc, 0);
  });

  test('C3 plusieurs primes : déduites du net après le TTC, une ligne chacune', () => {
    const d = devis({ primes: [prime, { id: 'p2', libelle: 'Prime énergie', montant: 250.5 }] });
    const t = D.totauxDevis(d);
    assert.deepEqual(t.primes, [{ libelle: 'Prime rénov', montant: 500 }, { libelle: 'Prime énergie', montant: 250.5 }]);
    assert.equal(t.totalPrimes, 750.5);
    assert.equal(t.netAPayer, 3168.47);
    assert.equal(t.ttc, 3918.97, 'le TTC reste celui du devis');
    const h = html(d);
    assert.ok(h.includes('Prime rénov') && h.includes('− 500,00 €'));
    assert.ok(h.includes('Prime énergie') && h.includes('− 250,50 €'));
  });

  test('C4 retenue seule : 5 % du TTC déduits, phrase et ligne de totaux', () => {
    const d = devis({ retenueGarantie: retenue5 });
    const t = D.totauxDevis(d);
    assert.equal(t.retenueGarantieMontant, 195.95);
    assert.equal(t.netAPayer, 3723.02);
    assert.equal(t.acompteTtc, null);
    assert.equal(t.resteAFacturerTtc, null);
    const h = html(d);
    assert.ok(h.includes('Retenue de garantie 5,00 %') && h.includes('− 195,95 €'));
    assert.ok(h.includes('Retenue de garantie de 5,00 % due au 24/10/2027'));
    assert.ok(!h.includes('Acompte') && !h.includes('Reste à facturer'));
    assert.equal(D.totauxDevis(devis({ retenueGarantie: { pourcentage: 0, echeance: '2027-10-24' } })).retenueGarantieMontant, 0);
  });

  test('C5 sans condition : net = TTC, aucune clé ni ligne en plus', () => {
    const t = D.totauxDevis(devis());
    assert.equal(t.netAPayer, t.ttc);
    assert.deepEqual([t.acompteTtc, t.resteAFacturerTtc, t.primes, t.totalPrimes, t.retenueGarantieMontant], [null, null, [], 0, 0]);
    const v = D.vueClient(figer(devis()));
    for (const k of ['acompte', 'acomptes', 'primes', 'retenueGarantie', 'dechets', 'texteLibre', 'notesBasDePage']) assert.ok(!(k in v), k);
    const h = html(devis());
    for (const x of ['Acompte', 'Reste à facturer', 'Retenue', 'Gestion des déchets', 'Notes de bas de page', 'texte-libre"', 'class="bandeau saut-avant"']) assert.ok(!h.includes(x), x);
    // Franchise : le net vaut le HT.
    const f = figer(devis(), { ...reglages, regimeTva: 'franchise' });
    assert.equal(f.totaux.netAPayer, f.totaux.ht);
  });

  test('C6 validations : un message en français par cas', () => {
    const e = (extra) => D.erreursFinalisation(devis(extra));
    const un = (extra, motif) => { const r = e(extra); assert.equal(r.length, 1, JSON.stringify(extra) + JSON.stringify(r)); assert.match(r[0], motif); };
    assert.deepEqual(e({ acompte: acompte30, primes: [prime], retenueGarantie: retenue5 }), []);
    // Acompte
    un({ acompte: { ...acompte30, type: 'cadeau' } }, /pourcentage ou un montant/);
    un({ acompte: { ...acompte30, valeur: 'x' } }, /doit être un nombre/);
    un({ acompte: { ...acompte30, valeur: 0 } }, /supérieur à 0/);
    un({ acompte: { ...acompte30, valeur: 100.5 } }, /supérieur à 0 et au plus 100/);
    un({ acompte: { type: 'montant', valeur: 4000, moment: 'signature' } }, /dépasser le total TTC/);
    un({ acompte: { type: 'montant', valeur: -1, moment: 'signature' } }, /supérieur à zéro/);
    un({ acompte: { ...acompte30, moment: 'jamais' } }, /moment de l'acompte/);
    un({ acompte: { ...acompte30, moment: 'libre' } }, /texte libre/);
    // Primes
    un({ primes: [{ id: 'p', libelle: '', montant: 10 }] }, /pas de libellé/);
    un({ primes: [{ id: 'p', libelle: 'X', montant: -1 }] }, /ne peut pas être négatif/);
    un({ primes: [{ id: 'p', libelle: 'X', montant: '5' }] }, /doit être un nombre/);
    un({ primes: [{ id: 'p', libelle: 'X', montant: 1 }, { id: 'p', libelle: 'Y', montant: 1 }] }, /même identifiant/);
    un({ primes: 'oui' }, /former une liste/);
    // Retenue
    un({ retenueGarantie: { pourcentage: 100, echeance: '2027-10-24' } }, /entre 0 et 100/);
    un({ retenueGarantie: { pourcentage: -1, echeance: '2027-10-24' } }, /entre 0 et 100/);
    un({ retenueGarantie: { pourcentage: 5, echeance: '24/10/2027' } }, /date.*illisible/);
    un({ retenueGarantie: { pourcentage: 5 } }, /date.*illisible/);
    // Net négatif
    un({ primes: [{ id: 'p', libelle: 'Énorme', montant: 3900 }], retenueGarantie: retenue5 }, /net à payer serait négatif/);
    // Déchets
    un({ dechets: { types: ['radioactifs'] } }, /type de déchets est inconnu/);
    un({ dechets: { volumeMin: 10, volumeMax: 8 } }, /minimum.*dépasse/);
    un({ dechets: { volumeMin: -1 } }, /volume minimum.*positif/);
    un({ dechets: { coutTtcParM3: -5 } }, /coût.*positif/);
    un({ dechets: { unite: 'kg' } }, /unité/);
    // Textes
    un({ texteLibre: 42 }, /texte libre/);
    un({ notesBasDePage: {} }, /notes de bas de page/);
    // Une valeur invalide compte pour 0 dans les totaux.
    const t = D.totauxDevis(devis({ acompte: { ...acompte30, valeur: 'x' }, primes: [{ id: 'p', libelle: '', montant: 10 }], retenueGarantie: { pourcentage: 150, echeance: 'x' } }));
    assert.deepEqual([t.acompteTtc, t.totalPrimes, t.retenueGarantieMontant, t.netAPayer], [null, 0, 0, 3918.97]);
    assert.equal(D.figerPourFinalisation(devis({ acompte: { ...acompte30, type: 'cadeau' } }), { numero: 'N', finaliseLe: '2026-10-24T10:00:00Z', reglages }).devis, null);
  });

  test('C7 vue client sans fuite : aucune clé de marge, prix d\'achat ou coefficient, libellés prêts à imprimer', () => {
    const d = figer(devis({
      marge: 25, sections: [{ id: 's1', titre: 'T', lignes: [ligne('a', 123.45, 3, { marge: 40 })] }],
      acompte: acompte30, primes: [prime], retenueGarantie: retenue5, texteLibre: 'Merci', notesBasDePage: '(1) note',
      dechets: { types: ['inertes', 'dangereux'], pointCollecte: 'Déchetterie, 1 rue X', volumeMin: 8, volumeMax: 10, unite: 'm3', coutTtcParM3: 400 },
    }));
    const v = D.vueClient(d, { clientNom: 'X' });
    const json = JSON.stringify(v);
    for (const x of ['123.45', 'prixAchat', 'marge', 'coefficient', 'modeMarge']) assert.ok(!json.includes(x), `fuite : ${x}`);
    assert.match(sans(v.acompte.libelle), /^Acompte de 30,00 % à la signature soit \d[\d ]*,\d\d € TTC$/);
    assert.match(sans(v.retenueGarantie.phrase), /^Retenue de garantie de 5,00 % due au 24\/10\/2027$/);
    assert.deepEqual(v.primes, [{ libelle: 'Prime rénov', montant: 500 }]);
    assert.equal(v.totaux.netAPayer, d.totaux.netAPayer);
    assert.equal(Math.round(v.totaux.resteAFacturerTtc * 100), Math.round((d.totaux.ttc - d.totaux.acompteTtc) * 100));
    assert.deepEqual(v.dechets.lignes.map(sans), [
      'Type de déchets collectés : Déchets inertes, Déchets dangereux', 'Point de collecte : Déchetterie, 1 rue X',
      'Volume estimé entre 8 et 10 m³', 'Coûts associés de 400,00 € TTC par m³']);
    assert.equal(v.texteLibre, 'Merci');
    assert.equal(v.notesBasDePage, '(1) note');
  });

  test('C8 HTML : ordre des lignes de totaux, texte libre échappé, déchets partiels, notes, saut de page', () => {
    const d = devis({ primes: [prime], retenueGarantie: retenue5, acompte: acompte30 });
    const h = html(d);
    const ordre = ['Total net HT', 'TVA', 'Total TTC', 'Prime rénov', 'Retenue de garantie 5,00 %', 'Net à payer'].map((x) => h.indexOf(`<td>${x}</td>`));
    assert.ok(ordre.every((n) => n > 0), JSON.stringify(ordre));
    assert.deepEqual([...ordre].sort((a, b) => a - b), ordre);
    assert.ok(h.includes('3 223,02 €'));
    // Texte libre échappé, saut de ligne en <br>, avant les déchets et les notes.
    const piege = '<script>alert(1)</script>\nligne 2';
    const e = html(devis({ texteLibre: piege, notesBasDePage: '<b>note</b>', dechets: { pointCollecte: '<i>Dépôt</i>' }, acompte: { ...acompte30, moment: 'libre', texteMoment: '<img src=x>' } }));
    assert.ok(!e.includes('<script') && !e.includes('<b>note') && !e.includes('<i>Dépôt') && !e.includes('<img src=x'));
    assert.ok(e.includes('&lt;script&gt;alert(1)&lt;/script&gt;<br>ligne 2'));
    assert.ok(e.indexOf('texte-libre"') < e.indexOf('Gestion des déchets') && e.indexOf('Gestion des déchets') < e.indexOf('Notes de bas de page'));
    // Déchets partiels : seules les lignes renseignées.
    const p = html(devis({ dechets: { volumeMin: 8, volumeMax: 10, unite: 'm3' } }));
    assert.ok(p.includes('Gestion des déchets') && p.includes('Volume estimé entre 8 et 10 m³'));
    assert.ok(!p.includes('Type de déchets') && !p.includes('Point de collecte') && !p.includes('Coûts associés'));
    assert.ok(!html(devis({ dechets: { types: [] } })).includes('Gestion des déchets'), 'rien de renseigné : pas de bloc');
    assert.ok(html(devis({ dechets: { types: ['inertes', 'non_dangereux', 'specifiques'] } })).includes('Déchets inertes, Déchets non dangereux et non inertes, Déchets spécifiques'));
    // Saut de page : sur les sections suivantes seulement.
    const deux = devis({ sections: [
      { id: 's1', titre: 'Un', sautDePageAvant: true, lignes: [ligne('a', 10, 1)] },
      { id: 's2', titre: 'Deux', sautDePageAvant: true, lignes: [ligne('b', 10, 1)] },
      { id: 's3', titre: 'Trois', lignes: [ligne('c', 10, 1)] },
    ] });
    const s = devisHtml(D.vueClient(figer(deux)));
    assert.equal((s.match(/class="bandeau saut-avant"/g) ?? []).length, 1);
    assert.ok(s.includes('break-before: page'));
    assert.ok(s.indexOf('class="bandeau saut-avant"') > s.indexOf('>Un<') && s.indexOf('class="bandeau saut-avant"') < s.indexOf('>Deux<'));
    // Franchise / autoliquidation : tout fonctionne pareil, sans TVA.
    const fr = html(devis({ primes: [prime], retenueGarantie: retenue5 }), { ...reglages, regimeTva: 'franchise' });
    assert.ok(fr.includes('Prime rénov') && fr.includes('Net à payer') && !fr.includes('Total TTC'));
    const al = D.totauxDevis(devis({ autoliquidation: true, primes: [prime] }));
    assert.equal(al.netAPayer, al.ttc - 500);
    assert.equal(formaterMontant(1175.69), '1 175,69 €');
  });

  test('C9 nouvelle version et figeage conservent les champs', () => {
    const d = figer(devis({
      acompte: acompte30, primes: [prime], retenueGarantie: retenue5, texteLibre: 'T', notesBasDePage: 'N',
      dechets: { types: ['inertes'] }, sections: [{ id: 's1', titre: 'A', sautDePageAvant: true, lignes: [ligne('a', 3265.81, 1)] }],
    }));
    const n = D.nouvelleVersion(d, { id: 'v2', creeLe: '2026-10-25T10:00:00Z' });
    for (const k of ['acompte', 'acomptes', 'primes', 'retenueGarantie', 'texteLibre', 'notesBasDePage', 'dechets']) assert.deepEqual(n[k], d[k], k);
    assert.equal(n.sections[0].sautDePageAvant, true);
    assert.equal(d.totaux.netAPayer, 3223.02);
    assert.equal(D.totauxDevis(n).netAPayer, 3223.02);
  });

  test('C10 cumul avec une remise : acompte, primes et retenue se calculent sur le TTC après remise', () => {
    // HT brut 1000, remise 10 % = 900, TVA 180, TTC 1080.
    const d = devis({
      sections: [{ id: 's1', titre: 'T', lignes: [ligne('a', 1000, 1)] }], remise: { type: 'pourcentage', valeur: 10 },
      acompte: { type: 'pourcentage', valeur: 30, moment: 'signature' }, primes: [{ id: 'p', libelle: 'Aide', montant: 80 }], retenueGarantie: { pourcentage: 5, echeance: '2027-01-01' },
    });
    const t = D.totauxDevis(d);
    assert.equal(t.ttc, 1080);
    assert.equal(t.acompteTtc, 324);
    assert.equal(t.resteAFacturerTtc, 756);
    assert.equal(t.retenueGarantieMontant, 54);
    assert.equal(t.netAPayer, 946);
    const h = html(d);
    assert.ok(h.includes('Remise (10 %)') && h.indexOf('Remise (10 %)') < h.indexOf('<td>Aide</td>') && h.indexOf('<td>Aide</td>') < h.indexOf('Net à payer'));
    assert.deepEqual(D.erreursFinalisation(d), []);
  });
});

describe('C11 relecture : texte lisible, pourcentages, retenue sans date', () => {
  test('C11 le texte « tel qu\'envoyé » reprend primes, retenue, net à payer et acompte', () => {
    const s = D.texteVueClient(figer(devis({ acompte: acompte30, primes: [prime], retenueGarantie: retenue5 })));
    for (const x of ['Prime Prime rénov', 'Retenue de garantie', 'Net à payer', 'Acompte', 'Reste à facturer']) assert.ok(s.includes(x), x);
  });
  test('C11 un pourcentage à 3 décimales est arrondi à 2 avant le calcul (33,333 % = 33,33 %)', () => {
    const t = D.totauxDevis(devis({ acompte: { type: 'pourcentage', valeur: 33.333, moment: 'signature' } }));
    assert.equal(t.acompteTtc, 1306.19);
  });
  test('C11 retenue à 0 % sans date acceptée ; avec un pourcentage, la date reste obligatoire', () => {
    const base = { ...devis(), statut: 'brouillon' };
    const ok = D.erreursFinalisation({ ...base, retenueGarantie: { pourcentage: 0 } }, reglages);
    assert.ok(!ok.some((m) => /retenue/i.test(m)));
    const ko = D.erreursFinalisation({ ...base, retenueGarantie: { pourcentage: 5 } }, reglages);
    assert.ok(ko.some((m) => /retenue/i.test(m)));
  });
  test('C11 une prime de 0,004 € n\'est pas listée', () => {
    assert.deepEqual(D.totauxDevis(devis({ primes: [{ id: 'p', libelle: 'Mini', montant: 0.004 }] })).primes, []);
  });
});

describe('C12 plusieurs acomptes (devis.acomptes) : liste, centimes exacts, refus, impression', () => {
  const franchise = (extra = {}) => devis({ regimeTva: 'franchise', sections: [{ id: 's1', titre: 'T', lignes: [ligne('a', 100.01, 1)] }], ...extra });
  const centimes = (n) => Math.round(n * 100);

  test('C12 listeAcomptes : acomptes (même vide) d\'abord, sinon l\'ancien acompte converti, sinon []', () => {
    assert.deepEqual(D.listeAcomptes(devis()), []);
    assert.deepEqual(D.listeAcomptes(devis({ acompte: acompte30 })), [acompte30]);
    assert.deepEqual(D.listeAcomptes(devis({ acompte: { type: 'montant', valeur: 500, moment: 'signature' } })), [{ type: 'montantTtc', valeur: 500, moment: 'signature' }]);
    const liste = [{ type: 'montantHt', valeur: 100, moment: 'signature' }];
    assert.deepEqual(D.listeAcomptes(devis({ acomptes: liste, acompte: acompte30 })), liste);
    assert.deepEqual(D.listeAcomptes(devis({ acomptes: [], acompte: acompte30 })), []); // la nouvelle liste (même vide) l'emporte sur l'ancien champ
    assert.deepEqual(D.listeAcomptes(null), []);
  });

  test('C12 un seul ancien acompte s\'imprime exactement comme avant (phrase, reste) et sa liste donne le même résultat', () => {
    const ancien = devis({ acompte: acompte30 });
    const nouveau = devis({ acomptes: [acompte30], acompte: null });
    for (const d of [ancien, nouveau]) {
      const v = D.vueClient(figer(d));
      assert.equal(sans(v.acompte.libelle), 'Acompte de 30,00 % à la signature soit 1 175,69 € TTC');
      assert.equal(sans(v.acompte.libelleReste), 'Reste à facturer : 2 743,28 € TTC');
      assert.equal(v.acomptes.length, 1);
      assert.equal(sans(v.conditions.acompte), 'Acompte de 30,00 % à la signature soit 1 175,69 € TTC');
      assert.equal(D.totauxDevis(d).acompteTtc, 1175.69);
    }
    assert.equal(html(ancien), html(nouveau));
    const montant = D.vueClient(figer(devis({ acompte: { type: 'montant', valeur: 500, moment: 'debut_travaux' } })));
    assert.equal(sans(montant.acompte.libelle), 'Acompte de 500,00 € au début des travaux');
  });

  test('C12 sans acompte : liste vide, aucune clé dans la vue client, aucune phrase imprimée', () => {
    const d = devis({ acomptes: [] });
    const t = D.totauxDevis(d);
    assert.deepEqual([t.acompteTtc, t.resteAFacturerTtc, t.acomptesTtc], [null, null, []]);
    const v = D.vueClient(figer(d));
    assert.ok(!('acompte' in v) && !('acomptes' in v));
    assert.ok(!html(d).includes('Acompte') && !html(d).includes('Reste à facturer'));
    assert.deepEqual(D.erreursAcomptes([], t), []);
  });

  test('C12 deux acomptes de types différents : une phrase chacun, la somme et le reste exacts', () => {
    const d = devis({ acomptes: [
      { type: 'pourcentage', valeur: 30, moment: 'signature' },
      { type: 'montantHt', valeur: 500, moment: 'debut_travaux' },
      { type: 'montantTtc', valeur: 100, moment: 'libre', texteMoment: 'à la livraison' },
    ] });
    const t = D.totauxDevis(d);
    assert.deepEqual(t.acomptesTtc, [1175.69, 600, 100]);
    assert.equal(t.acompteTtc, 1875.69);
    assert.equal(t.resteAFacturerTtc, 2043.28);
    const v = D.vueClient(figer(d));
    assert.deepEqual(v.acomptes.map((a) => sans(a.libelle)), [
      'Acompte de 30,00 % à la signature soit 1 175,69 € TTC',
      'Acompte de 500,00 € HT au début des travaux soit 600,00 € TTC',
      'Acompte de 100,00 € à la livraison',
    ]);
    assert.equal(sans(v.acompte.libelle), 'Acompte de 30,00 % à la signature soit 1 175,69 € TTC'); // le singulier = le premier
    assert.equal(sans(v.conditions.acompte).split(' ; ').length, 3);
    assert.deepEqual(v.totaux.acomptesTtc, [1175.69, 600, 100]);
    const h = html(d);
    for (const x of ['Acompte de 30,00 % à la signature', 'Acompte de 500,00 € HT au début des travaux soit 600,00 € TTC', 'Acompte de 100,00 € à la livraison', 'Reste à facturer : 2 043,28 € TTC']) assert.ok(h.includes(x), x);
    assert.ok(h.indexOf('Acompte de 30,00') < h.indexOf('Acompte de 500,00') && h.indexOf('Acompte de 500,00') < h.indexOf('Reste à facturer'));
    const texte = D.texteVueClient(figer(d));
    assert.equal(texte.split('\n').filter((l) => l.startsWith('Acompte : ')).length, 3);
    assert.ok(texte.includes('Reste à facturer : 2043,28 €'));
  });

  test('C12 € HT : converti en TTC par le rapport Total TTC / Total HT net (arrondi au centime) ; en franchise ou devis vide le rapport vaut 1', () => {
    const d = devis({ acomptes: [{ type: 'montantHt', valeur: 100, moment: 'signature' }], remise: { type: 'montant', valeur: 65.81 } }); // HT net 3200, TTC 3840
    assert.equal(D.totauxDevis(d).ttc, 3840);
    assert.deepEqual(D.totauxDevis(d).acomptesTtc, [120]);
    const f = franchise({ acomptes: [{ type: 'montantHt', valeur: 40.5, moment: 'signature' }] });
    assert.deepEqual(D.totauxDevis(f).acomptesTtc, [40.5]);
    assert.equal(sans(D.vueClient(figer(f, { ...reglages, regimeTva: 'franchise' })).acompte.libelle), 'Acompte de 40,50 € à la signature'); // franchise : ni HT ni TTC
    const vide = devis({ sections: [], acomptes: [{ type: 'montantHt', valeur: 10, moment: 'signature' }] });
    assert.deepEqual(D.totauxDevis(vide).acomptesTtc, []);
  });

  test('C12 centimes exacts : 33,33 % + 33,33 % + 33,34 % de 100,01 € font exactement 100,01 € (le dernier absorbe)', () => {
    const d = franchise({ acomptes: [33.33, 33.33, 33.34].map((valeur) => ({ type: 'pourcentage', valeur, moment: 'signature' })) });
    const t = D.totauxDevis(d);
    assert.equal(t.ttc, 100.01);
    assert.deepEqual(t.acomptesTtc, [33.33, 33.33, 33.35]);
    assert.equal(t.acompteTtc, 100.01);
    assert.equal(t.resteAFacturerTtc, 0);
    assert.deepEqual(D.erreursAcomptes(d.acomptes, t), []);
    // Deux fois 50 % de 100,01 : 50,01 + 50,00 (jamais 100,02 au-dessus du TTC).
    const moitie = franchise({ acomptes: [50, 50].map((valeur) => ({ type: 'pourcentage', valeur, moment: 'signature' })) });
    assert.deepEqual(D.totauxDevis(moitie).acomptesTtc, [50.01, 50]);
    assert.equal(D.totauxDevis(moitie).resteAFacturerTtc, 0);
  });

  test('C12 trois acomptes en % sur un total TTC non rond : la somme ne dépasse jamais le TTC, et fait le TTC quand les % font 100', () => {
    for (const [a, b, c] of [[33, 33, 34], [10, 20, 70], [25, 25, 50], [33.33, 33.33, 33.33], [1, 1, 98], [99.99, 0.01, 0]]) {
      const liste = [a, b, c].filter((x) => x > 0).map((valeur) => ({ type: 'pourcentage', valeur, moment: 'signature' }));
      const d = devis({ acomptes: liste });
      const t = D.totauxDevis(d);
      const somme = t.acomptesTtc.reduce((s, x) => s + centimes(x), 0);
      assert.ok(somme <= centimes(t.ttc), `${a}/${b}/${c}`);
      assert.equal(centimes(t.acompteTtc), somme);
      assert.equal(centimes(t.resteAFacturerTtc), centimes(t.ttc) - somme);
      if (Math.round((a + b + c) * 100) === 10000) assert.equal(somme, centimes(t.ttc), `${a}/${b}/${c} fait 100 %`);
    }
  });

  test('C12 refus : somme au-dessus du TTC, somme des % au-dessus de 100, valeur ≤ 0, % > 100, moment libre sans texte, type inconnu', () => {
    const t = D.totauxDevis(devis()); // TTC 3 918,97
    const ou = (liste) => D.erreursAcomptes(liste, t);
    const pct = (valeur, extra = {}) => ({ type: 'pourcentage', valeur, moment: 'signature', ...extra });
    assert.deepEqual(ou([pct(60), pct(40)]), []);
    assert.deepEqual(ou([pct(60), pct(50)]).map((e) => e.index), [1]);
    assert.match(ou([pct(60), pct(50)])[0].message, /somme des acomptes dépasse 100 %/);
    assert.match(ou([{ type: 'montantTtc', valeur: 3000, moment: 'signature' }, { type: 'montantTtc', valeur: 1000, moment: 'signature' }])[0].message, /somme des acomptes dépasse le total TTC/);
    assert.match(ou([{ type: 'montantTtc', valeur: 4000, moment: 'signature' }])[0].message, /ne peut pas dépasser le total TTC/);
    assert.match(ou([{ type: 'montantHt', valeur: 3300, moment: 'signature' }])[0].message, /ne peut pas dépasser le total TTC/); // 3 300 HT font 3 960 TTC
    assert.match(ou([pct(0)])[0].message, /supérieur à 0 et au plus 100/);
    assert.match(ou([pct(-5)])[0].message, /supérieur à 0 et au plus 100/);
    assert.match(ou([pct(100.5)])[0].message, /supérieur à 0 et au plus 100/);
    assert.match(ou([{ type: 'montantHt', valeur: 0, moment: 'signature' }])[0].message, /supérieur à zéro/);
    assert.match(ou([pct(NaN)])[0].message, /doit être un nombre/);
    assert.match(ou([pct(null)])[0].message, /doit être un nombre/);
    assert.match(ou([pct(10, { moment: 'libre' })])[0].message, /texte libre/);
    assert.match(ou([pct(10, { moment: 'libre', texteMoment: '  ' })])[0].message, /texte libre/);
    assert.match(ou([pct(10, { moment: 'jamais' })])[0].message, /moment de l'acompte/);
    assert.match(ou([{ type: 'cadeau', valeur: 10, moment: 'signature' }])[0].message, /pourcentage ou un montant/);
    assert.deepEqual(ou([pct(10), pct(0)]).map((e) => e.index), [1]); // une seule erreur, sur la bonne ligne
  });

  test('C12 la finalisation refuse des acomptes au-dessus du TTC et nomme l\'acompte (« Acompte n° 2 : … »)', () => {
    const base = { ...devis(), statut: 'brouillon' };
    const ko = D.erreursFinalisation({ ...base, acomptes: [{ type: 'montantTtc', valeur: 3000, moment: 'signature' }, { type: 'montantTtc', valeur: 1000, moment: 'signature' }] }, reglages);
    assert.ok(ko.some((m) => m.startsWith('Acompte n° 2 : ') && /dépasse le total TTC/.test(m)), ko.join(' | '));
    assert.equal(D.figerPourFinalisation({ ...base, acomptes: [{ type: 'pourcentage', valeur: 70, moment: 'signature' }, { type: 'pourcentage', valeur: 70, moment: 'signature' }] }, { numero: 'N', finaliseLe: '2026-10-24T10:00:00Z', reglages }).devis, null);
    assert.deepEqual(D.erreursFinalisation({ ...base, acomptes: [{ type: 'pourcentage', valeur: 30, moment: 'signature' }, { type: 'montantHt', valeur: 500, moment: 'mi_travaux' }] }, reglages), []);
    assert.ok(D.erreursFinalisation({ ...base, acomptes: 'x' }, reglages).some((m) => /doivent former une liste/.test(m)));
  });

  test('C12 detailAcomptes : un montant TTC par acompte, dans l\'ordre ; null pour un acompte illisible', () => {
    const d = devis({ acomptes: [acompte30, { type: 'pourcentage', valeur: 'x', moment: 'signature' }, { type: 'montantTtc', valeur: 100, moment: 'signature' }] });
    assert.deepEqual(D.detailAcomptes(d).map((x) => x.montantTtc), [1175.69, null, 100]);
  });

  test('C12 nouvelle version et figeage conservent la liste des acomptes', () => {
    const d = figer(devis({ acomptes: [acompte30, { type: 'montantHt', valeur: 500, moment: 'mi_travaux' }] }));
    const n = D.nouvelleVersion(d, { id: 'v2', creeLe: '2026-10-25T10:00:00Z' });
    assert.deepEqual(n.acomptes, d.acomptes);
    assert.deepEqual(D.totauxDevis(n).acomptesTtc, [1175.69, 600]);
    assert.deepEqual(d.totaux.acomptesTtc, [1175.69, 600]);
  });
});
