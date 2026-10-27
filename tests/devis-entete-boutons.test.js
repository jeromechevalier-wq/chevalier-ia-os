// Haut de page d'un devis : la règle des boutons (js/modules/devis/entete-boutons.js), SANS navigateur. node --test.
// Le nom d'un test commence par le numéro du critère (brief du 26/10/2026) : 8 = la règle est une fonction pure testée sur tous les statuts.
import assert from 'node:assert/strict';
import { test, describe } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { boutonsEntete, clesMenuDejaVisibles, boutonJaune, MESSAGE_FINALISER_POUR_ENVOYER } from '../js/modules/devis/entete-boutons.js';
import { emailPossible } from '../js/modules/devis/email-brouillon.js';
import { estExpire } from '../js/modules/devis/logique.js';
import * as Li from '../js/modules/devis/liste.js';

const lire = (chemin) => readFileSync(fileURLToPath(new URL(`../${chemin}`, import.meta.url)), 'utf8');
const regle = (statut, extra = {}) => boutonsEntete({ statut, emailPossible: emailPossible(statut).actif, ...extra });
const libelles = (r) => [r.jaune?.libelle ?? null, r.autre?.libelle ?? null];

describe('8 boutonsEntete : un seul bouton jaune, celui de l\'étape suivante', () => {
  test('8 brouillon : « Finaliser » jaune, « Envoyer » grisé à côté ; le « … » garde « Préparer l’e-mail » (« Envoyer » grisé n\'ouvre pas de menu)', () => {
    const r = regle('brouillon');
    assert.deepEqual(r.jaune, { cle: 'finaliser', libelle: 'Finaliser', icone: 'check' });
    assert.equal(r.autre.libelle, 'Envoyer');
    assert.equal(r.autre.grise, true);
    assert.equal(r.menu.preparerEmail.present, true); // « Envoyer » grisé n'ouvre aucun menu : il ne masque rien, « Préparer l'e-mail » reste dans « … »
    assert.equal(r.menu.preparerEmail.libelle, 'Préparer l’e-mail');
    assert.equal(r.menu.preparerEmail.actif, true); // actif : il ouvre « Finaliser d\'abord »
    assert.equal(r.menu.telechargerPdf, true);
    assert.equal(r.menu.imprimer, true);
  });
  test('8 finalisé (en_attente_envoi) : « Envoyer » jaune ; « Devis envoyé » reste visible en contour ; jamais de « Finaliser »', () => {
    const r = regle('en_attente_envoi');
    assert.deepEqual(libelles(r), ['Envoyer', 'Devis envoyé']);
    assert.equal(r.autre.cle, 'passer-envoye'); // même action qu'avant (marquer_envoye), seul le libellé change
    assert.equal(r.jaune.cle, 'envoyer');
    assert.equal(r.autre.style, 'contour');
    assert.ok(!r.autre.grise);
    assert.deepEqual(r.menu.preparerEmail, { present: false, libelle: 'Préparer l’e-mail', actif: true }); // « Envoyer » (jaune) est visible : pas de doublon dans « … »
  });
  test('8 envoyé : « Devis signé » jaune ET « Devis refusé » en contour', () => {
    const r = regle('envoye');
    assert.deepEqual(libelles(r), ['Devis signé', 'Devis refusé']);
    assert.equal(r.jaune.cle, 'signer');
    assert.equal(r.autre.cle, 'refuser');
    assert.equal(r.autre.style, 'contour');
    assert.deepEqual(r.menu.preparerEmail, { present: true, libelle: 'Préparer l’e-mail', actif: true });
  });
  test('8 signé, refusé, remplacé : aucun bouton ; « Préparer l’e-mail » grisé (l\'e-mail n\'est plus possible)', () => {
    for (const statut of ['accepte', 'refuse', 'remplace']) {
      const r = regle(statut);
      assert.deepEqual([r.jaune, r.autre], [null, null], statut);
      assert.deepEqual(r.menu.preparerEmail, { present: true, libelle: 'Préparer l’e-mail', actif: false }, statut);
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
    assert.deepEqual(libelles(regle('envoye', { expire: estExpire(envoye, aujourdhui) })), ['Devis signé', 'Devis refusé']);
    assert.deepEqual(libelles(regle('en_attente_envoi', { expire: estExpire(finalise, aujourdhui) })), ['Envoyer', 'Devis envoyé']);
  });
  test('8 visualisation : la règle est la même qu\'en édition (un brouillon regardé se finalise aussi)', () => {
    for (const statut of ['brouillon', 'en_attente_envoi', 'envoye', 'accepte', 'refuse', 'remplace']) {
      assert.deepEqual(regle(statut, { lecture: true }), regle(statut, { lecture: false }), statut);
    }
  });
  test('8 « Préparer l’e-mail » suit emailPossible ; un statut inconnu ou une absence de donnée ne plante pas', () => {
    assert.equal(boutonsEntete({ statut: 'envoye', emailPossible: false }).menu.preparerEmail.actif, false);
    assert.equal(boutonsEntete({ statut: 'envoye', emailPossible: true }).menu.preparerEmail.actif, true);
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

// Complément de Jérôme (26/10/2026) : le menu « … » ne répète jamais un bouton visible du haut de page. UNE fonction pure décide (clesMenuDejaVisibles).
describe('3 le menu « … » ne répète jamais un bouton visible', () => {
  const devis = (statut) => ({ id: 'x', racineId: 'x', version: 1, statut, numero: statut === 'brouillon' ? null : 'DEV-2026-10-26-001' });
  /** Les clés du « … » de l'éditeur (même calcul qu'editeur-ecran.js) : e-mail propre à l'écran puis entreesActionsDevis moins ce qu'un bouton fait déjà. */
  const menuEditeur = (statut) => {
    const r = regle(statut);
    const propres = r.menu.preparerEmail.present ? ['preparer-email'] : [];
    const actions = Li.entreesActionsDevis(devis(statut), { exclure: ['preparer_email', ...r.menu.dejaVisibles, 'editer'] }).filter((e) => e.cle).map((e) => e.cle);
    return [...propres, ...actions];
  };
  test('3 la fonction suit les boutons : chaque bouton visible retire son entrée ; aucun bouton = rien de retiré', () => {
    assert.deepEqual(clesMenuDejaVisibles({ jaune: { cle: 'finaliser' }, autre: { cle: 'envoyer', grise: true } }), ['statut:finaliser']); // « Envoyer » grisé ne masque rien
    assert.deepEqual(clesMenuDejaVisibles({ jaune: { cle: 'finaliser' }, autre: { cle: 'envoyer', grise: false } }), ['statut:finaliser', 'preparer_email', 'preparer-email']);
    assert.deepEqual(clesMenuDejaVisibles({ jaune: { cle: 'envoyer' }, autre: { cle: 'passer-envoye' } }), ['preparer_email', 'preparer-email', 'statut:marquer_envoye']);
    assert.deepEqual(clesMenuDejaVisibles({ jaune: { cle: 'signer' }, autre: { cle: 'refuser' } }), ['statut:accepter', 'statut:refuser']);
    assert.deepEqual(clesMenuDejaVisibles({}), []);
    assert.deepEqual(clesMenuDejaVisibles(), []);
    for (const statut of ['brouillon', 'en_attente_envoi', 'envoye', 'accepte']) assert.deepEqual(regle(statut).menu.dejaVisibles, clesMenuDejaVisibles(regle(statut)), statut);
  });
  test('3 brouillon : pas de « Passer à « Finalisé » » dans « … » (le bouton existe) ; « Préparer l’e-mail » reste (« Envoyer » grisé n’ouvre pas de menu)', () => {
    const m = menuEditeur('brouillon');
    for (const cle of ['statut:finaliser', 'preparer_email']) assert.ok(!m.includes(cle), cle); // preparer_email : remplacé par « preparer-email » dans l'éditeur
    for (const cle of ['preparer-email', 'voir', 'dupliquer', 'archiver', 'supprimer']) assert.ok(m.includes(cle), cle);
  });
  test('3 finalisé : ni « Devis envoyé » (marquer_envoye) ni « Préparer l’e-mail » (le menu « Envoyer » l’a) ; « Créer une nouvelle version » reste', () => {
    const m = menuEditeur('en_attente_envoi');
    for (const cle of ['statut:marquer_envoye', 'preparer_email', 'preparer-email']) assert.ok(!m.includes(cle), cle);
    for (const cle of ['voir', 'nouvelle_version', 'dupliquer', 'archiver']) assert.ok(m.includes(cle), cle);
  });
  test('3 envoyé : ni « Signé » ni « Refusé » dans « … » ; « Préparer l’e-mail » reste (aucun bouton « Envoyer » visible)', () => {
    const m = menuEditeur('envoye');
    for (const cle of ['statut:accepter', 'statut:refuser', 'preparer_email']) assert.ok(!m.includes(cle), cle);
    for (const cle of ['preparer-email', 'voir', 'nouvelle_version']) assert.ok(m.includes(cle), cle);
  });
  test('3 signé : aucun bouton, donc rien n’est retiré à cause d’un bouton (« Préparer l’e-mail » reste, grisé)', () => {
    const r = regle('accepte');
    assert.deepEqual(r.menu.dejaVisibles, []);
    assert.equal(r.menu.preparerEmail.present, true);
    assert.ok(menuEditeur('accepte').includes('archiver'));
  });
});
