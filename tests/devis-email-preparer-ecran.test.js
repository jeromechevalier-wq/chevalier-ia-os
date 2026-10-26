// « Préparer l'e-mail » côté écran : règles pures (menu, ligne de l'Historique) et contrôles de câblage lus dans le code. Aucun navigateur ; le parcours à l'écran est dans tests/e2e/devis-email-preparer.spec.js.
// Le nom d'un test commence par le numéro du critère.
import assert from 'node:assert/strict';
import { test, describe } from 'node:test';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as P from '../js/modules/devis/email-preparer.js';
import { contenuHistorique } from '../js/modules/devis/historique-logique.js';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => readFileSync(join(RACINE, f), 'utf8');
const sansCommentaires = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const finalise = (extra = {}) => ({ id: 'd1', statut: 'en_attente_envoi', numero: 'DEV-2026-10-25-001', destinataires: ['marie@exemple.fr'], pdf: { statut: 'ok' }, ...extra });

describe('P1 destinataire du devis', () => {
  test('P1 destinataire : au moins une adresse (texte ou objet { email }), sinon un message qui dit quoi faire', () => {
    assert.equal(P.aUnDestinataire(finalise()), true);
    assert.equal(P.aUnDestinataire(finalise({ destinataires: [{ email: 'a@b.fr' }] })), true);
    for (const destinataires of [[], ['  '], [{ email: '' }], undefined, null]) assert.equal(P.aUnDestinataire(finalise({ destinataires })), false);
    assert.match(P.MESSAGE_SANS_DESTINATAIRE, /ajoute une adresse e-mail/);
  });
});

describe('P2 l’Historique : « E-mail préparé dans Gmail le … »', () => {
  const quand = new Date('2026-10-25T08:30:00Z'); // 9 h 30 à Paris (le passage à l'heure d'hiver a lieu ce jour-là, à 3 h)
  test('P2 emailPrepare « ok » : « E-mail préparé dans Gmail le 25/10/2026 (09 h 30) » (la date de Firestore ou un Date)', () => {
    const l = P.lignePrepare(finalise({ emailPrepare: { le: quand, demandeId: 'dem_1', canal: 'n8n', statut: 'ok' } }));
    assert.equal(l.texte, 'E-mail préparé dans Gmail le 25/10/2026 (09 h 30)');
    assert.equal(l.statut, 'ok');
    const firestore = P.lignePrepare(finalise({ emailPrepare: { le: { toDate: () => quand }, statut: 'ok' } }));
    assert.equal(firestore.texte, l.texte);
  });
  test('P2 emailPrepare « echec » : la ligne dit que ça a raté et qu’on peut réessayer ; ce n’est jamais présenté comme un envoi', () => {
    const l = P.lignePrepare(finalise({ emailPrepare: { le: quand, statut: 'echec' } }));
    assert.match(l.texte, /^La préparation de l’e-mail a échoué le 25\/10\/2026 \(09 h 30\)\. Tu peux réessayer\.$/);
    assert.ok(!/envoy/i.test(P.lignePrepare(finalise({ emailPrepare: { le: quand, statut: 'ok' } })).texte));
  });
  test('P2 demande faite : « Préparation de l’e-mail en cours… » ; sans réponse depuis plus de 15 minutes : « Aucune réponse du workflow… Tu peux réessayer. »', () => {
    const d = finalise({ emailPrepare: { le: quand, demandeId: 'dem_1', canal: 'n8n', statut: 'demandee' } });
    const t = quand.getTime();
    assert.equal(P.lignePrepare(d, t + 60_000).texte, 'Préparation de l’e-mail en cours…');
    assert.equal(P.lignePrepare(d, t + 14 * 60_000).sansReponse, false);
    const long = P.lignePrepare(d, t + 15 * 60_000 + 1);
    assert.equal(long.texte, 'Aucune réponse du workflow depuis plus de 15 minutes. Tu peux réessayer.');
    assert.equal(long.sansReponse, true);
    assert.equal(P.DELAI_SANS_REPONSE_MS, 15 * 60_000);
    assert.equal(contenuHistorique(d, [d], t + 60_000).emailPrepare.statut, 'demandee');
  });
  test('P2 rien à montrer : pas de champ, statut inconnu, date illisible, brouillon', () => {
    assert.equal(P.lignePrepare(finalise()), null);
    assert.equal(P.lignePrepare(finalise({ emailPrepare: { le: quand, statut: 'bizarre' } })), null);
    assert.equal(P.lignePrepare(finalise({ emailPrepare: { le: 'pas une date', statut: 'ok' } })), null);
    assert.equal(P.lignePrepare(finalise({ statut: 'brouillon', emailPrepare: { le: quand, statut: 'ok' } })), null);
    assert.equal(P.lignePrepare(null), null);
  });
  test('P2 le panneau Historique reçoit la ligne en plus des envois, sans les mélanger ; « Pas encore envoyé » reste vrai', () => {
    const d = finalise({ emailPrepare: { le: quand, statut: 'ok' } });
    const c = contenuHistorique(d, [d]);
    assert.equal(c.emailPrepare.texte, 'E-mail préparé dans Gmail le 25/10/2026 (09 h 30)');
    assert.deepEqual(c.envois, []);
    assert.equal(contenuHistorique(finalise(), [finalise()]).emailPrepare, null);
  });
});

describe('P3 le câblage : menu « Envoyer », confirmation, textes, serveur', () => {
  const ecran = lire('js/modules/devis/editeur-ecran.js');
  test('P3 « Envoyer par e-mail » est gardé tel quel et « Préparer l’e-mail » vient EN PLUS, seulement quand le serveur dit « branché » (emailPreparable() === true)', () => {
    assert.match(ecran, /libelle: 'Envoyer par e-mail', icone: 'mail', cle: 'envoyer-email'/);
    assert.match(ecran, /D\.emailPreparable\(\) === true \? \[\{ libelle: LIBELLE_PREPARER_EMAIL, icone: 'mail-check', cle: 'preparer-email'/);
    // L'ordre du menu « Envoyer » reste : e-mail, puis « Préparer l'e-mail » (26/10/2026 : « Télécharger le PDF » et « Imprimer » ont quitté ce menu, ils sont dans « … »).
    assert.ok(ecran.indexOf("cle: 'envoyer-email'") < ecran.indexOf('...entreePreparerEmail(),\n    ], fermer)'));
    assert.match(ecran, /\.\.\.entreePreparerEmail\(\),\n    \], fermer\), \{ nom: 'Envoyer' \}\)/);
    assert.match(ecran, /lancerPreparationEmail\(\{ devisId: id,/);
  });
  test('P3 les textes demandés sont exacts : confirmation et toast', () => {
    assert.equal(P.MESSAGE_CONFIRMATION, 'Le brouillon sera créé dans ton Gmail avec le PDF. Rien n’est envoyé.');
    assert.equal(P.MESSAGE_DEMANDE_ENVOYEE, 'Demande envoyée : le brouillon apparaît dans ton Gmail dans quelques instants');
    assert.equal(P.LIBELLE_PREPARER_EMAIL, 'Préparer l’e-mail');
  });
  test('P3 l’écran de confirmation grise ses boutons pendant l’appel, garde la fenêtre ouverte sur une erreur avec « Réessayer », et n’appelle qu’une fois', () => {
    const t = lire('js/modules/devis/email-preparer-ecran.js');
    assert.match(t, /peutFermer: \(\) => !occupe/);
    assert.match(t, /if \(occupe\) return false;/);
    assert.match(t, /boutons\.forEach\(\(b\) => \{ b\.disabled = v; \}\)/);
    assert.match(t, /boutons\[1\]\.textContent = 'Réessayer'/);
    assert.equal((t.match(/D\.preparerEmailDevis\(/g) || []).length, 1);
    assert.match(t, /toast\(P\.MESSAGE_DEMANDE_ENVOYEE/);
  });
  test('P3 le navigateur ne parle jamais à n8n : il appelle seulement les deux fonctions du serveur, par la table fixe de donnees.js', () => {
    const d = lire('js/modules/devis/donnees.js');
    assert.match(d, /preparerEmail: 'devisPreparerEmail', preparerEmailEtat: 'devisPreparerEmailEtat'/);
    for (const f of ['js/modules/devis/email-preparer.js', 'js/modules/devis/email-preparer-ecran.js']) assert.ok(!/n8n|fetch\(|webhook/i.test(sansCommentaires(lire(f))), f);
  });
  test('P3 vocabulaire : le mot « CRM » n’est écrit dans aucun texte vu par l’utilisateur', () => {
    for (const f of ['js/modules/devis/email-preparer.js', 'js/modules/devis/email-preparer-ecran.js']) assert.ok(!/CRM/.test(sansCommentaires(lire(f))), f);
  });
});
