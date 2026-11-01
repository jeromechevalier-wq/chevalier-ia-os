// Mention de TVA réduite (31/10/2026) : une mention s'imprime sur CHAQUE devis qui a une ligne à 5,5 % ou 10 %. node --test.
// 1 logique devisATvaReduite · 2 document · 3 réglage (personnalisé, vide = standard, limite) · 4 parité des copies serveur · 5 réglages à l'écran : voir tests/e2e/devis-tva-reduite.spec.js.
import assert from 'node:assert/strict';
import { test, describe } from 'node:test';
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as L from '../js/modules/devis/logique.js';
import * as A from '../js/modules/devis/articles.js';
import { devisHtml } from '../js/modules/devis/document.js';
import { EMETTEUR_ESSAI, completerPourFinaliser } from './jeu-finalisation.js';

const lg = (id, extra = {}) => ({ id, libelle: `Ligne ${id}`, unite: 'u', quantite: 1, prixAchat: 100, prixVente: 100, ...extra });
// Un devis à 100 € HT par ligne ; `taux` fixe le taux de chaque ligne (null = taux par défaut du devis).
const devis = (lignes, extra = {}) => ({ id: 'd', version: 1, regimeTva: 'assujetti', tauxTvaDefaut: 20, sections: [{ id: 's', titre: 'Travaux', lignes }], ...extra });
const un = (taux, extra = {}) => devis([lg('a', { tauxTva: taux, ...extra })]);

describe('1 devisATvaReduite', () => {
  test('1 un seul taux à 20 % : faux', () => assert.equal(L.devisATvaReduite(un(20)), false));
  test('1 10 % : vrai ; 5,5 % : vrai', () => { assert.equal(L.devisATvaReduite(un(10)), true); assert.equal(L.devisATvaReduite(un(5.5)), true); });
  test('1 0 %, 2,1 % et 7 % (taux libre) : faux', () => { for (const t of [0, 2.1, 7]) assert.equal(L.devisATvaReduite(un(t)), false, String(t)); });
  test('1 un seul article à 10 % parmi des lignes à 20 % : vrai', () => assert.equal(L.devisATvaReduite(devis([lg('a', { tauxTva: 20 }), lg('b', { tauxTva: 10 })])), true));
  test('1 le taux par défaut du devis compte quand la ligne n’a pas de taux', () => {
    assert.equal(L.devisATvaReduite(devis([lg('a')], { tauxTvaDefaut: 10 })), true);
    assert.equal(L.devisATvaReduite(devis([lg('a')], { tauxTvaDefaut: 20 })), false);
  });
  test('1 une ligne texte ou à 0 € est ignorée même avec un taux de 10 %', () => {
    assert.equal(L.devisATvaReduite(devis([lg('a', { tauxTva: 20 }), { id: 't', type: 'texte', libelle: 'Note', tauxTva: 10, quantite: 0 }])), false);
    assert.equal(L.devisATvaReduite(devis([lg('a', { tauxTva: 20 }), lg('z', { tauxTva: 10, prixAchat: 0, prixVente: 0, quantite: 1 })])), false);
  });
  test('1 franchise de TVA et autoliquidation : faux, même avec des lignes à 10 %', () => {
    assert.equal(L.devisATvaReduite({ ...un(10), regimeTva: 'franchise' }), false);
    assert.equal(L.devisATvaReduite({ ...un(10), autoliquidation: true }), false);
  });
  test('1 comparaison tolérante aux flottants (5,5 écrit 5.5000000001)', () => assert.equal(L.devisATvaReduite(un(5.5000000001)), true));
  test('1 cas vide : devis sans ligne, sans section, absent', () => {
    assert.equal(L.devisATvaReduite(devis([])), false);
    assert.equal(L.devisATvaReduite({ regimeTva: 'assujetti' }), false);
    assert.equal(L.devisATvaReduite(null), false);
  });
  test('1 la vue client porte le drapeau tvaReduite (et jamais le nom attestationTvaReduite)', () => {
    assert.equal(L.vueClient(un(10), {}).tvaReduite, true);
    assert.equal(L.vueClient(un(20), {}).tvaReduite, false);
    assert.equal(L.vueClient(un(10), {}).attestationTvaReduite, undefined);
  });
});

describe('2 le document imprime la mention', () => {
  const texte = L.MENTION_TVA_REDUITE_DEFAUT;
  const html = (d, emetteur = {}) => devisHtml(L.vueClient(d, { emetteur }), { emetteur });
  test('2 devis à 20 % : aucune mention ; devis à 10 % : le texte standard, avant le bloc de signature « bon pour accord »', () => {
    const h20 = html(un(20));
    assert.ok(!h20.includes('278-0 bis A'));
    const h10 = html(un(10));
    assert.ok(h10.includes('278-0 bis A') && h10.includes('279-0 bis'));
    assert.ok(h10.indexOf('278-0 bis A') < h10.indexOf('Pour le client'));
    assert.ok(texte.startsWith('Application du taux réduit de TVA'));
  });
  test('2 la mention de TVA réduite passe avant « Attestation et mentions »', () => {
    const h = html(un(5.5), { mentionEmetteur: 'Ma qualification RGE' });
    assert.ok(h.indexOf('278-0 bis A') < h.indexOf('Ma qualification RGE'));
    assert.ok(h.indexOf('Ma qualification RGE') < h.indexOf('Pour le client'));
  });
  test('2 franchise : pas de mention', () => assert.ok(!html({ ...un(10), regimeTva: 'franchise' }).includes('278-0 bis A')));
});

describe('3 le réglage', () => {
  test('3 texte personnalisé imprimé à la place du standard, échappé', () => {
    const emetteur = L.emetteurImprime({}, '', '  Mon texte <script>x</script>  ');
    const h = devisHtml(L.vueClient(un(10), { emetteur }), { emetteur });
    assert.ok(h.includes('Mon texte &lt;script&gt;x&lt;/script&gt;') && !h.includes('278-0 bis A') && !h.includes('<script>x'));
  });
  test('3 réglage vide ou absent = texte standard', () => {
    for (const reg of [undefined, '', '   \n ']) {
      const emetteur = L.emetteurImprime({}, '', reg);
      assert.ok(devisHtml(L.vueClient(un(10), { emetteur }), { emetteur }).includes('278-0 bis A'));
    }
  });
  test('3 champ absent des anciens réglages : vide, rien n’est écrit ; saisie trop longue refusée', () => {
    assert.equal(A.reglagesDevis({ marge: 20 }).mentionTvaReduite, '');
    const trop = A.validerReglagesDevis({ ...A.reglagesDevis(null), mentionTvaReduite: 'x'.repeat(L.LIMITE_MENTION_TVA_REDUITE + 1) });
    assert.match(trop.erreurs.mentionTvaReduite, /Mention de TVA réduite.*trop long/);
    assert.equal(trop.reglages, null);
    const ok = A.validerReglagesDevis({ ...A.reglagesDevis(null), mentionTvaReduite: 'x'.repeat(L.LIMITE_MENTION_TVA_REDUITE) });
    assert.deepEqual(ok.erreurs, {});
  });
});

describe('4 parité des copies serveur', () => {
  test('4 les copies de logique et de document (functions/ et functions-plateforme/) donnent le même document que l’écran', async () => {
    const copies = ['../functions/partage/', '../functions-plateforme/serveur/partage/'].map((d) => fileURLToPath(new URL(`${d}devis.js`, import.meta.url)));
    if (!copies.every(existsSync)) return; // test:logique ne lance pas `npm run preparer`
    const d = un(10);
    const emetteur = L.emetteurImprime({ nom: 'Atelier' }, 'Qualif', 'Texte réduit perso');
    const attendu = devisHtml(L.vueClient(d, { emetteur }), { emetteur });
    for (const c of copies) {
      const dossier = c.replace(/devis\.js$/, '');
      const Dp = await import(pathToFileURL(c).href);
      const { devisHtml: htmlCopie } = await import(pathToFileURL(`${dossier}devis-document.js`).href);
      assert.equal(Dp.devisATvaReduite(d), true);
      const e = Dp.emetteurImprime({ nom: 'Atelier' }, 'Qualif', 'Texte réduit perso');
      assert.equal(htmlCopie(Dp.vueClient(d, { emetteur: e }), { emetteur: e }), attendu, c);
      assert.equal(Dp.MENTION_TVA_REDUITE_DEFAUT, L.MENTION_TVA_REDUITE_DEFAUT);
    }
  });
});

// ---------------------------------------------------------------- Texte figé à la finalisation (décision du 01/11/2026)
describe('6 à 9 le texte de la mention est figé sur un devis finalisé', () => {
  const REGLAGES = { regimeTva: 'assujetti', mentionTvaReduite: '  Texte de Jérôme du jour.  ' };
  const fige = (d, reglages = REGLAGES) => L.figerPourFinalisation(d, { numero: 'N', finaliseLe: '2026-10-24T10:00:00Z', reglages, emetteur: EMETTEUR_ESSAI, aujourdhui: '2026-10-24' });
  const finalisable = (taux) => completerPourFinaliser({ ...L.nouveauDevis({ destinataires: [{ email: 'client@exemple.test' }], affaireId: 'aff1' }, { id: 'd', maintenant: new Date('2026-10-24T10:00:00Z'), auteur: 'essai' }, { marge: 20, margeDevis: 20 }), sections: [{ id: 's', titre: 'Travaux', lignes: [lg('a', { tauxTva: taux })] }] });
  const imprime = (d, emetteur = {}) => devisHtml(L.vueClient(d, { emetteur }), { emetteur });

  test('6 la finalisation copie dans le devis le texte du réglage nettoyé ; réglage vide = texte standard ; devis à 20 % = rien', () => {
    assert.equal(fige(finalisable(10)).devis.mentionTvaReduiteFigee, 'Texte de Jérôme du jour.');
    assert.equal(fige(finalisable(5.5), { regimeTva: 'assujetti', mentionTvaReduite: '' }).devis.mentionTvaReduiteFigee, L.MENTION_TVA_REDUITE_DEFAUT);
    assert.equal('mentionTvaReduiteFigee' in fige(finalisable(20)).devis, false, 'rien à figer sans ligne réduite');
    assert.equal('mentionTvaReduiteFigee' in fige({ ...finalisable(20), mentionTvaReduiteFigee: 'reste' }).devis, false, 'un reste de brouillon ne survit pas');
  });
  test('7 un devis finalisé imprime le texte figé même si le réglage change ensuite ; un brouillon suit le réglage', () => {
    const f = fige(finalisable(10)).devis;
    const h = imprime(f, L.emetteurImprime({ nom: 'Atelier' }, '', 'Nouveau texte du réglage'));
    assert.ok(h.includes('Texte de Jérôme du jour.') && !h.includes('Nouveau texte du réglage'));
    const brouillon = { ...finalisable(10), mentionTvaReduiteFigee: 'Texte posé à la main' };
    const hb = imprime(brouillon, L.emetteurImprime({ nom: 'Atelier' }, '', 'Nouveau texte du réglage'));
    assert.ok(hb.includes('Nouveau texte du réglage') && !hb.includes('Texte posé à la main'), 'un brouillon ne lit jamais le texte figé');
  });
  test('8 un devis finalisé AVANT cette règle (sans texte figé) suit encore les réglages, puis le texte standard', () => {
    const ancien = { ...finalisable(10), statut: 'en_attente_envoi', numero: 'N' };
    assert.ok(imprime(ancien, L.emetteurImprime({ nom: 'A' }, '', 'Texte du réglage actuel')).includes('Texte du réglage actuel'));
    assert.ok(imprime(ancien, {}).includes('278-0 bis A'));
  });
  test('8 une mention figée sur un devis passé à 20 % ne s’imprime pas (le drapeau tvaReduite commande)', () => {
    const d = { ...finalisable(20), statut: 'en_attente_envoi', mentionTvaReduiteFigee: 'Ne doit pas sortir' };
    assert.ok(!imprime(d).includes('Ne doit pas sortir'));
  });
  test('9 une nouvelle version repart des réglages du moment : le texte figé n’est pas recopié', () => {
    const f = fige(finalisable(10)).devis;
    assert.equal(f.mentionTvaReduiteFigee, 'Texte de Jérôme du jour.');
    const v2 = L.nouvelleVersion(f, { id: 'd2', creeLe: new Date('2026-10-25T10:00:00Z') });
    assert.equal('mentionTvaReduiteFigee' in v2, false);
    assert.ok(imprime(v2, L.emetteurImprime({ nom: 'A' }, '', 'Texte du moment')).includes('Texte du moment'));
  });
  test('9 l’assistant ne peut pas écrire ce champ dans un brouillon (champ protégé)', async () => {
    const { CHAMPS_PROTEGES } = await import('../js/modules/devis/brouillon.js');
    assert.ok(CHAMPS_PROTEGES.includes('mentionTvaReduiteFigee'));
  });
});
