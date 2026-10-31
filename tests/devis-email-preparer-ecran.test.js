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
  test('P3 « Préparer l’e-mail » est LA SEULE entrée e-mail du menu « Envoyer » ; pas branché (serveur : false), elle reste là, grisée, avec la raison', () => {
    assert.doesNotMatch(ecran, /Envoyer par e-mail|cle: 'envoyer-email'|lancerEnvoiEmail/);
    assert.match(ecran, /const nonBranche = D\.emailPreparable\(\) === false;/);
    assert.match(ecran, /libelle: LIBELLE_PREPARER_EMAIL, icone: 'mail-check', cle: 'preparer-email', \.\.\.\(nonBranche \? \{ desactive: true, titreInfo: MESSAGE_NON_BRANCHE \} : grisEmail\(\)\)/);
    // Le menu « Envoyer » ne contient que cette entrée (26/10/2026 : « Télécharger le PDF » et « Imprimer » sont dans « … »).
    assert.match(ecran, /contenuMenu\(\[\n      \.\.\.entreePreparerEmail\(\),\n    \], fermer\), \{ nom: 'Envoyer' \}\)/);
    assert.match(ecran, /lancerPreparationEmail\(\{ devisId: id,/);
    assert.match(P.MESSAGE_NON_BRANCHE, /pas encore branchée/);
  });
  test('P3 la liste (menu « … » des cartes) a la même entrée, grisée avec la raison quand le serveur dit « pas branché »', () => {
    const t = lire('js/modules/devis/actions-devis.js');
    assert.match(t, /preparer_email: \(\) => lancerPreparationEmail\(/);
    assert.match(t, /e\.cle === 'preparer_email' && e\.actif && D\.emailPreparable\(\) === false/);
    assert.match(t, /\{ texte: MESSAGE_NON_BRANCHE \}/);
  });
  test('P3 les textes demandés sont exacts : confirmation et toast', () => {
    assert.equal(P.MESSAGE_CONFIRMATION, 'Le brouillon sera créé dans ton Gmail avec le PDF. Rien n’est envoyé.');
    assert.equal(P.MESSAGE_DEMANDE_ENVOYEE, 'Demande envoyée : le brouillon apparaît dans ton Gmail dans quelques instants');
    assert.equal(P.LIBELLE_PREPARER_EMAIL, 'Préparer l’e-mail');
  });
  test('P3 la confirmation dit à qui le brouillon sera adressé (destinataire, puis copie sans doublon) ; sans adresse la fenêtre propose d’enregistrer ET préparer', () => {
    assert.deepEqual(P.adressesDuBrouillon({ destinataires: ['a@exemple.fr'], copie: ['A@exemple.fr', 'b@exemple.fr'] }), { destinataires: ['a@exemple.fr'], copie: ['b@exemple.fr'] });
    assert.deepEqual(P.adressesDuBrouillon({ destinataires: [{ email: ' a@exemple.fr ' }], copie: undefined }), { destinataires: ['a@exemple.fr'], copie: [] });
    assert.deepEqual(P.adressesDuBrouillon({ destinataires: ['a@exemple.fr', 'A@Exemple.fr'], copie: ['x,y@exemple.fr', 'c@exemple.fr', 'C@exemple.fr'] }), { destinataires: ['a@exemple.fr'], copie: ['c@exemple.fr'] }, 'comme le serveur : doublons de casse et adresses non sûres écartés');
    assert.equal(P.texteAdresses({ destinataires: ['a@exemple.fr'], copie: [] }), 'Adressé à : a@exemple.fr');
    assert.equal(P.texteAdresses({ destinataires: ['a@exemple.fr', 'c@exemple.fr'], copie: ['b@exemple.fr'] }), 'Adressé à : a@exemple.fr, c@exemple.fr · En copie : b@exemple.fr');
    assert.equal(P.LIBELLE_CHANGER_ADRESSE, 'Changer l’adresse');
    assert.equal(P.LIBELLE_ENREGISTRER_ET_PREPARER, 'Enregistrer et préparer l’e-mail');
  });
  test('P3 « Changer l’adresse » remplace seulement la première adresse : les autres destinataires et la copie sont gardés', () => {
    const base = { destinataires: ['a@exemple.fr', 'b@exemple.fr'], copie: ['c@exemple.fr'] };
    assert.deepEqual(P.adressesApresChangement(base, 'a@exemple.fr', 'n@exemple.fr'), { destinataires: ['n@exemple.fr', 'b@exemple.fr'], copie: ['c@exemple.fr'], copieChangee: false });
    assert.deepEqual(P.adressesApresChangement(base, 'a@exemple.fr', 'C@exemple.fr'), { destinataires: ['C@exemple.fr', 'b@exemple.fr'], copie: [], copieChangee: true }, 'une adresse qui était en copie en est retirée');
    assert.deepEqual(P.adressesApresChangement(base, 'a@exemple.fr', 'B@exemple.fr').destinataires, ['B@exemple.fr'], 'jamais la même adresse deux fois');
    assert.deepEqual(P.adressesApresChangement({ destinataires: [], copie: [] }, '', 'n@exemple.fr'), { destinataires: ['n@exemple.fr'], copie: [], copieChangee: false }, 'devis sans destinataire');
    assert.match(P.MESSAGE_CHANGER_ADRESSE_ICI, /gardés/);
  });
  test('P3 l’écran de confirmation grise ses boutons pendant l’appel, garde la fenêtre ouverte sur une erreur avec « Réessayer », et n’appelle qu’une fois', () => {
    const t = lire('js/modules/devis/email-preparer-ecran.js');
    assert.match(t, /peutFermer: \(\) => !occupe/);
    assert.match(t, /if \(occupe\) return false;/);
    assert.match(t, /boutons\.forEach\(\(b\) => \{ b\.disabled = v; \}\)/);
    assert.match(t, /boutons\[2\]\.textContent = 'Réessayer'/);
    assert.match(t, /boutons\[1\]\.textContent = 'Réessayer'/, 'la fenêtre d’adresse aussi, quand seul le brouillon a échoué');
    assert.equal((t.match(/D\.preparerEmailDevis\(/g) || []).length, 2, 'un seul appel par chemin : la confirmation, ou la fenêtre « Enregistrer et préparer » (jamais les deux : sans adresse, pas de seconde confirmation)');
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
