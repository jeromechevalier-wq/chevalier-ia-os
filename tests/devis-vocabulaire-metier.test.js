// Module Devis, le mot du métier (cadrage-devis-fluide.md, 4.3, PR 8) : réglage `motOuvrage`, grammaire, synonyme du moteur. Réglages et articles INVENTÉS.
// V1 la liste fermée et « Autre » ; V4 le moteur reconnaît le mot choisi comme synonyme du type ouvrage. (V3 : les réponses de l'assistant, dans devis-mcp.test.js.)
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as A from '../js/modules/devis/articles.js';
import { motOuvrage, MOTS_OUVRAGE } from '../js/modules/devis/ouvrages.js';
import { interpreter } from '../js/modules/devis/vocabulaire.js';

const lire = (f) => readFileSync(fileURLToPath(new URL(`../${f}`, import.meta.url)), 'utf8');
const AUTRE_OK = { singulier: 'chantier', pluriel: 'chantiers', genre: 'masculin' };

describe('V1 motOuvrage : liste fermée, grammaire, « Autre » validé', () => {
  test('V1 défaut « ouvrage » : réglages absents, vides, ou mot inconnu', () => {
    for (const r of [null, undefined, {}, { motOuvrage: 'machin' }, { motOuvrage: 42 }, { motOuvrage: 'autre' }, { motOuvrage: 'autre', motOuvrageAutre: { singulier: 'x' } }]) {
      assert.deepEqual(motOuvrage(r), { singulier: 'ouvrage', pluriel: 'ouvrages', genre: 'masculin', un: 'un', le: 'le', cet: 'cet', leMot: 'l’ouvrage' });
    }
    assert.equal(A.reglagesDevis(null).motOuvrage, 'ouvrage');
    assert.deepEqual(A.reglagesDevis(null).motOuvrageAutre, {});
  });
  test('V1 chaque mot de la liste : singulier, pluriel, genre, un / le / cet', () => {
    assert.deepEqual(MOTS_OUVRAGE.map((m) => m.id), ['ouvrage', 'ensemble', 'forfait', 'prestation', 'lot']);
    assert.deepEqual(motOuvrage({ motOuvrage: 'ensemble' }), { singulier: 'ensemble', pluriel: 'ensembles', genre: 'masculin', un: 'un', le: 'le', cet: 'cet', leMot: 'l’ensemble' });
    assert.deepEqual(motOuvrage({ motOuvrage: 'forfait' }), { singulier: 'forfait', pluriel: 'forfaits', genre: 'masculin', un: 'un', le: 'le', cet: 'ce', leMot: 'le forfait' });
    assert.deepEqual(motOuvrage({ motOuvrage: 'prestation' }), { singulier: 'prestation', pluriel: 'prestations', genre: 'feminin', un: 'une', le: 'la', cet: 'cette', leMot: 'la prestation' });
    assert.deepEqual(motOuvrage({ motOuvrage: 'lot' }), { singulier: 'lot', pluriel: 'lots', genre: 'masculin', un: 'un', le: 'le', cet: 'ce', leMot: 'le lot' });
  });
  test('V1 « Autre » valide : le mot saisi (féminin accepté avec ou sans accent)', () => {
    assert.deepEqual(motOuvrage({ motOuvrage: 'autre', motOuvrageAutre: AUTRE_OK }), { singulier: 'chantier', pluriel: 'chantiers', genre: 'masculin', un: 'un', le: 'le', cet: 'ce', leMot: 'le chantier' });
    const f = motOuvrage({ motOuvrage: 'autre', motOuvrageAutre: { singulier: ' Œuvre ', pluriel: 'œuvres', genre: 'féminin' } });
    assert.deepEqual([f.singulier, f.genre, f.un, f.le, f.cet, f.leMot], ['Œuvre', 'feminin', 'une', 'la', 'cette', 'l’Œuvre']);
  });
  test('V1 « Autre » invalide : refusé à l’enregistrement avec une phrase par champ, jamais écrit', () => {
    const base = { motOuvrage: 'autre' };
    for (const mauvais of [{}, { singulier: 'a', pluriel: 'ab', genre: 'masculin' }, { singulier: 'x'.repeat(31), pluriel: 'ok', genre: 'masculin' }, { singulier: 'mot', pluriel: 'mots', genre: 'neutre' }, { singulier: 'mot2', pluriel: 'mots', genre: 'masculin' }, { singulier: '<b>', pluriel: 'mots', genre: 'masculin' }]) {
      const r = A.validerReglagesDevis({ ...base, motOuvrageAutre: mauvais });
      assert.equal(r.reglages, null, JSON.stringify(mauvais));
      assert.ok(Object.keys(r.erreurs).some((k) => k.startsWith('motOuvrageAutre.')), JSON.stringify(mauvais));
    }
    const bornes = A.validerReglagesDevis({ motOuvrage: 'autre', motOuvrageAutre: { singulier: 'ab', pluriel: 'x'.repeat(30), genre: 'feminin' } });
    assert.deepEqual(bornes.erreurs, {}, '2 et 30 lettres sont permis');
    assert.deepEqual(A.validerReglagesDevis({ motOuvrage: 'machin' }).erreurs, { motOuvrage: 'Choisis un mot parmi : ouvrage, ensemble, forfait, prestation, lot, autre.' });
  });
  test('V1 aller-retour : « Enregistrer » (setDoc sans fusion) recopie le mot choisi, même quand l’écran ne l’envoie pas', () => {
    const choisi = A.validerReglagesDevis({ motOuvrage: 'autre', motOuvrageAutre: AUTRE_OK });
    assert.deepEqual(choisi.erreurs, {});
    assert.equal(choisi.reglages.motOuvrage, 'autre');
    assert.deepEqual(choisi.reglages.motOuvrageAutre, AUTRE_OK);
    assert.deepEqual(A.reglagesDevis(choisi.reglages), choisi.reglages);
    // L'écran des réglages d'aujourd'hui n'envoie pas le mot : il doit survivre à l'enregistrement d'une autre valeur.
    const apres = A.validerReglagesDevis({ marge: 25, nomBordereau: 'Catalogue' }, { actuels: choisi.reglages });
    assert.equal(apres.reglages.motOuvrage, 'autre');
    assert.deepEqual(apres.reglages.motOuvrageAutre, AUTRE_OK);
    assert.ok(A.CLES_REGLAGES_DEVIS.includes('motOuvrage') && A.CLES_REGLAGES_DEVIS.includes('motOuvrageAutre'));
    assert.deepEqual(Object.keys(apres.reglages).sort(), [...A.CLES_REGLAGES_DEVIS].sort(), 'chaque clé des réglages est écrite');
  });
  test('V1 espace sans réglage : rien ne s’écrit (la lecture est pure, le défaut ne passe que par la fonction)', () => {
    const brut = Object.freeze({ marge: 30 });
    assert.equal(motOuvrage(brut).singulier, 'ouvrage');
    assert.deepEqual(brut, { marge: 30 });
  });
  test('V1 le PDF du client ne contient pas le mot (verrouillage : « ouvrage » seulement en commentaire ou dans cacherElementsOuvrage)', () => {
    const code = lire('js/modules/devis/document.js').split('\n').filter((l) => !/^\s*(\/\/|\/?\*)/.test(l)).map((l) => l.replace(/\/\/.*$/, '')).join('\n');
    const lignes = code.split('\n').filter((l) => /ouvrage/i.test(l));
    for (const l of lignes) assert.match(l, /cacherElementsOuvrage|elementsOuvrage|\.ouvrage\b|ouvrage\??\./i, `texte visible avec « ouvrage » : ${l}`);
  });
});

describe('V4 le moteur reconnaît le mot choisi comme synonyme du type ouvrage', () => {
  const art = (id, libelle, extra = {}) => ({ id, libelle, prixAchat: 10, unite: 'u', actif: true, ...extra });
  const articles = [art('o1', 'Salle de bain', { type: 'ouvrage', composants: [] }), art('p1', 'Salle de bain', { type: 'fourniture' }), art('p2', 'Robinet salle de bain')];
  const meilleur = (phrase, reglages) => interpreter(phrase, { regles: [], articles, reglages }).candidats[0];

  test('V4 « ensemble salle de bain » trouve l’ouvrage « Salle de bain » (singulier et pluriel, accents et casse ignorés)', () => {
    for (const phrase of ['mets ensemble salle de bain', 'Ensemble Salle de bain', 'ajoute 2 ensembles salle de bain']) {
      const c = meilleur(phrase, { motOuvrage: 'ensemble' });
      assert.equal(c.articleId, 'o1', phrase);
    }
  });
  test('V4 sans ce réglage le mot ne change rien ; un mot du métier « Autre » marche aussi ; aucune règle n’est créée', () => {
    assert.notEqual(meilleur('ensemble salle de bain', { motOuvrage: 'forfait' })?.articleId, 'o1');
    assert.equal(meilleur('chantier salle de bain', { motOuvrage: 'autre', motOuvrageAutre: AUTRE_OK }).articleId, 'o1');
    const r = interpreter('ensemble salle de bain', { regles: [], articles, reglages: { motOuvrage: 'ensemble' } });
    assert.ok(r.candidats.every((c) => c.regleId === null), 'aucune règle devis_vocabulaire');
  });
  test('V4 la phrase qui se réduit au seul mot, ou sans le mot, est lue comme avant', () => {
    const avant = interpreter('salle de bain', { regles: [], articles });
    assert.deepEqual(interpreter('salle de bain', { regles: [], articles, reglages: { motOuvrage: 'ensemble' } }), avant);
    assert.deepEqual(interpreter('ensemble', { regles: [], articles, reglages: { motOuvrage: 'ensemble' } }), interpreter('ensemble', { regles: [], articles }));
  });
});
