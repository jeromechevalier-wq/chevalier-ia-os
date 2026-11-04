// Saisie des adresses « comme dans Gmail » (04/11/2026) : la logique pure du composant partagé (fenêtre « Préparer l'e-mail » + éditeur du devis),
// et les liens avec le serveur (les deux phrases de limite). Chaque test commence par le numéro du point du brief.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { decouper, ajouterPlusieurs, filtrerSuggestions } from '../js/modules/devis/saisie-adresses-logique.js';
import * as P from '../js/modules/devis/email-preparer.js';
import * as Ed from '../js/modules/devis/editeur-logique.js';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => readFileSync(join(racine, f), 'utf8');
const sansCommentaires = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const refuserFenetre = (cle) => (a, courante) => P.ajouterAdresse(cle === 'copie' ? { destinataires: [], copie: courante } : { destinataires: courante, copie: [] }, cle, a).erreur ?? null;

describe('1 composant : découpage et ajout', () => {
  test('1 découpe sur virgule, point-virgule, espace et retour à la ligne ; « Nom <a@b.fr> » donne l’adresse', () => {
    assert.deepEqual(decouper('a@x.fr, b@x.fr;c@x.fr  d@x.fr\ne@x.fr'), ['a@x.fr', 'b@x.fr', 'c@x.fr', 'd@x.fr', 'e@x.fr']);
    assert.deepEqual(decouper('<a@x.fr>'), ['a@x.fr']);
    assert.deepEqual(decouper('  ,; '), []);
  });
  test('1 collage « Nom <adresse> » : on garde seulement l’adresse, même avec un nom entre guillemets ou plusieurs contacts', () => {
    assert.deepEqual(decouper('Marie Durand <marie@exemple.fr>'), ['marie@exemple.fr']);
    assert.deepEqual(decouper('"Durand, Marie" <marie@exemple.fr>, Paul <paul@exemple.fr>; seul@exemple.fr'), ['marie@exemple.fr', 'paul@exemple.fr', 'seul@exemple.fr']);
    const r = ajouterPlusieurs([], 'Marie Durand <marie@exemple.fr>', refuserFenetre('destinataires'));
    assert.deepEqual(r.liste, ['marie@exemple.fr']);
    assert.equal(r.erreur, null);
  });
  test('1 collage de 3 adresses : les trois sont ajoutées, rien ne reste dans le champ', () => {
    const r = ajouterPlusieurs([], 'a@exemple.fr, b@exemple.fr; c@exemple.fr', refuserFenetre('destinataires'));
    assert.deepEqual(r.liste, ['a@exemple.fr', 'b@exemple.fr', 'c@exemple.fr']);
    assert.equal(r.erreur, null);
    assert.equal(r.reste, '');
  });
  test('1 doublon : on s’arrête à l’adresse refusée, qui reste dans le champ avec les suivantes', () => {
    const r = ajouterPlusieurs(['a@exemple.fr'], 'b@exemple.fr A@exemple.fr c@exemple.fr', refuserFenetre('destinataires'));
    assert.deepEqual(r.liste, ['a@exemple.fr', 'b@exemple.fr']);
    assert.match(r.erreur, /déjà dans la liste/);
    assert.equal(r.reste, 'A@exemple.fr c@exemple.fr');
  });
  test('1 adresse invalide : message de la fenêtre ; avec les règles de l’éditeur, message de l’éditeur', () => {
    assert.match(ajouterPlusieurs([], 'pas-une-adresse', refuserFenetre('destinataires')).erreur, /n’est pas valide/);
    const r = ajouterPlusieurs([], 'pas-une-adresse', (a, l) => Ed.refusAjoutDestinataire(a, l, []));
    assert.equal(r.erreur, Ed.MESSAGE_COPIE_INVALIDE);
    assert.equal(r.reste, 'pas-une-adresse');
  });
  test('1 maximum : la fenêtre s’arrête à 10 adresses, l’éditeur au plafond de la copie', () => {
    const onze = Array.from({ length: 11 }, (_, i) => `p${i}@exemple.fr`).join(' ');
    const f = ajouterPlusieurs([], onze, refuserFenetre('copie'));
    assert.equal(f.liste.length, 10);
    assert.equal(f.erreur, P.maximumAtteint(10));
    assert.equal(f.reste, 'p10@exemple.fr');
    const e = ajouterPlusieurs([], onze, (a, l) => Ed.refusAjoutCopie(a, l, []));
    assert.equal(e.liste.length, 10);
    assert.equal(e.erreur, Ed.MESSAGE_COPIE_PLAFOND);
  });
  test('2 suggestions : celles de la fiche, sans les adresses déjà utilisées ni les doublons, en liste courte', () => {
    assert.deepEqual(filtrerSuggestions(['A@x.fr', 'b@x.fr', 'a@x.fr', 'c@x.fr'], ['b@X.fr']), ['A@x.fr', 'c@x.fr']);
    assert.equal(filtrerSuggestions(Array.from({ length: 20 }, (_, i) => `s${i}@x.fr`)).length, 6);
    assert.deepEqual(filtrerSuggestions(null), []);
  });
});

describe('4 message de limite du serveur', () => {
  test('4 les deux phrases du navigateur sont exactement celles du serveur (functions/src/coeur/devis-email.js)', () => {
    const serveur = lire('functions/src/coeur/devis-email.js');
    assert.ok(serveur.includes(`'${P.MESSAGE_LIMITE_BROUILLON_CREE}'`), 'phrase « brouillon créé » différente du serveur');
    assert.ok(serveur.includes(`'${P.MESSAGE_LIMITE_EN_COURS}'`), 'phrase « préparation en cours » différente du serveur');
  });
  test('4 estMessageDeLimite reconnaît les deux phrases et rien d’autre', () => {
    assert.equal(P.estMessageDeLimite(P.MESSAGE_LIMITE_BROUILLON_CREE), true);
    assert.equal(P.estMessageDeLimite(` ${P.MESSAGE_LIMITE_EN_COURS} `), true);
    assert.equal(P.estMessageDeLimite(P.MESSAGE_FENETRE_ERREUR), false);
    assert.equal(P.estMessageDeLimite(''), false);
    assert.equal(P.estMessageDeLimite(undefined), false);
  });
});

describe('1 5 câblage du composant', () => {
  test('1 le composant n’importe que ui.js et sa logique pure ; il ne connaît ni l’éditeur, ni n8n, ni le mot « CRM »', () => {
    const t = sansCommentaires(lire('js/modules/devis/saisie-adresses.js'));
    const imports = [...t.matchAll(/from '([^']+)'/g)].map((m) => m[1]);
    assert.deepEqual(imports.sort(), ['../../os/ui.js', './saisie-adresses-logique.js']);
    for (const f of ['saisie-adresses.js', 'saisie-adresses-logique.js']) assert.ok(!/CRM|n8n|fetch\(|webhook/i.test(sansCommentaires(lire(`js/modules/devis/${f}`))), f);
  });
  test('1 5 la fenêtre ET l’éditeur utilisent le même composant (les anciens blocs « + E-mail du destinataire » ont disparu)', () => {
    const fenetre = lire('js/modules/devis/email-preparer-ecran.js');
    const editeur = lire('js/modules/devis/editeur-ecran.js');
    assert.match(fenetre, /saisieAdresses\(/);
    assert.match(editeur, /saisieAdresses\(/);
    assert.ok(!/contact@exemple\.fr/.test(fenetre + editeur), 'plus d’exemple gris qui ressemble à une vraie valeur');
    assert.ok(!/E-mail du destinataire|E-mail en copie/.test(editeur));
  });
  test('3 le bouton principal est le premier de la rangée et la rangée est calée à gauche', () => {
    const fenetre = lire('js/modules/devis/email-preparer-ecran.js');
    assert.ok(fenetre.indexOf('P.LIBELLE_PREPARER_BROUILLON') < fenetre.indexOf("libelle: 'Annuler'"));
    assert.match(lire('css/devis.css'), /\.dialogue-preparer-email \.dialogue-pied \{ justify-content: flex-start; \}/);
  });
});
