// Module Devis, bordereau (articles) et réglages : logique pure de js/modules/devis/articles.js et déclaration au registre.
// Un test par critère du brief (le nom commence par le numéro B1 à B10) ; les parcours d'écran sont dans tests/e2e/devis-bordereau*.spec.js.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as A from '../js/modules/devis/articles.js';
import { MODES_MARGE, REGIMES_TVA, TAUX_TVA_DEFAUT, ERREUR_MARGE_100 } from '../js/modules/devis/logique.js';
import { MODULES_DECLARES, moduleDeclare, modulesActifsDuClient, blocsDuMenu, verifierActivation, reglagesDesModules } from '../js/os/registre.js';

const lire = (f) => readFileSync(fileURLToPath(new URL(`../${f}`, import.meta.url)), 'utf8');
const MAINTENANT = new Date('2026-10-24T10:00:00Z');
let n = 0;
const ctx = () => ({ maintenant: MAINTENANT, auteur: 'alice@exemple.test', nouvelId: (nom) => `${nom}_${++n}` });
const creer = (valeurs, articles = []) => A.planCreerArticle(valeurs, ctx(), { articles });
/** Applique un plan « creer » à une liste (comme la base). */
const appliquer = (articles, plan) => [...articles, ...plan.ecritures.filter((e) => e.type === 'creer').map((e) => ({ id: e.id, ...e.donnees }))];

describe('B1 le module Devis est déclaré et ne dépend que des Affaires', () => {
  const devis = moduleDeclare('devis');
  test('B1 déclaration : dépend de « affaires » (pas de « projets »), une entrée de menu « Devis » qui ouvre la liste des devis, pas de réservé aux clients', () => {
    assert.ok(devis);
    assert.deepEqual(devis.dependances, ['affaires']);
    assert.equal(devis.entreeMenu, 'devis/liste');
    assert.deepEqual(devis.ecrans.map((e) => e.route), ['devis/liste', 'devis/bordereau']);
    assert.deepEqual(devis.collections, ['devis_articles', 'devis_parametres', 'devis_devis', 'devis_vocabulaire']);
    assert.ok(!('reserveAuxClients' in devis));
    assert.ok(MODULES_DECLARES.findIndex((m) => m.id === 'affaires') < MODULES_DECLARES.findIndex((m) => m.id === 'devis'), 'les dépendances viennent avant');
  });
  test('B1 le menu montre « Devis » quand le module est actif (Affaires seules suffisent) et pas sans « affaires »', () => {
    const entrees = (actifs) => blocsDuMenu(actifs).flatMap((b) => b.sections.flat()).map((e) => [e.libelle, e.chemin]);
    assert.deepEqual(entrees(['affaires', 'devis']).filter(([l]) => l === 'Devis'), [['Devis', 'devis/liste']]);
    assert.ok(!entrees(['affaires']).some(([l]) => l === 'Devis'));
    const sans = modulesActifsDuClient({ modules: { devis: true } });
    assert.deepEqual(sans.actifs, [], 'Devis sans Affaires est refusé');
    assert.match(sans.erreurs.join(' '), /Devis.*Affaires/);
    assert.deepEqual(modulesActifsDuClient({ modules: { affaires: true, devis: true } }).actifs, ['affaires', 'devis']);
    assert.deepEqual(modulesActifsDuClient({ modules: { crm: true, devis: true } }).actifs, ['affaires', 'projets', 'devis']);
    assert.deepEqual(verifierActivation(['devis']).actifs, []);
  });
  test('B1 les Réglages ont un bloc « Devis » avec sa section', () => {
    const bloc = reglagesDesModules(['affaires', 'devis']).find((b) => b.id === 'devis');
    assert.deepEqual(bloc.sections.map((s) => s.id), ['reglages-devis', 'reglages-entreprise', 'reglages-familles', 'reglages-export-devis']);
  });
});

describe('B2 un article se crée ; un libellé vide est refusé', () => {
  test('B2 logique : création avec les champs du cadrage, actif, euros, marques de création', () => {
    const p = creer({ libelle: '  Carrelage   60 x 60 ', unite: 'm²', prixAchat: '12,5', code: ' CAR ', tauxTva: '10' });
    assert.deepEqual(p.erreurs, {});
    assert.equal(p.ecritures.length, 1);
    const e = p.ecritures[0];
    assert.deepEqual([e.type, e.collection, e.id], ['creer', 'devis_articles', p.id]);
    assert.deepEqual(e.donnees, { code: 'CAR', libelle: 'Carrelage 60 x 60', unite: 'm²', prixAchat: 12.5, tauxTva: 10, actif: true, proprietaire: 'alice@exemple.test' });
    assert.deepEqual(e.horodater, ['creeLe', 'modifieLe']);
    assert.deepEqual(e.signer, ['creePar', 'modifiePar']);
  });
  test('B2 logique : unité par défaut « u », code et TVA facultatifs', () => {
    const p = creer({ libelle: 'Vis', prixAchat: 0.1 });
    assert.deepEqual(p.ecritures[0].donnees, { code: '', libelle: 'Vis', unite: 'u', prixAchat: 0.1, tauxTva: null, actif: true, proprietaire: 'alice@exemple.test' });
  });
  test('B2 logique : un libellé vide ou blanc est refusé avec un message qui dit quoi faire, rien n’est écrit', () => {
    for (const libelle of ['', '   ', undefined]) {
      const p = creer({ libelle, prixAchat: 5 });
      assert.match(p.erreurs.libelle, /libellé est obligatoire/);
      assert.deepEqual(p.ecritures, []);
    }
    assert.match(creer({ libelle: 'x'.repeat(201), prixAchat: 1 }).erreurs.libelle, /trop long/);
  });
  test('B2 logique : le prix d’achat est exigé à l’enregistrement', () => {
    assert.match(creer({ libelle: 'Vis' }).erreurs.prixAchat, /Indique le prix d’achat/);
    assert.match(creer({ libelle: 'Vis', prixAchat: '' }).erreurs.prixAchat, /Indique le prix d’achat/);
  });
  test('B2 logique : la liste affichée garde l’article créé (recherche, tri par libellé)', () => {
    let articles = appliquer([], creer({ libelle: 'Zinc', prixAchat: 1 }));
    articles = appliquer(articles, creer({ libelle: 'Ardoise', prixAchat: 2 }, articles));
    assert.deepEqual(A.filtrerArticles(articles).map((a) => a.libelle), ['Ardoise', 'Zinc']);
    assert.deepEqual(A.filtrerArticles(articles, { recherche: 'ZINC' }).map((a) => a.libelle), ['Zinc']);
    assert.deepEqual(A.filtrerArticles(articles, { recherche: 'ardoise zinc' }), []);
  });
});

describe('B3 un code déjà utilisé par un article actif est refusé', () => {
  const base = appliquer([], creer({ libelle: 'Carrelage', prixAchat: 10, code: 'CAR-1' }));
  test('B3 logique : refus à la création (sans accents ni casse), le message nomme l’article et dit quoi faire', () => {
    const p = creer({ libelle: 'Autre', prixAchat: 3, code: ' car-1 ' }, base);
    assert.match(p.erreurs.code, /déjà utilisé par l’article actif « Carrelage »/);
    assert.match(p.erreurs.code, /Choisis un autre code, ou désactive/);
    assert.deepEqual(p.ecritures, []);
  });
  test('B3 logique : un code vide n’entre jamais en conflit ; le code d’un article désactivé est libre', () => {
    assert.deepEqual(creer({ libelle: 'A', prixAchat: 1, code: '' }, base).erreurs, {});
    const desactive = base.map((a) => ({ ...a, actif: false }));
    assert.deepEqual(creer({ libelle: 'B', prixAchat: 1, code: 'CAR-1' }, desactive).erreurs, {});
  });
  test('B3 logique : modifier le code vers un code pris est refusé ; garder son propre code est permis', () => {
    const deux = appliquer(base, creer({ libelle: 'Peinture', prixAchat: 5, code: 'PEI' }, base));
    const peinture = deux.find((a) => a.libelle === 'Peinture');
    assert.match(A.planMajArticle(peinture.id, { code: 'CAR-1' }, { articles: deux }).erreurs.code, /déjà utilisé/);
    assert.deepEqual(A.planMajArticle(peinture.id, { code: 'PEI' }, { articles: deux }).erreurs, {});
  });
  test('B3 logique : réactiver un article dont le code est repris par un article actif est refusé avec un message', () => {
    const ancien = { ...base[0], id: 'ancien', actif: false };
    const pris = [...base, ancien];
    const r = A.planActiverArticle('ancien', true, { articles: pris });
    assert.match(r.erreurs.code, /maintenant utilisé par l’article actif « Carrelage »/);
    assert.deepEqual(r.ecritures, []);
  });
});

describe('B4 désactiver sort l’article de la liste par défaut', () => {
  test('B4 logique : désactiver ne supprime rien (un patch actif: false), réactiver le remet ; le filtre « désactivés » le montre', () => {
    let articles = appliquer([], creer({ libelle: 'Carrelage', prixAchat: 10 }));
    const id = articles[0].id;
    const off = A.planActiverArticle(id, false, { articles });
    assert.deepEqual(off.ecritures.map((e) => [e.type, e.collection, e.id, e.patch]), [['modifier', 'devis_articles', id, { actif: false }]]);
    assert.ok(off.ecritures.every((e) => e.type !== 'supprimer'));
    articles = articles.map((a) => (a.id === id ? { ...a, actif: false } : a));
    assert.deepEqual(A.filtrerArticles(articles), [], 'sort de la liste par défaut');
    assert.deepEqual(A.filtrerArticles(articles, { statut: 'desactives' }).map((a) => a.id), [id]);
    assert.deepEqual(A.filtrerArticles(articles, { statut: 'tous' }).map((a) => a.id), [id]);
    const on = A.planActiverArticle(id, true, { articles });
    assert.deepEqual(on.ecritures.map((e) => e.patch), [{ actif: true }]);
    assert.deepEqual(A.planActiverArticle(id, false, { articles }).ecritures, [], 'déjà désactivé : rien à écrire');
    assert.match(A.MESSAGE_DESACTIVER, /ne se supprime jamais : il se désactive/);
    assert.equal(A.articleUtilise(), false);
  });
});

describe('B5 le prix d’achat se saisit en euros, virgule française acceptée', () => {
  test('B5 logique : « 12,5 », « 12.50 », « 1 234,5 € » et 12 sont acceptés ; le reste est refusé avec un message', () => {
    assert.equal(A.lirePrixAchat('12,5').prix, 12.5);
    assert.equal(A.lirePrixAchat('12.50').prix, 12.5);
    assert.equal(A.lirePrixAchat('1 234,5 €').prix, 1234.5);
    assert.equal(A.lirePrixAchat(12).prix, 12);
    assert.equal(A.lirePrixAchat('0').prix, 0);
    for (const mauvais of ['abc', '12,5,5', '', '--3', '1e3', '12 euros de plus']) assert.match(A.lirePrixAchat(mauvais).erreur, /prix d’achat doit être un nombre en euros/, mauvais);
    assert.match(A.lirePrixAchat('-1').erreur, /négatif/);
    assert.match(A.lirePrixAchat('12,345').erreur, /2 décimales au plus/);
    assert.match(A.lirePrixAchat('99999999').erreur, /trop grand/);
  });
  test('B5 logique : modifier le prix produit un patch en euros (nombre), sans toucher au reste', () => {
    const articles = appliquer([], creer({ libelle: 'Carrelage', prixAchat: 10, code: 'C' }));
    const r = A.planMajArticle(articles[0].id, { prixAchat: '12,75' }, { articles });
    assert.deepEqual(r.patch, { prixAchat: 12.75 });
    assert.deepEqual(r.ecritures.map((e) => [e.type, e.id, e.patch]), [['modifier', articles[0].id, { prixAchat: 12.75 }]]);
    assert.deepEqual(r.ecritures[0].horodater, ['modifieLe']);
    assert.deepEqual(A.planMajArticle(articles[0].id, { prixAchat: '10' }, { articles }).ecritures, [], 'même valeur : rien à écrire');
    assert.match(A.planMajArticle(articles[0].id, { prixAchat: 'beaucoup' }, { articles }).erreurs.prixAchat, /nombre en euros/);
    assert.match(A.planMajArticle(articles[0].id, { libelle: ' ' }, { articles }).erreurs.libelle, /obligatoire/);
    assert.equal(A.formaterPrix(12.5), '12,50 €');
    assert.equal(A.prixPourSaisie(12.5), '12,50');
  });
  test('B5 logique : un champ qui n’est pas modifiable (actif, proprietaire) est ignoré', () => {
    const articles = appliquer([], creer({ libelle: 'A', prixAchat: 1 }));
    assert.deepEqual(A.planMajArticle(articles[0].id, { actif: false, proprietaire: 'x' }, { articles }).ecritures, []);
  });
});

describe('B6 le titre de l’écran suit le nom de bordereau des réglages', () => {
  test('B6 logique : trois noms permis, « Catalogue » par défaut, un nom inconnu retombe sur le défaut', () => {
    assert.deepEqual(A.NOMS_BORDEREAU, ['Catalogue', 'Bordereau de prix unitaires', 'Grille tarifaire']);
    assert.equal(A.titreBordereau(null), 'Catalogue');
    assert.equal(A.titreBordereau({ nomBordereau: 'Grille tarifaire' }), 'Grille tarifaire');
    assert.equal(A.titreBordereau({ nomBordereau: 'Autre chose' }), 'Catalogue');
  });
});

describe('B7 les réglages s’enregistrent et se relisent', () => {
  test('B7 logique : valeurs par défaut', () => {
    assert.deepEqual(A.reglagesDevis(null), {
      nomBordereau: 'Catalogue', modeMarge: 'majoration', marge: 20, margeDevis: 20, regimeTva: 'assujetti', tauxProposes: [20, 10, 5.5], tauxTvaDefaut: 20,
      dureeValiditeJours: 90, etapeDevis: '', etapeAFaire: '', etapeEnvoye: '', mentionEmetteur: '', entreprise: {},
    });
    assert.deepEqual(A.reglagesDevis({}), A.reglagesDevis(undefined));
  });
  test('B7 logique : une saisie valide se relit à l’identique (aller-retour par reglagesDevis), virgule française acceptée', () => {
    const r = A.validerReglagesDevis({ nomBordereau: 'Catalogue', modeMarge: 'marge_vente', marge: '25,5', regimeTva: 'franchise', tauxProposes: [10, 20], tauxTvaDefaut: 10, dureeValiditeJours: '60', etapeDevis: 'c', etapeAFaire: 'a', etapeEnvoye: 'b', mentionEmetteur: '  Ma mention  ' });
    assert.deepEqual(r.erreurs, {});
    assert.deepEqual(r.reglages, { nomBordereau: 'Catalogue', modeMarge: 'marge_vente', marge: 25.5, margeDevis: 20, regimeTva: 'franchise', tauxProposes: [20, 10], tauxTvaDefaut: 10, dureeValiditeJours: 60, etapeDevis: 'c', etapeAFaire: 'a', etapeEnvoye: 'b', mentionEmetteur: 'Ma mention', entreprise: {} });
    assert.deepEqual(A.reglagesDevis(r.reglages), r.reglages);
  });
  test('13a logique : la marge globale du devis vaut 20 par défaut (document absent ou ancien sans le champ), se relit en virgule française, et reste distincte de la marge des articles', () => {
    assert.equal(A.reglagesDevis(null).margeDevis, 20);
    assert.equal(A.reglagesDevis({ marge: 35 }).margeDevis, 20, 'un ancien document sans margeDevis : 20, sans toucher à la marge des articles');
    assert.equal(A.reglagesDevis({ marge: 35 }).marge, 35);
    const r = A.validerReglagesDevis({ margeDevis: '12,5', marge: '30' });
    assert.deepEqual([r.erreurs, r.reglages.margeDevis, r.reglages.marge], [{}, 12.5, 30]);
    assert.equal(A.validerReglagesDevis({ margeDevis: 0 }).reglages.margeDevis, 0, '0 = aucune marge');
    assert.equal(A.validerReglagesDevis({ margeDevis: 1000 }).reglages.margeDevis, 1000);
  });
  test('13f logique : une marge globale négative, trop grande, illisible, ou de 100 % et plus en marge sur le prix de vente, est refusée avec un message', () => {
    for (const mauvaise of [-1, 1001, 'beaucoup', '', null]) {
      const r = A.validerReglagesDevis({ margeDevis: mauvaise });
      assert.equal(r.reglages, null, String(mauvaise));
      assert.match(r.erreurs.margeDevis, /entre 0 et 1000/);
    }
    const vente = A.validerReglagesDevis({ modeMarge: 'marge_vente', marge: 20, margeDevis: 100 });
    assert.ok(vente.erreurs.margeDevis);
  });
  test('E1 logique : « Mon entreprise » vide par défaut ; un champ vide n’est pas enregistré ; les clés sont celles que le document lit', () => {
    assert.deepEqual(A.reglagesDevis(null).entreprise, {});
    const r = A.validerReglagesDevis({ entreprise: { nom: '  Mon   Entreprise ', forme: '', siret: '123 456 789 00012', adresse: { ligne1: '1 rue des Lilas', codePostal: '75001', ville: 'Paris' }, email: 'contact@exemple.fr', couleur: '#1F6FEB',
      assurance: { garantie: 'Décennale', assureur: 'Assureur SA', adresse: '', zone: 'France' }, mediateur: { nom: 'Médiateur', email: '', site: 'https://exemple.fr' } } });
    assert.deepEqual(r.erreurs, {});
    assert.deepEqual(r.reglages.entreprise, { nom: 'Mon Entreprise', siret: '123 456 789 00012', adresse: { ligne1: '1 rue des Lilas', codePostal: '75001', ville: 'Paris' }, email: 'contact@exemple.fr', couleur: '#1f6feb',
      assurance: { garantie: 'Décennale', assureur: 'Assureur SA', zone: 'France' }, mediateur: { nom: 'Médiateur', site: 'https://exemple.fr' } });
    assert.deepEqual(A.reglagesDevis(r.reglages), r.reglages);
    assert.deepEqual(A.validerReglagesDevis({ entreprise: {} }).reglages.entreprise, {});
  });
  test('E2 logique : e-mail, couleur et longueurs sont refusés avec un message qui dit quoi faire ; une adresse en simple texte est acceptée', () => {
    const r = A.validerReglagesDevis({ entreprise: { email: 'pas-un-email', couleur: 'rouge', nom: 'x'.repeat(121), mediateur: { email: 'a@b' } } });
    assert.equal(r.reglages, null);
    assert.match(r.erreurs['entreprise.email'], /contact@exemple\.fr/);
    assert.match(r.erreurs['entreprise.couleur'], /#/);
    assert.match(r.erreurs['entreprise.nom'], /raccourcis/);
    assert.ok(r.erreurs['entreprise.mediateur.email']);
    assert.deepEqual(A.validerEntreprise({ adresse: '3 impasse X, 69000 Lyon' }).entreprise, { adresse: { ligne1: '3 impasse X, 69000 Lyon' } });
  });
  test('15 logique : le groupe paiement (méthodes) est gardé à l\'enregistrement et à la lecture, nettoyé, avec IBAN et délai conservés sans être saisis', () => {
    const e = A.validerEntreprise({ paiement: { modes: ['Virement', ' Chèque ', 'Virement', '', 5], autre: 'Paiement en trois fois', iban: 'FR76', delaiJours: 30 } });
    assert.deepEqual(e.entreprise.paiement, { modes: ['Virement', 'Chèque', 'Paiement en trois fois'], iban: 'FR76', delaiJours: 30 });
    assert.deepEqual(A.reglagesDevis({ entreprise: { paiement: { modes: ['Espèces'] } } }).entreprise, { paiement: { modes: ['Espèces'] } });
    assert.deepEqual(A.validerEntreprise({ paiement: { modes: [], autre: '  ' } }).entreprise, {}); // rien de coché : le groupe n'existe pas
    assert.deepEqual(A.reglagesDevis({}).entreprise, {}); // ancienne entreprise sans le champ : inchangée
    assert.deepEqual(A.reglagesDevis({ entreprise: { paiement: 'texte' } }).entreprise, {});
    assert.match(A.validerEntreprise({ paiement: { autre: 'x'.repeat(61) } }).erreurs['entreprise.paiement.autre'], /raccourcis/);
    assert.deepEqual(A.validerEntreprise({ paiement: { modes: ['Virement'], autre: 'PayPal, Lydia' } }).entreprise.paiement.modes, ['Virement', 'PayPal', 'Lydia']); // migration d'anciens modes hors liste
    assert.deepEqual(A.MODES_PAIEMENT, ['Carte bancaire', 'Virement', 'Chèque', 'Espèces', 'Prélèvement']);
  });
  test('E3 logique : une donnée illisible dans la base est ignorée champ par champ, sans erreur', () => {
    assert.deepEqual(A.reglagesDevis({ entreprise: { nom: 'Ok', email: 'faux', couleur: 'zzz', assurance: 'texte', mediateur: { nom: 5 } } }).entreprise, { nom: 'Ok', mediateur: { nom: '5' } });
    assert.deepEqual(A.reglagesDevis({ entreprise: 'texte' }).entreprise, {});
  });
  test('B7 logique : une marge « marge sur prix de vente » de 100 % ou plus est refusée avec un message ; 99 % et les marges négatives sont acceptées ; la majoration n’a pas de limite', () => {
    const essai = (modeMarge, marge) => A.validerReglagesDevis({ modeMarge, marge });
    for (const m of [100, '100', 150, '100,5']) {
      const r = essai('marge_vente', m);
      assert.ok(r.erreurs.marge.startsWith(ERREUR_MARGE_100), String(m));
      assert.match(r.erreurs.marge, /Choisis un pourcentage plus petit/);
      assert.equal(r.reglages, null);
    }
    assert.deepEqual(essai('marge_vente', 99).erreurs, {});
    assert.deepEqual(essai('marge_vente', -30).erreurs, {});
    assert.deepEqual(essai('majoration', 250).erreurs, {});
    assert.deepEqual(essai('majoration', -10).erreurs, {});
    assert.match(essai('majoration', 'beaucoup').erreurs.marge, /nombre en pourcentage/);
  });
  test('B7 logique : le mode « marge sur prix de vente » avec la marge actuelle de 100 % déjà enregistrée est refusé aussi quand on ne change que le mode', () => {
    const r = A.validerReglagesDevis({ modeMarge: 'marge_vente' }, { actuels: { ...A.reglagesDevis(null), marge: 100 } });
    assert.ok(r.erreurs.marge);
  });
  test('B7 logique : durée, taux et étapes sont contrôlés', () => {
    const e = (saisie) => A.validerReglagesDevis(saisie).erreurs;
    assert.match(e({ dureeValiditeJours: '0' }).dureeValiditeJours, /nombre entier de jours/);
    assert.match(e({ dureeValiditeJours: 'x' }).dureeValiditeJours, /nombre entier/);
    assert.match(e({ dureeValiditeJours: '1,5' }).dureeValiditeJours, /nombre entier/);
    assert.match(e({ tauxProposes: [] }).tauxProposes, /au moins un taux/);
    assert.match(e({ tauxProposes: [10], tauxTvaDefaut: 20 }).tauxTvaDefaut, /l’un des taux proposés/);
    // 7 plus de réglage « étape des devis » (retiré le 28/10/2026) : jamais d'erreur, et l'ancienne valeur est recopiée telle quelle (setDoc sans merge : sinon elle serait effacée)
    assert.deepEqual(e({ etapeDevis: 'inconnue' }), {});
    assert.deepEqual(e({ etapeDevis: '' }), {});
    const anciens = A.validerReglagesDevis({ marge: 25 }, { actuels: { etapeDevis: 'c', etapeAFaire: 'a', etapeEnvoye: 'b' } }).reglages;
    assert.deepEqual([anciens.etapeDevis, anciens.etapeAFaire, anciens.etapeEnvoye], ['c', 'a', 'b']);
    assert.equal(A.reglagesDevis({ etapeAFaire: 'a', etapeEnvoye: 'b' }).etapeDevis, '', 'plus de reprise de « à faire »');
    assert.equal(A.reglagesDevis({ etapeDevis: 'c', etapeAFaire: 'a' }).etapeDevis, 'c');
    assert.match(e({ nomBordereau: 'Liste' }).nomBordereau, /Choisis un nom/);
    assert.match(e({ mentionEmetteur: 'x'.repeat(501) }).mentionEmetteur, /trop longue/);
  });
  test('B7 logique : les constantes viennent de logique.js (modes, régimes, taux)', () => {
    assert.deepEqual(MODES_MARGE.map((m) => m.id), ['majoration', 'marge_vente']);
    assert.deepEqual(REGIMES_TVA.map((r) => r.id), ['franchise', 'assujetti']);
    assert.deepEqual(TAUX_TVA_DEFAUT, [20, 10, 5.5]);
    assert.match(lire('js/modules/devis/articles.js'), /from '\.\/logique\.js'/);
  });
});

describe('B8 règles Firestore : déclaration (les parcours sont dans regles-plateforme.test.js)', () => {
  test('B8 les règles de la plateforme clients nomment devis_articles, interdisent la suppression et sortent la collection de la règle générale d\'écriture', () => {
    const r2 = lire('firestore.plateforme.rules');
    assert.match(r2, /match \/clients\/\{client\}\/devis_articles\/\{id\} \{[^}]*allow delete: if false;/);
    assert.match(r2, /function collectionSansSuppression\(collection\) \{\s+return collection in \['devis_articles', 'devis_vocabulaire'\];/);
    assert.match(r2, /!collectionSansSuppression\(collection\) && (?:!collectionDesDevis\(collection\) && )?roleDe\(client\) == 'editeur'/);
    // Les règles des devis eux-mêmes (devis_devis, devis_compteurs) sont arrivées avec la couche de données : elles sont testées dans devis-regles.test.js (C1).
    assert.match(r2, /match \/clients\/\{client\}\/devis_devis\/\{id\}/);
    assert.doesNotMatch(r2, /devis_parametres/, 'les réglages du module restent sous la règle générale des données du client');
  });
  test('B8 les règles de la base de Jérôme interdisent la suppression d\'un article (les réglages restent sous le joker) ; aucun outil ni écran ne supprime un article', () => {
    // Seuls les devis eux-mêmes (devis_devis, devis_compteurs) ont des règles dans firestore.rules : voir devis-regles.test.js (C1).
    const r = lire('firestore.rules');
    assert.match(r, /match \/devis_articles\/\{id\} \{\s+allow read, create, update: if compteAutorise\(\);\s+allow delete: if false;/); // ni suppression, même depuis la console du navigateur
    assert.doesNotMatch(r, /devis_parametres/);
    const ecrans = ['bordereau.js', 'donnees.js', 'reglages.js', 'index.js', 'articles.js'].map((f) => lire(`js/modules/devis/${f}`)).join('\n').replace(/\/\/.*$/gm, '');
    assert.doesNotMatch(ecrans, /deleteDoc|lot\.delete|ecritureSupprimer|type: 'supprimer'/, 'un article ne se supprime jamais');
    assert.doesNotMatch(lire('functions/src/mcp/outils/ecriture.js') + lire('functions/src/mcp/outils/suppression.js'), /supprimer_article/);
  });
});

describe('B9 assistant : outils déclarés', () => {
  test('B9 le registre déclare les cinq outils du bordereau', () => {
    assert.deepEqual(moduleDeclare('devis').outilsMcp, ['lister_articles', 'chercher_article', 'lire_reglages_devis', 'creer_article', 'modifier_article', 'desactiver_article', 'lister_devis', 'lire_devis', 'creer_devis_brouillon', 'modifier_devis_brouillon', 'finaliser_devis', 'nouvelle_version_devis', 'archiver_devis', 'enregistrer_envoi_devis', 'changer_statut_devis', 'supprimer_devis', 'rechercher_article_par_phrase', 'enregistrer_reponse_vocabulaire']);
  });
});

describe('B10 cas vide et cas d’erreur du bordereau (décrits dans l’écran)', () => {
  test('B10 les messages du cas vide et du cas d’erreur existent dans l’écran, avec un bouton « + Article » dans le cas vide', () => {
    const ecran = lire('js/modules/devis/bordereau.js');
    assert.match(ecran, /Aucun article\. Un article est une ligne de ton catalogue de prix/);
    assert.match(ecran, /nouvel-article-vide/);
    assert.match(ecran, /La dernière version reste affichée/);
    assert.match(ecran, /Enregistrement impossible : ton compte n’a peut-être que le droit de lire/);
    assert.doesNotMatch(ecran.replace(/\/\/.*$/gm, ''), /\b(innerHTML|insertAdjacentHTML|outerHTML)\b/, 'jamais de HTML injecté');
  });
  test('B10 le mot « CRM » n’apparaît dans aucun texte de l’écran, des réglages ni du registre du module Devis', () => {
    for (const f of ['js/modules/devis/bordereau.js', 'js/modules/devis/reglages.js']) {
      const visible = lire(f).split('\n').filter((l) => !/^\s*(\/\/|import )/.test(l)).join('\n').replace(/\/\/.*$/gm, '').replace(/\bCRM\.[a-zA-Z]+/g, '');
      assert.doesNotMatch(visible, /CRM/, f);
    }
  });
});
