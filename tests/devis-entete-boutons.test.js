// Haut de page d'un devis : la règle des boutons (js/modules/devis/entete-boutons.js), SANS navigateur. node --test.
// Le nom d'un test commence par le numéro du critère (brief du 26/10/2026) : 8 = la règle est une fonction pure testée sur tous les statuts.
import assert from 'node:assert/strict';
import { test, describe } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { boutonsEntete, boutonJaune, MESSAGE_FINALISER_POUR_ENVOYER } from '../js/modules/devis/entete-boutons.js';
import { emailPossible } from '../js/modules/devis/email-brouillon.js';
import { estExpire } from '../js/modules/devis/logique.js';

const lire = (chemin) => readFileSync(fileURLToPath(new URL(`../${chemin}`, import.meta.url)), 'utf8');
const regle = (statut, extra = {}) => boutonsEntete({ statut, emailPossible: emailPossible(statut).actif, ...extra });
const libelles = (r) => [r.jaune?.libelle ?? null, r.autre?.libelle ?? null];

describe('8 boutonsEntete : un seul bouton jaune, celui de l\'étape suivante', () => {
  test('8 brouillon : « Finaliser » jaune, « Envoyer » grisé à côté ; l\'e-mail reste dans « … » sous le nom « Envoyer par e-mail »', () => {
    const r = regle('brouillon');
    assert.deepEqual(r.jaune, { cle: 'finaliser', libelle: 'Finaliser', icone: 'check' });
    assert.equal(r.autre.libelle, 'Envoyer');
    assert.equal(r.autre.grise, true);
    assert.equal(r.menu.envoyerANouveau.libelle, 'Envoyer par e-mail');
    assert.equal(r.menu.envoyerANouveau.actif, true); // actif : il ouvre « Finaliser d\'abord »
    assert.equal(r.menu.telechargerPdf, true);
    assert.equal(r.menu.imprimer, true);
  });
  test('8 finalisé (en_attente_envoi) : « Envoyer » jaune ; « Passer à « Envoyé » » reste visible en contour ; jamais de « Finaliser »', () => {
    const r = regle('en_attente_envoi');
    assert.deepEqual(libelles(r), ['Envoyer', 'Passer à « Envoyé »']);
    assert.equal(r.jaune.cle, 'envoyer');
    assert.equal(r.autre.style, 'contour');
    assert.ok(!r.autre.grise);
    assert.deepEqual(r.menu.envoyerANouveau, { present: true, libelle: 'Envoyer à nouveau', actif: true });
  });
  test('8 envoyé : « Marquer comme signé » jaune ET « Marquer comme refusé » en contour', () => {
    const r = regle('envoye');
    assert.deepEqual(libelles(r), ['Marquer comme signé', 'Marquer comme refusé']);
    assert.equal(r.jaune.cle, 'signer');
    assert.equal(r.autre.cle, 'refuser');
    assert.equal(r.autre.style, 'contour');
    assert.deepEqual(r.menu.envoyerANouveau, { present: true, libelle: 'Envoyer à nouveau', actif: true });
  });
  test('8 signé, refusé, remplacé : aucun bouton ; « Envoyer à nouveau » grisé (l\'e-mail n\'est plus possible)', () => {
    for (const statut of ['accepte', 'refuse', 'remplace']) {
      const r = regle(statut);
      assert.deepEqual([r.jaune, r.autre], [null, null], statut);
      assert.deepEqual(r.menu.envoyerANouveau, { present: true, libelle: 'Envoyer à nouveau', actif: false }, statut);
      assert.equal(r.menu.imprimer, true);
      assert.equal(r.menu.telechargerPdf, true);
    }
  });
  test('8 archivé (drapeau, pas un statut) : aucun bouton, même si le statut stocké est « accepte »', () => {
    const r = regle('accepte', { archive: true });
    assert.deepEqual([r.jaune, r.autre], [null, null]);
    assert.equal(r.menu.imprimer, true);
    assert.deepEqual(regle('refuse', { archive: true }).jaune, null);
  });
  test('8 expiré : un envoyé expiré garde « signé / refusé » ; un finalisé expiré garde la ligne « Finalisé » (Envoyer)', () => {
    const aujourdhui = '2026-10-26';
    const envoye = { statut: 'envoye', expireLe: '2026-10-01' };
    const finalise = { statut: 'en_attente_envoi', expireLe: '2026-10-01' };
    assert.equal(estExpire(envoye, aujourdhui), true);
    assert.equal(estExpire(finalise, aujourdhui), true);
    assert.deepEqual(libelles(regle('envoye', { expire: estExpire(envoye, aujourdhui) })), ['Marquer comme signé', 'Marquer comme refusé']);
    assert.deepEqual(libelles(regle('en_attente_envoi', { expire: estExpire(finalise, aujourdhui) })), ['Envoyer', 'Passer à « Envoyé »']);
  });
  test('8 visualisation : la règle est la même qu\'en édition (un brouillon regardé se finalise aussi)', () => {
    for (const statut of ['brouillon', 'en_attente_envoi', 'envoye', 'accepte', 'refuse', 'remplace']) {
      assert.deepEqual(regle(statut, { lecture: true }), regle(statut, { lecture: false }), statut);
    }
  });
  test('8 « Envoyer à nouveau » suit emailPossible ; un statut inconnu ou une absence de donnée ne plante pas', () => {
    assert.equal(boutonsEntete({ statut: 'envoye', emailPossible: false }).menu.envoyerANouveau.actif, false);
    assert.equal(boutonsEntete({ statut: 'envoye', emailPossible: true }).menu.envoyerANouveau.actif, true);
    const vide = boutonsEntete();
    assert.deepEqual([vide.jaune, vide.autre], [null, null]);
    assert.equal(boutonsEntete({ statut: 'inconnu' }).jaune, null);
  });
  test('8 le choix du bouton jaune est UNE petite fonction (facile à changer plus tard)', () => {
    assert.equal(boutonJaune({ statut: 'en_attente_envoi' }).libelle, 'Envoyer');
    assert.equal(boutonJaune({ statut: 'envoye', archive: true }), null);
    assert.match(lire('js/modules/devis/entete-boutons.js'), /export function boutonJaune/);
  });
  test('1 le message affiché au clic sur « Envoyer » grisé dit quoi faire', () => {
    assert.equal(MESSAGE_FINALISER_POUR_ENVOYER, 'Finalise le devis pour pouvoir l’envoyer');
  });
  test('8 l\'écran ne contient aucune règle de statut : il lit boutonsEntete (pas de « statut === » pour choisir les boutons)', () => {
    const ecran = lire('js/modules/devis/editeur-ecran.js');
    assert.match(ecran, /boutonsEntete\(\{/);
    assert.ok(!/peutPasserEnvoye|boutonPasserEnvoye/.test(ecran), 'les anciens boutons décidés dans l\'écran ont disparu');
  });
});
