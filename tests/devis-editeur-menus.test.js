// Éditeur de devis, partie 2 (menus, Bibliothèque, ajustement global, Options, impression) : logique pure, node --test, sans navigateur.
// Chaque test commence par le numéro du point du brief (1 menu de ligne, 2 Bibliothèque, 3 ajustement global, 4 Options, 5 impression).
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { test, describe } from 'node:test';
import * as Ed from '../js/modules/devis/editeur-logique.js';
import * as L from '../js/modules/devis/logique.js';
import { devisHtml } from '../js/modules/devis/document.js';
import { imprimerDevis, aBesoinOngletPourImprimer, htmlDuDevis, MESSAGE_FENETRE_BLOQUEE } from '../js/modules/devis/imprimer.js';

const ligne = (id, prixAchat, quantite, extra = {}) => ({ id, libelle: `Article ${id}`, unite: 'u', quantite, prixAchat, marge: 0, ...extra });
const devisDe = (sections, extra = {}) => ({ id: 'd1', statut: 'brouillon', modeMarge: 'majoration', marge: 0, tauxTvaDefaut: 20, regimeTva: 'assujetti', sections, ...extra });
const ids = (sections) => Ed.aplatir(sections).map((e) => e.id);
const trois = () => [{ id: 'sec-debut', titre: '', lignes: [ligne('a', 600, 1)] }, { id: 's1', titre: 'Cuisine', lignes: [ligne('b', 36, 5), ligne('c', 100, 1)] }, { id: 's2', titre: 'Salon', lignes: [ligne('d', 10, 1)] }];

describe('1 menu de la ligne : insérer au-dessus et en dessous', () => {
  test('1 insérer au-dessus place l’élément juste avant la ligne ; en dessous, juste après', () => {
    const avant = Ed.ajouterAvant(trois(), Ed.ligneLibre('x'), 'b');
    assert.deepEqual(ids(avant), ['a', 's1', 'x', 'b', 'c', 's2', 'd']);
    const apres = Ed.ajouterElement(trois(), Ed.ligneLibre('y'), 'b');
    assert.deepEqual(ids(apres), ['a', 's1', 'b', 'y', 'c', 's2', 'd']);
  });
  test('1 insérer une section au-dessus d’une section la pose avant elle ; une sous-section sans section avant elle reçoit une section de niveau 1', () => {
    assert.deepEqual(ids(Ed.ajouterAvant(trois(), Ed.sectionNeuve('n'), 's2')), ['a', 's1', 'b', 'c', 'n', 's2', 'd']);
    const seul = [{ id: 'sec-debut', titre: '', lignes: [ligne('a', 10, 1)] }];
    const r = Ed.ajouterAvant(seul, Ed.sousSectionNeuve('ss'), 'a', 'auto');
    assert.deepEqual(ids(r), ['auto', 'ss', 'a']);
    assert.equal(r[0].niveau, undefined);
  });
  test('1 un identifiant inconnu : l’élément va au bout, rien ne se perd', () => {
    assert.deepEqual(ids(Ed.ajouterAvant(trois(), Ed.ligneLibre('z'), 'inconnu')), ['a', 's1', 'b', 'c', 's2', 'd', 'z']);
  });
  test('1 reconfigurer les éléments d’un ouvrage recalcule la composition, le prix et la description de la ligne (sa quantité reste)', () => {
    const articles = [{ id: 'c1', libelle: 'BA13', unite: 'm²', prixAchat: 5, actif: true }, { id: 'c2', libelle: 'Rail', unite: 'u', prixAchat: 10, actif: true }];
    const devis = { marge: 20, modeMarge: 'majoration' };
    const depart = Ed.ligneDepuisArticle({ id: 'o1', libelle: 'Cloison', unite: 'm²', type: 'ouvrage', composants: [{ articleId: 'c1', quantite: 2 }] }, { id: 'x', articles, devis });
    assert.equal(depart.ouvrage.prixVenteHT, 12);
    const nouvelle = Ed.ligneAvecComposants({ ...depart, quantite: 3 }, { composants: [{ articleId: 'c1', quantite: 2 }, { articleId: 'c2', quantite: 1 }] }, { articles, devis });
    assert.equal(nouvelle.quantite, 3);
    assert.equal(nouvelle.ouvrage.composants.length, 2);
    assert.equal(nouvelle.ouvrage.prixVenteHT, 24);
    assert.equal(nouvelle.description, '- BA13 (6 m²)\n- Rail (3 u)');
    assert.equal(nouvelle.libelle, 'Cloison');
  });
});

describe('2 Bibliothèque : ajouter les articles cochés à la fin de la section en cours', () => {
  test('2 les lignes entrent à la fin de la section choisie, avant la section suivante', () => {
    const r = Ed.ajouterFinDeSection(trois(), [Ed.ligneLibre('n1'), Ed.ligneLibre('n2')], 's1');
    assert.deepEqual(ids(r), ['a', 's1', 'b', 'c', 'n1', 'n2', 's2', 'd']);
  });
  test('2 sans section (ou section inconnue), elles entrent à la fin du devis', () => {
    assert.deepEqual(ids(Ed.ajouterFinDeSection(trois(), [Ed.ligneLibre('n')], null)), ['a', 's1', 'b', 'c', 's2', 'd', 'n']);
    assert.deepEqual(ids(Ed.ajouterFinDeSection([], [Ed.ligneLibre('n')], null)), ['n']);
  });
  test('2 la section en cours est celle de la ligne touchée, ou la dernière du devis', () => {
    assert.equal(Ed.sectionDe(trois(), 'b'), 's1');
    assert.equal(Ed.sectionDe(trois(), 's2'), 's2');
    assert.equal(Ed.sectionDe(trois(), null), 's2');
    assert.equal(Ed.sectionDe([{ id: 'sec-debut', titre: '', lignes: [ligne('a', 1, 1)] }], 'a'), null);
  });
});

describe('3 ajustement global', () => {
  const trio = () => devisDe([{ id: 's', titre: 'Travaux', lignes: [ligne('l1', 60, 10), ligne('l2', 36, 5), ligne('l3', 100, 1)] }]);
  test('3 sans ajustement, les totaux sont exactement ceux d’avant (880 € HT) ; coefficient 1 ou absent = aucun', () => {
    assert.equal(L.totauxDevis(trio()).totalBrutHt, 880);
    assert.equal(L.totauxDevis({ ...trio(), ajustement: { coefficient: 1 } }).totalBrutHt, 880);
    assert.equal(L.totauxDevis({ ...trio(), ajustement: null }).totalBrutHt, 880);
    assert.equal(L.ajustementActif(trio()), false);
  });
  test('3 le coefficient multiplie le prix unitaire de chaque ligne (arrondi au centime) : 10 × 66 + 5 × 39,60 + 110 = 968 € HT', () => {
    const t = L.totauxDevis({ ...trio(), ajustement: { coefficient: 1.1 } });
    assert.deepEqual(t.lignes.map((x) => x.prixVenteUnitaire), [66, 39.6, 110]);
    assert.deepEqual(t.lignes.map((x) => x.totalHT), [660, 198, 110]);
    assert.equal(t.totalBrutHt, 968);
    assert.equal(t.sections[0].sousTotalHT, 968);
    assert.equal(t.tva, 193.6);
    assert.equal(t.netAPayer, 1161.6);
  });
  test('3 la remise et la TVA par taux se calculent sur les prix ajustés', () => {
    const d = { ...trio(), ajustement: { coefficient: 1.1 }, remise: { type: 'pourcentage', valeur: 10 } };
    const t = L.totauxDevis(d);
    assert.equal(t.remiseHt, 96.8);
    assert.equal(t.totalHt, 871.2);
    assert.deepEqual(t.tvaParTaux.map((x) => [x.taux, x.baseHT]), [[20, 871.2]]);
  });
  test('3 trois champs liés : pourcentage, montant et coefficient se recalculent l’un l’autre', () => {
    const d = devisDe([{ id: 's', titre: '', lignes: [ligne('l', 3451.63, 1)] }]);
    const v = L.valeursAjustement({ ...d, ajustement: { coefficient: 1.33 } });
    assert.equal(v.pourcentage, 33);
    assert.equal(v.montant, 1139.04);
    assert.equal(v.coefficient, 1.33);
    assert.equal(Ed.ajustementDepuisSaisie(d, 'pourcentage', '33,00').coefficient, 1.33);
    assert.equal(Ed.ajustementDepuisSaisie(d, 'montant', '1 139,04').coefficient, 1.33);
    assert.equal(Ed.ajustementDepuisSaisie(d, 'coefficient', '1,3300').coefficient, 1.33);
    assert.equal(Ed.ajustementDepuisSaisie(d, 'pourcentage', '-10').coefficient, 0.9);
  });
  test('3 coefficient arrondi à 4 décimales ; un coefficient ≤ 0 ou un texte illisible est refusé avec un message, sans rien enregistrer', () => {
    const d = devisDe([{ id: 's', titre: '', lignes: [ligne('l', 1000, 1)] }]);
    assert.equal(Ed.ajustementDepuisSaisie(d, 'montant', '33,333333').coefficient, 1.0333);
    for (const [champ, texte] of [['coefficient', '0'], ['coefficient', '-1,2'], ['coefficient', 'abc'], ['coefficient', ''], ['pourcentage', '-100'], ['pourcentage', 'dix'], ['montant', '-1000'], ['montant', '']]) {
      const r = Ed.ajustementDepuisSaisie(d, champ, texte);
      assert.equal(r.coefficient, null, `${champ} « ${texte} »`);
      assert.match(r.erreur, /\S/);
    }
    assert.match(Ed.ajustementDepuisSaisie(devisDe([]), 'montant', '10').erreur, /pas encore de total/);
  });
  test('3 le coefficient 1 s’enregistre comme « aucun ajustement » (champ retiré)', () => {
    assert.equal(Ed.ajustementAEnregistrer(1), null);
    assert.deepEqual(Ed.ajustementAEnregistrer(1.1), { coefficient: 1.1 });
    assert.ok(Ed.CHAMPS_ENREGISTRES.includes('ajustement'));
    assert.ok(Ed.CHAMPS_ENREGISTRES.includes('affichage'));
  });
  test('3 la finalisation fige le prix ajusté : changer le coefficient ensuite ne change plus les totaux', () => {
    const base = { ...L.nouveauDevis({ affaireId: 'a1', destinataires: [{ email: 'c@exemple.test' }] }, { maintenant: new Date('2026-10-24T10:00:00Z'), auteur: 'x@exemple.test', nouvelId: () => 'd1' }, { regimeTva: 'assujetti' }), ...trio(), ajustement: { coefficient: 1.1 },
      adresses: { commanditaire: { texte: '1 rue' }, facturation: null, chantier: { texte: '2 rue' } }, conditionsPaiement: '30 %' };
    const r = L.figerPourFinalisation(base, { numero: 'DEV-1', finaliseLe: '2026-10-24T10:00:00Z', reglages: { regimeTva: 'assujetti' } });
    assert.deepEqual(r.erreurs, []);
    assert.deepEqual(r.devis.sections[0].lignes.map((l) => l.prixVenteAjuste), [66, 39.6, 110]);
    assert.equal(r.devis.totaux.totalBrutHt, 968);
    assert.equal(L.totauxDevis({ ...r.devis, ajustement: { coefficient: 2 } }).totalBrutHt, 968);
    const sans = L.figerPourFinalisation({ ...base, ajustement: undefined }, { numero: 'DEV-1', finaliseLe: '2026-10-24T10:00:00Z', reglages: { regimeTva: 'assujetti' } });
    assert.equal(sans.devis.sections[0].lignes[0].prixVenteAjuste, undefined);
  });
  test('3 un prix ajusté périmé (copie d’un devis ajusté, ajustement retiré) ne survit pas à la finalisation', () => {
    const base = { ...L.nouveauDevis({ affaireId: 'a1', destinataires: [{ email: 'c@exemple.test' }] }, { maintenant: new Date('2026-10-24T10:00:00Z'), auteur: 'x@exemple.test', nouvelId: () => 'd1' }, { regimeTva: 'assujetti' }), ...trio(),
      adresses: { commanditaire: { texte: '1 rue' }, facturation: null, chantier: { texte: '2 rue' } }, conditionsPaiement: '30 %' };
    base.sections[0].lignes[0].prixVenteAjuste = 999; // reste d'une ancienne copie
    const r = L.figerPourFinalisation(base, { numero: 'DEV-1', finaliseLe: '2026-10-24T10:00:00Z', reglages: { regimeTva: 'assujetti' } });
    assert.equal(r.devis.sections[0].lignes[0].prixVenteAjuste, undefined);
    const copie = Ed.copieDeDevis({ ...base, ajustement: { coefficient: 1.1 } }, () => 'n');
    assert.equal(copie.sections[0].lignes[0].prixVenteAjuste, undefined);
  });
  test('3 la valeur « avant » reste calculable sur un devis finalisé (le montant de l’ajustement ne retombe pas à 0)', () => {
    const base = { ...L.nouveauDevis({ affaireId: 'a1', destinataires: [{ email: 'c@exemple.test' }] }, { maintenant: new Date('2026-10-24T10:00:00Z'), auteur: 'x@exemple.test', nouvelId: () => 'd1' }, { regimeTva: 'assujetti' }), ...trio(), ajustement: { coefficient: 1.1 },
      adresses: { commanditaire: { texte: '1 rue' }, facturation: null, chantier: { texte: '2 rue' } }, conditionsPaiement: '30 %' };
    const fige = L.figerPourFinalisation(base, { numero: 'DEV-1', finaliseLe: '2026-10-24T10:00:00Z', reglages: { regimeTva: 'assujetti' } }).devis;
    assert.equal(L.valeursAjustement(fige).montant, 88);
  });
  test('3 la vue client montre les prix ajustés et jamais le coefficient, l’ajustement ni la marge', () => {
    const vue = L.vueClient({ ...trio(), ajustement: { coefficient: 1.1 } }, { clientNom: 'Mme Dupont' });
    assert.deepEqual(vue.sections[0].lignes.map((l) => l.prixUnitaireHT), [66, 39.6, 110]);
    assert.equal(vue.totaux.totalBrutHt, 968);
    assert.ok(L.CLES_INTERDITES_CLIENT.includes('ajustement'));
    const cles = (o) => (Array.isArray(o) ? o.flatMap(cles) : o && typeof o === 'object' ? Object.entries(o).flatMap(([k, v]) => [k, ...cles(v)]) : []);
    for (const k of cles(vue)) assert.ok(!/ajustement|coefficient|marge|prixachat/i.test(k), `clé interdite : ${k}`);
    assert.ok(!JSON.stringify(vue).includes('1.1,'), 'le coefficient 1,1 n’apparaît pas');
  });
  test('3 un ajustement posé sur un devis qui n’en avait pas laisse tous les autres calculs intacts (acompte, primes, retenue)', () => {
    const sans = L.totauxDevis(devisDe([{ id: 's', titre: '', lignes: [ligne('l', 100, 1)] }], { acompte: { type: 'pourcentage', valeur: 30, moment: 'signature' } }));
    const avec = L.totauxDevis(devisDe([{ id: 's', titre: '', lignes: [ligne('l', 100, 1)] }], { acompte: { type: 'pourcentage', valeur: 30, moment: 'signature' }, ajustement: { coefficient: 2 } }));
    assert.equal(sans.acompteTtc, 36);
    assert.equal(avec.acompteTtc, 72);
  });
});

describe('4 Options : affichage du devis et du document', () => {
  const ctx = { maintenant: new Date('2026-10-24T10:00:00Z'), auteur: 'moi@exemple.test', nouvelId: (n) => `${n}_1` };
  const reglages = { modeMarge: 'majoration', marge: 20, tauxTvaDefaut: 20, regimeTva: 'assujetti', dureeValiditeJours: 90 };
  const l = (id, prixAchat, quantite, extra = {}) => ({ id, libelle: `Article ${id}`, unite: 'u', quantite, prixAchat, ...extra });
  const sections = [
    { id: 's1', titre: 'Toiture', lignes: [l('l1', 123.45, 3, { description: 'Dépose\net repose' }), l('l2', 67.89, 7, { tauxTva: 10 })] },
    { id: 'ss', titre: 'Sous', niveau: 2, lignes: [l('l6', 10, 2)] },
    { id: 's2', titre: 'Zinguerie', lignes: [l('l3', 10, 2), l('l4', 20, 1), l('l5', 30, 1)] },
  ];
  const extra = {
    objet: 'Rénovation', adresses: { commanditaire: { id: 'a', texte: '1 rue du Test' }, facturation: null, chantier: { id: 'b', texte: '2 rue' } }, conditionsPaiement: '30 %',
    remise: { type: 'pourcentage', valeur: 10 }, acompte: { type: 'pourcentage', valeur: 30, moment: 'signature' }, sections,
  };
  const figer = () => L.figerPourFinalisation({ ...L.nouveauDevis({ affaireId: 'a1', destinataires: [{ email: 'client@exemple.test' }] }, ctx, reglages), ...extra },
    { numero: 'DEV-1', finaliseLe: '2026-10-24T10:00:00Z', reglages }).devis;
  const contexteVue = { clientNom: 'Mme Dupont', emetteur: { nom: 'Atelier Test', adresse: '3 rue', siret: '123' } };

  test('4 sans options, le document est identique octet pour octet à celui d’avant la refonte (empreinte relevée sur l’ancien code)', () => {
    const html = devisHtml(L.vueClient(figer(), contexteVue));
    assert.equal(crypto.createHash('sha256').update(html).digest('hex'), 'b3f9e9613b7ca0e3d0c2f9e9a12ade21c104fcbb715de19a12a12c65ff5d0026');
    assert.equal(devisHtml(L.vueClient(figer(), contexteVue), { affichage: {} }), html);
    assert.equal(devisHtml(L.vueClient(figer(), contexteVue), { affichage: L.AFFICHAGE_DEFAUT }), html);
  });
  test('4 un ancien devis (sans `affichage`) garde l’affichage d’avant : calcul des marges visible ; un devis neuf le cache', () => {
    assert.equal(L.affichageDe({}).afficherMarges, true);
    assert.equal(L.affichageDe(undefined).afficherMarges, true);
    assert.equal(L.affichageDe(L.nouveauDevis({}, ctx, reglages)).afficherMarges, false);
    assert.equal(L.affichageDe({ affichage: { cacherTva: true } }).afficherMarges, false);
    assert.equal(L.affichageDe({ affichage: { cacherTva: true } }).cacherTva, true);
    assert.equal(L.affichageDe({ affichage: { cacherTva: 'oui' } }).cacherTva, false);
  });
  test('4 « Cacher les totaux des sections », « les colonnes quantité et unité » et « la colonne TVA » retirent ces éléments du document', () => {
    const vue = L.vueClient(figer(), contexteVue);
    assert.match(devisHtml(vue), /Sous-total 1/);
    const sansTotaux = devisHtml(vue, { affichage: { cacherTotauxSections: true } });
    assert.doesNotMatch(sansTotaux, /Sous-total/);
    const sansQte = devisHtml(vue, { affichage: { cacherQuantiteUnite: true } });
    assert.doesNotMatch(sansQte, /<th class="d">Qté<\/th>/);
    assert.doesNotMatch(sansQte, /<th>Unité<\/th>/);
    assert.match(sansQte, /colspan="4"/);
    const sansTva = devisHtml(vue, { affichage: { cacherTva: true } });
    assert.doesNotMatch(sansTva, /<th class="d">TVA<\/th>/);
    assert.match(sansTva, /<th class="d">Qté<\/th>/);
  });
  test('4 les éléments d’un ouvrage se cachent, ou s’affichent avec leur prix de vente ; jamais de prix d’achat', () => {
    const articles = [{ id: 'c1', libelle: 'BA13', unite: 'm²', prixAchat: 5, actif: true }];
    const ouvrage = Ed.ligneDepuisArticle({ id: 'o1', libelle: 'Cloison', unite: 'm²', type: 'ouvrage', composants: [{ articleId: 'c1', quantite: 2 }] }, { id: 'lo', articles, devis: { marge: 20, modeMarge: 'majoration' } });
    const d = { ...figer(), sections: [{ id: 's', titre: 'T', lignes: [{ ...ouvrage, quantite: 3 }] }] };
    const vue = L.vueClient(d, contexteVue);
    assert.equal(vue.sections[0].lignes[0].elements[0].quantite, 6);
    assert.equal(vue.sections[0].lignes[0].elements[0].prixUnitaireHT, 6);
    const ouvrage3 = { ...ouvrage, quantite: 3, description: Ed.descriptionDeLigne({ ...ouvrage, quantite: 3 }) };
    const vue3 = L.vueClient({ ...d, sections: [{ id: 's', titre: 'T', lignes: [ouvrage3] }] }, contexteVue);
    assert.match(devisHtml(vue3), /- BA13 \(6 m²\)/);
    assert.doesNotMatch(devisHtml(vue3, { affichage: { cacherElementsOuvrage: true } }), /BA13/);
    const avecPrix = devisHtml(vue3, { affichage: { afficherPrixElementsOuvrage: true } });
    assert.match(avecPrix, /- BA13 \(6 m²\) : 6,00 € HT/);
    assert.ok(!JSON.stringify(vue).includes('"prixAchat"'));
  });
  test('4 les cases « Afficher le téléphone / l’e-mail / le numéro de TVA / le SIREN » montrent la donnée du client si elle existe, sans erreur sinon', () => {
    const d = figer();
    const complet = L.vueClient(d, { ...contexteVue, client: { telephone: '06 12 34 56 78', email: 'dupont@exemple.test', numeroTva: 'FR123', siren: '123456789' } });
    assert.doesNotMatch(devisHtml(complet), /06 12 34 56 78/);
    const tout = devisHtml(complet, { affichage: { afficherTelephone: true, afficherEmail: true, afficherNumeroTva: true, afficherSiren: true } });
    for (const t of ['06 12 34 56 78', 'dupont@exemple.test', 'TVA FR123', 'SIREN 123456789']) assert.ok(tout.includes(t), t);
    const vide = L.vueClient(d, { ...contexteVue, client: { telephone: '', email: '' } });
    assert.doesNotThrow(() => devisHtml(vide, { affichage: { afficherTelephone: true, afficherSiren: true } }));
    assert.equal(devisHtml(vide, { affichage: { afficherTelephone: true, afficherSiren: true } }), devisHtml(vide));
  });
  test('4 « Afficher les références » ajoute la référence ou le code de l’article ; « Cacher la gestion des déchets » retire ce bloc', () => {
    const d = { ...figer(), dechets: { types: ['inertes'] }, sections: [{ id: 's', titre: 'T', lignes: [l('x', 10, 1, { code: 'CAR60', prixVente: 12 })] }] };
    const vue = L.vueClient(d, contexteVue);
    assert.equal(vue.sections[0].lignes[0].reference, 'CAR60');
    assert.doesNotMatch(devisHtml(vue), /Réf\./);
    assert.match(devisHtml(vue, { affichage: { afficherReferences: true } }), /Réf\. : CAR60/);
    assert.match(devisHtml(vue), /Gestion des déchets/);
    assert.doesNotMatch(devisHtml(vue, { affichage: { cacherDechets: true } }), /Gestion des déchets/);
  });
});

describe('5 impression depuis le navigateur', () => {
  const SAFARI = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15';
  const CHROME = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
  const IPHONE_CHROME = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0 Mobile/15E148 Safari/604.1';
  test('5 Safari et tous les navigateurs de l’iPhone passent par un onglet ; Chrome, Edge, Firefox impriment l’aperçu', () => {
    assert.equal(aBesoinOngletPourImprimer(SAFARI), true);
    assert.equal(aBesoinOngletPourImprimer(IPHONE_CHROME), true);
    assert.equal(aBesoinOngletPourImprimer(CHROME), false);
    assert.equal(aBesoinOngletPourImprimer('Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0'), false);
    assert.equal(aBesoinOngletPourImprimer(''), false);
  });
  test('5 Chrome : l’impression part de l’aperçu (iframe), sans ouvrir d’onglet', () => {
    let imprime = 0; let ouvert = 0;
    const iframe = { contentWindow: { focus() {}, print() { imprime += 1; } } };
    const r = imprimerDevis({ iframe, html: '<p>x</p>', agent: CHROME, ouvrir: () => { ouvert += 1; return {}; } });
    assert.deepEqual(r, { ok: true, methode: 'iframe', erreur: null });
    assert.equal(imprime, 1);
    assert.equal(ouvert, 0);
  });
  test('5 Safari : un onglet s’ouvre directement (un seul appel, dans le clic) et imprime quand il a chargé', () => {
    const ecouteurs = {}; let imprime = 0;
    const fenetre = { addEventListener: (n, f) => { ecouteurs[n] = f; }, focus() {}, print() { imprime += 1; } };
    const iframe = { contentWindow: { print() { throw new Error('ne doit pas imprimer la page parente'); } } };
    let urls = [];
    const r = imprimerDevis({ iframe, html: '<p>Devis DEV-1</p>', agent: SAFARI, ouvrir: (url) => { urls.push(url); return fenetre; } });
    assert.deepEqual(r, { ok: true, methode: 'onglet', erreur: null });
    assert.equal(urls.length, 1);
    assert.match(urls[0], /^blob:/);
    assert.equal(imprime, 0);
    ecouteurs.load();
    assert.equal(imprime, 1);
  });
  test('5 fenêtre bloquée par le navigateur : message clair', () => {
    const r = imprimerDevis({ html: '<p>x</p>', agent: SAFARI, ouvrir: () => null });
    assert.equal(r.ok, false);
    assert.equal(r.erreur, MESSAGE_FENETRE_BLOQUEE);
    assert.equal(MESSAGE_FENETRE_BLOQUEE, 'Autorise les fenêtres pour ce site, puis réessaie.');
  });
  test('5 appelé hors d’un clic (après une finalisation), aucun onglet ne s’ouvre', () => {
    let ouvert = 0;
    const r = imprimerDevis({ html: '<p>x</p>', agent: SAFARI, autoriserOnglet: false, ouvrir: () => { ouvert += 1; return {}; } });
    assert.equal(ouvert, 0);
    assert.equal(r.ok, false);
  });
  test('5 le document imprimé porte le numéro et le total du devis, avec la feuille d’impression A4', () => {
    const d = { ...L.nouveauDevis({ affaireId: 'a1' }, { maintenant: new Date('2026-10-24T10:00:00Z'), auteur: 'x', nouvelId: () => 'd1' }, { regimeTva: 'assujetti' }), numero: 'DEV-2026-10-24-007', statut: 'en_attente_envoi',
      sections: [{ id: 's', titre: 'T', lignes: [{ id: 'l', libelle: 'Pose', unite: 'u', quantite: 2, prixAchat: 100, marge: 0, prixVente: 100, tauxTva: 20 }] }] };
    const html = htmlDuDevis(d, { clientNom: 'Mme Dupont' });
    assert.match(html, /DEV-2026-10-24-007/);
    assert.match(html, /240,00/);
    assert.match(html, /@page \{ size: A4/);
    assert.doesNotMatch(html, /BROUILLON/);
    assert.match(htmlDuDevis({ ...d, statut: 'brouillon' }), /BROUILLON/);
  });
});

// ---------------------------------------------------------------- partie 3 : menus des sections et saut de page visuel
const saut = (id) => ({ id, type: 'saut' });
const avecSous = () => [
  { id: 'sec-debut', titre: '', lignes: [] },
  { id: 's1', titre: 'Salle', lignes: [ligne('a', 10, 1)] }, { id: 'ss1', titre: 'Bar', niveau: 2, lignes: [ligne('b', 10, 1)] }, { id: 's2', titre: 'Cuisine', lignes: [ligne('c', 10, 1)] },
];

describe('1 menu d’une section : insérer au début, à la fin, au dessus, en dessous', () => {
  test('1 au début : juste sous l’en-tête ; à la fin : après la dernière ligne, avant la section suivante', () => {
    assert.deepEqual(ids(Ed.insererAutour(trois(), Ed.ligneTexte('x'), 's1', 'debut')), ['a', 's1', 'x', 'b', 'c', 's2', 'd']);
    assert.deepEqual(ids(Ed.insererAutour(trois(), Ed.ligneTexte('x'), 's1', 'fin')), ['a', 's1', 'b', 'c', 'x', 's2', 'd']);
  });
  test('1 au dessus : avant la section ; en dessous : après la section ENTIÈRE (lignes comprises)', () => {
    assert.deepEqual(ids(Ed.insererAutour(trois(), Ed.sectionNeuve('n'), 's1', 'avant')), ['a', 'n', 's1', 'b', 'c', 's2', 'd']);
    assert.deepEqual(ids(Ed.insererAutour(trois(), Ed.sectionNeuve('n'), 's1', 'apres')), ['a', 's1', 'b', 'c', 'n', 's2', 'd']);
    assert.deepEqual(ids(Ed.insererAutour(trois(), Ed.sectionNeuve('n'), 's2', 'apres')), ['a', 's1', 'b', 'c', 's2', 'd', 'n']);
  });
  test('1 une section de niveau 1 emporte ses sous-sections : « en dessous » passe après elles ; une sous-section créée au début ne vole aucune ligne', () => {
    assert.deepEqual(ids(Ed.insererAutour(avecSous(), Ed.ligneTexte('x'), 's1', 'apres')), ['s1', 'a', 'ss1', 'b', 'x', 's2', 'c']);
    assert.deepEqual(ids(Ed.insererAutour(avecSous(), Ed.sousSectionNeuve('n'), 's1', 'debut')), ['s1', 'a', 'n', 'ss1', 'b', 's2', 'c']);
    assert.deepEqual(ids(Ed.insererAutour(avecSous(), Ed.sousSectionNeuve('n'), 's1', 'fin')), ['s1', 'a', 'ss1', 'b', 'n', 's2', 'c']);
  });
  test('1 autour d’une sous-section : au dessus / en dessous restent dans sa section ; début : sœur avant ; fin : sœur après', () => {
    assert.deepEqual(ids(Ed.insererAutour(avecSous(), Ed.ligneTexte('x'), 'ss1', 'avant')), ['s1', 'a', 'x', 'ss1', 'b', 's2', 'c']);
    assert.deepEqual(ids(Ed.insererAutour(avecSous(), Ed.sousSectionNeuve('n'), 'ss1', 'debut')), ['s1', 'a', 'n', 'ss1', 'b', 's2', 'c']);
    assert.deepEqual(ids(Ed.insererAutour(avecSous(), Ed.sousSectionNeuve('n'), 'ss1', 'fin')), ['s1', 'a', 'ss1', 'b', 'n', 's2', 'c']);
    assert.deepEqual(ids(Ed.insererAutour(avecSous(), Ed.ligneTexte('x'), 'ss1', 'debut')), ['s1', 'a', 'ss1', 'x', 'b', 's2', 'c']);
  });
  test('1 élément introuvable : rien ne change', () => {
    assert.deepEqual(ids(Ed.insererAutour(trois(), Ed.ligneTexte('x'), 'zzz', 'fin')), ids(trois()));
  });
  test('1 dupliquer une section copie ses lignes avec de nouveaux identifiants ; supprimer la retire avec ses lignes', () => {
    let n = 0;
    const r = Ed.dupliquerElement(trois(), 's1', () => `c${n += 1}`);
    assert.deepEqual(ids(r.sections), ['a', 's1', 'b', 'c', 'c1', 'c2', 'c3', 's2', 'd']);
    assert.equal(new Set(ids(r.sections)).size, ids(r.sections).length);
    assert.deepEqual(ids(Ed.supprimerElement(trois(), 's1')), ['a', 's2', 'd']);
    assert.equal(Ed.lignesEmportees([{ id: 's', titre: 'A', lignes: [ligne('a', 1, 1), saut('p')] }], 's'), 1); // un saut n'est pas une ligne
  });
});

describe('2 menu d’une ligne : même liste d’insertion, saut de page compris', () => {
  test('2 un saut s’insère au dessus et en dessous d’une ligne', () => {
    assert.deepEqual(ids(Ed.insererAutour(trois(), Ed.ligneSaut('p'), 'b', 'avant')), ['a', 's1', 'p', 'b', 'c', 's2', 'd']);
    assert.deepEqual(ids(Ed.insererAutour(trois(), Ed.ligneSaut('p'), 'b', 'apres')), ['a', 's1', 'b', 'p', 'c', 's2', 'd']);
  });
});

describe('3 saut de page : hors totaux, sans numéro, fidèle à l’ancien réglage', () => {
  const avec = (n) => [{ id: 's1', titre: 'A', lignes: [ligne('a', 100, 1), ...(n > 0 ? [saut('p1')] : []), ligne('b', 50, 2), ...(n > 1 ? [saut('p2'), saut('p3')] : [])] }];
  test('3 le net à payer, la TVA et les totaux restent les mêmes avec 0, 1 ou 3 sauts', () => {
    const base = L.totauxDevis(devisDe(avec(0)));
    for (const n of [1, 2]) {
      const t = L.totauxDevis(devisDe(avec(n)));
      assert.equal(t.netAPayer, base.netAPayer);
      assert.equal(t.ttc, base.ttc);
      assert.deepEqual(t.tvaParTaux, base.tvaParTaux);
      assert.equal(t.sections[0].sousTotalHT, base.sections[0].sousTotalHT);
    }
    assert.equal(L.totauxDevis(devisDe(avec(2))).lignes.find((l) => l.id === 'p1').totalHT, 0);
  });
  test('3 un saut n’a pas de numéro et ne fait pas avancer le compteur', () => {
    assert.deepEqual(L.numerosDevis(avec(2))[0].lignes, ['1.1', null, '1.2', null, null]);
    assert.equal(Ed.numerotation(avec(1)).p1, null);
  });
  test('3 un saut ne déclenche aucune erreur de finalisation ni aucun avertissement', () => {
    const d = devisDe(avec(2), { destinataires: ['a@b.fr'] });
    assert.deepEqual(L.erreursFinalisation(d).filter((e) => /saut|quantité|prix|libellé/i.test(e)), []);
    assert.deepEqual(Ed.avertissements(d).map((a) => a.code), []);
    assert.deepEqual(Ed.avertissements(devisDe([{ id: 's', titre: 'A', lignes: [saut('p')] }])).map((a) => a.code), ['aucuneLigne']);
    const fige = L.figerPourFinalisation(d, { numero: 'DEV-1', finaliseLe: '2026-10-24', reglages: { regimeTva: 'assujetti' } });
    assert.deepEqual(fige.erreurs, []);
    assert.deepEqual(fige.devis.sections[0].lignes[1], { id: 'p1', type: 'saut' });
  });
  test('3 la vue client donne la place du saut, rien d’autre ; le texte du devis l’ignore', () => {
    const d = devisDe(avec(1));
    const v = L.vueClient(d);
    assert.deepEqual(v.sections[0].lignes[1], { id: 'p1', type: 'saut' });
    assert.doesNotMatch(L.texteVueClient(d), /p1|saut/i);
    assert.doesNotMatch(L.texteVueInterne(d), /p1|saut/i);
  });
  test('3 dupliquer un devis, créer une version et aplatir / assembler gardent les sauts', () => {
    const d = devisDe(avec(1));
    assert.deepEqual(Ed.assembler(Ed.aplatir(d.sections)), d.sections);
    let n = 0;
    const copie = Ed.copieDeDevis(d, () => `n${n += 1}`);
    assert.equal(copie.sections[0].lignes.filter((l) => l.type === 'saut').length, 1);
    const v2 = L.nouvelleVersion(d, { id: 'd2', creeLe: new Date('2026-10-24T10:00:00Z') });
    assert.equal(v2.sections[0].lignes[1].type, 'saut');
  });
  test('3 un ancien devis « Nouvelle page avant » devient un saut posé avant la section, et le champ disparaît', () => {
    const ancien = [{ id: 's1', titre: 'Un', sautDePageAvant: true, lignes: [ligne('a', 10, 1)] }, { id: 's2', titre: 'Deux', sautDePageAvant: true, lignes: [ligne('b', 10, 1)] }];
    const neuf = Ed.convertirAnciensSauts(ancien);
    assert.deepEqual(neuf.map((s) => s.sautDePageAvant), [undefined, undefined]);
    assert.deepEqual(neuf[0].lignes.map((l) => l.id), ['a', 'saut-s2']); // rien sur la première section (la page est déjà neuve)
    assert.equal(neuf[0].lignes[1].type, 'saut');
    assert.deepEqual(ids(neuf), ['s1', 'a', 'saut-s2', 's2', 'b']);
    assert.ok(Ed.memeContenu({ sections: ancien }, { sections: neuf }), 'ancien et converti sont le même contenu : pas de faux conflit');
    assert.equal(ancien[1].sautDePageAvant, true, 'la source n’est pas modifiée');
  });
  test('3 document : un saut coupe la page à sa place exacte, jamais en tête, jamais deux de suite', () => {
    const vue = (sections) => L.vueClient(devisDe(sections));
    const html = devisHtml(vue([{ id: 's1', titre: 'A', lignes: [saut('p0'), ligne('a', 10, 1), saut('p1'), saut('p1b'), ligne('b', 10, 1)] }]));
    assert.equal((html.match(/<tr class="saut-page"/g) ?? []).length, 1);
    assert.ok(html.indexOf('>Article a<') < html.indexOf('<tr class="saut-page"') && html.indexOf('<tr class="saut-page"') < html.indexOf('>Article b<'));
    assert.match(html, /<tr class="saut-page" style="break-before:page/);
    // Saut en fin de section : après son sous-total ; en tête de section : avant son bandeau.
    const deux = devisHtml(vue([{ id: 's1', titre: 'A', lignes: [ligne('a', 10, 1), saut('p')] }, { id: 's2', titre: 'B', lignes: [ligne('b', 10, 1)] }]));
    assert.ok(deux.indexOf('Sous-total 1') < deux.indexOf('<tr class="saut-page"') && deux.indexOf('<tr class="saut-page"') < deux.indexOf('>B<'));
    const tete = devisHtml(vue([{ id: 's1', titre: 'A', lignes: [ligne('a', 10, 1)] }, { id: 's2', titre: 'B', lignes: [saut('p'), ligne('b', 10, 1)] }]));
    assert.ok(tete.indexOf('<tr class="saut-page"') > tete.indexOf('Sous-total 1') && tete.indexOf('<tr class="saut-page"') < tete.indexOf('>B<'));
    // Parent avec deux sous-sections, saut en fin de la première : « Sous-total 1 » vient APRÈS la sous-section 1.2 (relecture Fable).
    const imbriquees = devisHtml(vue([{ id: 's1', titre: 'Toit', lignes: [] }, { id: 'ss1', titre: 'Un', niveau: 2, lignes: [ligne('a', 10, 1), saut('p')] }, { id: 'ss2', titre: 'Deux', niveau: 2, lignes: [ligne('b', 10, 1)] }]));
    assert.ok(imbriquees.indexOf('Sous-total 1.1') < imbriquees.indexOf('<tr class="saut-page"') && imbriquees.indexOf('<tr class="saut-page"') < imbriquees.indexOf('>Article b<'));
    assert.ok(imbriquees.search(/Sous-total 1[\s\u00a0]*:/) > imbriquees.indexOf('>Article b<'));
    // Sans saut : aucun élément de saut dans le document.
    assert.equal((devisHtml(vue([{ id: 's1', titre: 'A', lignes: [ligne('a', 10, 1)] }])).match(/<tr class="saut-page"/g) ?? []).length, 0);
  });
});

describe('5 finalisation sans adresse e-mail', () => {
  test('5 un devis sans destinataire peut être finalisé ; une adresse écrite mais invalide reste refusée', () => {
    const base = { ...L.nouveauDevis({ affaireId: 'a1', destinataires: [] }, { maintenant: new Date('2026-10-24T10:00:00Z'), auteur: 'x@exemple.test', nouvelId: () => 'd1' }, { regimeTva: 'assujetti' }), sections: [{ id: 's1', titre: '', lignes: [ligne('a', 10, 1)] }] };
    assert.ok(!L.erreursFinalisation(base).some((e) => /destinataire|e-mail/.test(e)));
    const mauvais = L.erreursFinalisation({ ...base, destinataires: ['pas-une-adresse'] });
    assert.ok(mauvais.some((e) => /pas valide/.test(e)));
  });
});
