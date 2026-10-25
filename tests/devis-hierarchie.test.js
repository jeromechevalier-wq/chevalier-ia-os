// Devis : trois niveaux (section 1, sous-section 1.1, ligne 1.1.1). Logique pure, node --test, sans navigateur.
// Chaque test commence par le numéro du critère (N1 à N8). Les anciens devis (sans `niveau`) doivent rester exactement comme avant.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as D from '../js/modules/devis/logique.js';
import * as Ed from '../js/modules/devis/editeur-logique.js';
import { devisHtml } from '../js/modules/devis/document.js';

const L = (id, extra = {}) => ({ id, libelle: `Ligne ${id}`, quantite: 1, unite: 'u', prixAchat: 10, marge: 0, ...extra });
const devisDe = (sections, extra = {}) => ({ id: 'd1', statut: 'brouillon', modeMarge: 'majoration', marge: 0, tauxTvaDefaut: 20, regimeTva: 'assujetti', sections, ...extra });
const ids = (sections) => Ed.aplatir(sections).map((e) => e.id);
const suite = () => { let n = 0; return () => `n${++n}`; };

// Salle (1) : une ligne « a » posée directement, une sous-section « Bar » (b1, b2), une sous-section « Étage » (c1), puis une section « Cuisine » (2) avec « d ».
const arbre = () => [
  { id: 's1', titre: 'Salle', lignes: [L('a')] },
  { id: 'ss1', titre: 'Bar', niveau: 2, lignes: [L('b1'), L('b2', { quantite: 2 })] },
  { id: 'ss2', titre: 'Étage', niveau: 2, lignes: [L('c1', { prixAchat: 100 })] },
  { id: 's2', titre: 'Cuisine', lignes: [L('d')] },
];

describe('N1 numérotation à trois niveaux', () => {
  test('N1 section « 1 », sous-section « 1.2 », ligne « 1.2.1 » ; la ligne posée avant la première sous-section et les sous-sections partagent le compteur', () => {
    const n = Ed.numerotation(arbre());
    assert.deepEqual([n.s1, n.a, n.ss1, n.b1, n.b2, n.ss2, n.c1, n.s2, n.d], ['1', '1.1', '1.2', '1.2.1', '1.2.2', '1.3', '1.3.1', '2', '2.1']);
  });
  test('N1 un devis sans `niveau` garde sa numérotation d’avant (1, 1.1, 1.2, 2, 2.1)', () => {
    const n = Ed.numerotation([{ id: 's1', titre: 'A', lignes: [L('a'), L('b')] }, { id: 's2', titre: 'B', lignes: [L('c')] }]);
    assert.deepEqual([n.s1, n.a, n.b, n.s2, n.c], ['1', '1.1', '1.2', '2', '2.1']);
  });
  test('N1 la vue client porte les mêmes numéros et marque les sous-sections', () => {
    const v = D.vueClient(devisDe(arbre()), {});
    assert.deepEqual(v.sections.map((s) => s.numero), ['1', '1.2', '1.3', '2']);
    assert.deepEqual(v.sections.map((s) => s.niveau ?? 1), [1, 2, 2, 1]);
    assert.deepEqual(v.sections[1].lignes.map((l) => l.numero), ['1.2.1', '1.2.2']);
  });
});

describe('N2 sous-totaux', () => {
  test('N2 le sous-total d’une section de niveau 1 compte ses lignes et celles de ses sous-sections ; le total du devis ne compte rien deux fois', () => {
    const t = D.totauxDevis(devisDe(arbre()));
    const parId = Object.fromEntries(t.sections.map((s) => [s.id, s.sousTotalHT]));
    assert.deepEqual(parId, { s1: 10 + 10 + 20 + 100, ss1: 30, ss2: 100, s2: 10 });
    assert.equal(t.totalBrutHt, 140 + 10);
  });
  test('N2 sans sous-section, chaque sous-total reste celui de ses lignes', () => {
    const t = D.totauxDevis(devisDe([{ id: 's1', titre: 'A', lignes: [L('a'), L('b')] }, { id: 's2', titre: 'B', lignes: [L('c')] }]));
    assert.deepEqual(t.sections.map((s) => s.sousTotalHT), [20, 10]);
  });
});

describe('N3 déplacements', () => {
  test('N3 une section de niveau 1 se déplace avec ses sous-sections et leurs lignes', () => {
    assert.deepEqual(ids(Ed.deplacerElement(arbre(), 's1', 1)), ['s2', 'd', 's1', 'a', 'ss1', 'b1', 'b2', 'ss2', 'c1']);
    assert.deepEqual(ids(Ed.deplacerElement(arbre(), 's2', -1)), ['s2', 'd', 's1', 'a', 'ss1', 'b1', 'b2', 'ss2', 'c1']);
  });
  test('N3 une sous-section passe au-dessus ou au-dessous de sa sœur, jamais hors de sa section', () => {
    assert.deepEqual(ids(Ed.deplacerElement(arbre(), 'ss2', -1)), ['s1', 'a', 'ss2', 'c1', 'ss1', 'b1', 'b2', 's2', 'd']);
    assert.deepEqual(ids(Ed.deplacerElement(arbre(), 'ss1', 1)), ['s1', 'a', 'ss2', 'c1', 'ss1', 'b1', 'b2', 's2', 'd']);
    assert.deepEqual(ids(Ed.deplacerElement(arbre(), 'ss1', -1)), ids(arbre())); // la première sous-section reste sous sa section
    assert.deepEqual(ids(Ed.deplacerElement(arbre(), 'ss2', 1)), ids(arbre())); // la dernière aussi
    assert.deepEqual(Ed.deplacementsPossibles(arbre(), 'ss1'), { monter: false, descendre: true });
    assert.deepEqual(Ed.deplacementsPossibles(arbre(), 'ss2'), { monter: true, descendre: false });
  });
  test('N3 supprimer et dupliquer une section de niveau 1 emportent ses sous-sections ; le compte de lignes aussi', () => {
    assert.equal(Ed.lignesEmportees(arbre(), 's1'), 4);
    assert.deepEqual(ids(Ed.supprimerElement(arbre(), 's1')), ['s2', 'd']);
    assert.deepEqual(ids(Ed.supprimerElement(arbre(), 'ss1')), ['s1', 'a', 'ss2', 'c1', 's2', 'd']);
    const r = Ed.dupliquerElement(arbre(), 's1', suite());
    assert.equal(r.ids.length, 7);
    assert.deepEqual(Ed.aplatir(r.sections).map((e) => e.niveau ?? 1).slice(7, 14), [1, 1, 2, 1, 1, 2, 1]); // la copie garde les niveaux
  });
});

describe('N4 ajout', () => {
  test('N4 une sous-section sans section avant elle reçoit une section de niveau 1 juste avant ; avec une section, elle se place où on l’ajoute', () => {
    const seule = Ed.ajouterElement([], Ed.sousSectionNeuve('x'), null, 'parent');
    assert.deepEqual(ids(seule), ['parent', 'x']);
    assert.equal(Ed.aplatir(seule)[1].niveau, 2);
    assert.deepEqual(ids(Ed.ajouterElement(arbre(), Ed.sousSectionNeuve('x'), 'a', 'parent')), ['s1', 'a', 'x', 'ss1', 'b1', 'b2', 'ss2', 'c1', 's2', 'd']);
    assert.deepEqual(ids(Ed.ajouterElement(arbre(), Ed.sousSectionNeuve('x'))), ['s1', 'a', 'ss1', 'b1', 'b2', 'ss2', 'c1', 's2', 'd', 'x']);
  });
  test('N4 aplatir puis assembler redonne les sections avec leur niveau', () => {
    assert.deepEqual(Ed.assembler(Ed.aplatir(arbre())), arbre());
  });
});

describe('N5 ancien devis sans sous-section : rien ne change', () => {
  const ctx = { maintenant: new Date('2026-10-24T10:00:00Z'), auteur: 'moi@exemple.test', nouvelId: (n) => `${n}_1` };
  const reglages = { modeMarge: 'majoration', marge: 20, tauxTvaDefaut: 20, regimeTva: 'assujetti', dureeValiditeJours: 90 };
  const ligne = (id, prixAchat, quantite, extra = {}) => ({ id, libelle: `Article ${id}`, unite: 'u', quantite, prixAchat, ...extra });
  function devisAncien() {
    const base = {
      ...D.nouveauDevis({ affaireId: 'a1', destinataires: [{ email: 'client@exemple.test' }] }, ctx, reglages),
      objet: 'Rénovation de la toiture',
      adresses: { commanditaire: { id: 'a', texte: '1 rue du Test\n75000 Ville' }, facturation: null, chantier: { id: 'b', texte: '2 rue du Chantier' } },
      conditionsPaiement: '30 % à la commande, solde à la réception',
      modesPaiement: ['Virement bancaire', 'Chèque'],
      texteLibre: 'Merci de votre confiance.',
      notesBasDePage: '(1) Prix valables 30 jours.',
      remise: { type: 'pourcentage', valeur: 5 },
      sections: [
        { id: 's1', titre: 'Toiture', lignes: [ligne('l1', 123.45, 3, { description: 'Dépose\net repose' }), ligne('l2', 67.89, 7, { tauxTva: 10 })] },
        { id: 's2', titre: 'Zinguerie', sautDePageAvant: true, lignes: [ligne('l3', 10, 2), ligne('l4', 20, 1), ligne('l5', 30, 1)] },
      ],
    };
    const r = D.figerPourFinalisation(base, { numero: 'DEV-2026-10-24-001', finaliseLe: '2026-10-24T10:00:00Z', reglages });
    assert.deepEqual(r.erreurs, []);
    return r.devis;
  }
  const html = () => devisHtml(D.vueClient(devisAncien(), { clientNom: 'Mme Dupont' }), { brouillon: false });
  // Empreinte du HTML produit AVANT cette évolution par le même devis (calculée avec le code de `main` du 24/10/2026).
  const EMPREINTE_AVANT = '1f8bdc7da0af4f61dcb5964f1e9ffc725ce962ee56eded312a82e27e482f4860';
  test('N5 le document d’un devis sans sous-section est identique, octet pour octet, à celui d’avant', () => {
    assert.equal(createHash('sha256').update(html()).digest('hex'), EMPREINTE_AVANT);
  });
  test('N5 la vue client d’un devis sans sous-section n’a aucune trace de niveau', () => {
    const v = D.vueClient(devisAncien(), {});
    assert.ok(v.sections.every((s) => !('niveau' in s)));
    assert.deepEqual(v.sections.map((s) => s.numero), ['1', '2']);
    assert.deepEqual(v.sections[0].lignes.map((l) => l.numero), ['1.1', '1.2']);
  });
});

describe('N6 document avec sous-sections', () => {
  test('N6 le document montre les trois niveaux de numéros ; le sous-total de la section vient après ses sous-sections', () => {
    const h = devisHtml(D.vueClient(devisDe(arbre()), { clientNom: 'X' }));
    for (const numero of ['1.2.1', '1.2.2', '1.3.1']) assert.ok(h.includes(`<td class="num">${numero}</td>`), numero);
    assert.ok(h.includes('class="bandeau sous-bandeau"'));
    const places = ['Sous-total 1.2', 'Sous-total 1.3', 'Sous-total 1'].map((t) => h.indexOf(`${t}\u00a0`));
    assert.ok(places.every((p) => p > 0));
    assert.ok(places[0] < places[1] && places[1] < places[2], 'les sous-totaux des sous-sections précèdent celui de la section');
  });
});

describe('N7 notes de bas de page', () => {
  test('N7 les notes de plus de 2 000 caractères sont refusées à la finalisation', () => {
    const erreurs = D.erreursFinalisation(devisDe([{ id: 's', titre: '', lignes: [L('a')] }], { notesBasDePage: 'x'.repeat(2001), destinataires: ['a@b.fr'] }));
    assert.ok(erreurs.some((e) => /notes de bas de page sont trop longues/.test(e)));
    const ok = D.erreursFinalisation(devisDe([{ id: 's', titre: '', lignes: [L('a')] }], { notesBasDePage: 'x'.repeat(2000), destinataires: ['a@b.fr'] }));
    assert.ok(!ok.some((e) => /notes de bas de page/.test(e)));
  });
});
