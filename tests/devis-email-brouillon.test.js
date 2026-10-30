// Règles pures de l'e-mail d'un devis (js/modules/devis/email-brouillon.js) : message par défaut, qui peut recevoir un e-mail, adresses, nom de la pièce jointe, historique des envois.
// Depuis le 27/10/2026 le navigateur ne parle plus à Gmail (tout passe par n8n, « Préparer l'e-mail ») : plus de MIME ni d'appel Gmail ici, et un test (critère 4) vérifie qu'il n'en reste aucune trace.
// Aucun navigateur. Le nom d'un test commence par le numéro du critère.
import assert from 'node:assert/strict';
import { test, describe } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as E from '../js/modules/devis/email-brouillon.js';
import { nouvelleVersion } from '../js/modules/devis/logique.js';
import { copieDeDevis } from '../js/modules/devis/editeur-logique.js';

const lire = (chemin) => readFileSync(fileURLToPath(new URL(`../${chemin}`, import.meta.url)), 'utf8');

describe('1 message et objet par défaut', () => {
  test('1 le message par défaut vouvoie, garde les variables {contact} {numero} {objet} et n’a pas de signature écrite', () => {
    assert.match(E.MESSAGE_PAR_DEFAUT, /^Bonjour \{contact\},/);
    for (const v of ['{numero}', '{objet}']) assert.ok(E.MESSAGE_PAR_DEFAUT.includes(v));
    assert.match(E.MESSAGE_PAR_DEFAUT, /Veuillez trouver ci-joint notre devis/);
    assert.match(E.MESSAGE_PAR_DEFAUT, /N’hésitez pas à me contacter pour toute question ou pour l’adapter\.\n\nBien cordialement$/);
    assert.equal(E.OBJET_PAR_DEFAUT, 'Devis {numero} – {objet}');
  });
  test('1 les variables sont remplacées ; sans contact : « Bonjour, » ; sans objet : pas de tiret orphelin', () => {
    const v = { contact: 'Marie Durand', numero: 'DEV-2026-10-25-001', objet: 'Rénovation cuisine' };
    assert.equal(E.objetParDefaut(v), 'Devis DEV-2026-10-25-001 – Rénovation cuisine');
    assert.match(E.messageParDefaut(v), /^Bonjour Marie Durand,\n\nVeuillez trouver ci-joint notre devis DEV-2026-10-25-001 – Rénovation cuisine\.\n/);
    assert.match(E.messageParDefaut({ numero: 'DEV-1', objet: 'X' }), /^Bonjour,\n/);
    assert.equal(E.objetParDefaut({ numero: 'DEV-1' }), 'Devis DEV-1');
    assert.match(E.messageParDefaut({ numero: 'DEV-1' }), /notre devis DEV-1\.\n/);
  });
  test('1 une valeur qui contient un retour à la ligne ne casse pas l’objet (une seule ligne)', () => {
    assert.equal(E.objetParDefaut({ numero: 'DEV-1', objet: 'Cuisine\r\nBcc: x@y.fr' }), 'Devis DEV-1 – Cuisine Bcc: x@y.fr');
  });
});

describe('2 qui peut recevoir un e-mail, et quelles adresses', () => {
  test('2 « Préparer l’e-mail » : permis pour un brouillon (on propose de finaliser), un finalisé, un envoyé ; refusé ensuite', () => {
    for (const s of ['brouillon', 'en_attente_envoi', 'envoye']) assert.equal(E.emailPossible(s).actif, true, s);
    for (const s of ['accepte', 'refuse', 'remplace', 'expire']) assert.equal(E.emailPossible(s).actif, false, s);
    assert.match(E.emailPossible('accepte').raison, /plus à envoyer/);
  });
  test('2 les adresses du devis (À et Cc) : textes ou objets { email }, vides ignorés', () => {
    assert.deepEqual(E.adressesDuDevis(['a@x.fr', { email: ' b@x.fr ' }, '', null, { nom: 'sans adresse' }]), ['a@x.fr', 'b@x.fr']);
    assert.deepEqual(E.adressesDuDevis(undefined), []);
  });
  test('2 adresseSure (utilisée par le serveur) refuse l’accentué, le caractère spécial et le retour à la ligne', () => {
    for (const mauvaise of ['josé@x.fr', '中@x.fr', 'a(b@x.fr', 'a)b@x.fr', 'a"b@x.fr', 'a\\b@x.fr', 'jean@exemplé.fr', 'pas-une-adresse', 'a@b', ' a@x.fr', 'a@x.fr\r\nBcc: p@x.fr']) {
      assert.equal(E.adresseSure(mauvaise), false, mauvaise);
    }
    assert.equal(E.adresseSure('jean.dupont+devis@exemple.fr'), true);
  });
  test('2 le nom de la pièce jointe est nettoyé (guillemets, barres, retours à la ligne) et finit par .pdf', () => {
    assert.equal(E.nomPieceJointe('Devis "A"/B\\C\r\nD'), 'Devis A B C D.pdf');
    assert.equal(E.nomPieceJointe(''), 'Devis.pdf');
  });
});

describe('4 plus aucun appel à Gmail depuis le navigateur (décision du 27/10/2026)', () => {
  const FICHIERS_NAVIGATEUR = ['js/modules/devis/email-brouillon.js', 'js/modules/devis/email-ecran.js', 'js/modules/devis/email-preparer-ecran.js', 'js/modules/devis/editeur-ecran.js',
    'js/modules/devis/actions-devis.js', 'js/modules/devis/deploiement.js', 'js/os/google-picker.js', 'js/os/google-drive.js'];
  test('4 aucun fichier du navigateur ne cite la portée gmail.compose, l’API Gmail ni la création d’un brouillon par le navigateur', () => {
    for (const f of FICHIERS_NAVIGATEUR) {
      const t = lire(f);
      assert.doesNotMatch(t, /gmail\.compose|gmail\.googleapis\.com|users\/me\/drafts|PORTEE_GMAIL|preparerBrouillonGmail|creerBrouillonGmail|construireMime/, f);
    }
  });
  test('4 le module ne propose plus de dialogue « Envoyer le devis par e-mail » ni de bouton « Créer le brouillon Gmail »', () => {
    for (const f of FICHIERS_NAVIGATEUR) assert.doesNotMatch(lire(f), /Créer le brouillon Gmail|creer-brouillon-gmail|lancerEnvoiEmail|Envoyer le devis par e-mail/, f);
  });
  test('4 la page Réglages > Déploiement ne demande plus l’API Gmail ni les utilisateurs test de Gmail', async () => {
    const { ETAPES_DEPLOIEMENT_DEVIS } = await import('../js/modules/devis/deploiement.js');
    const ids = ETAPES_DEPLOIEMENT_DEVIS.map((e) => e.id);
    assert.ok(!ids.includes('devis-gmail-api') && !ids.includes('devis-gmail-test'), ids.join(', '));
    assert.ok(ids.includes('devis-preparer-email'));
    for (const e of ETAPES_DEPLOIEMENT_DEVIS) assert.doesNotMatch(`${e.libelle} ${e.reparation}`, /gmail\.compose|API Gmail/i, e.id);
  });
});

describe('5 historique des envois', () => {
  const t = (iso) => ({ toMillis: () => new Date(iso).getTime() });
  test('5 un renvoi garde les deux dates : « Envoyé le … à … » deux fois, du plus ancien au plus récent', () => {
    const d = { envoyeLe: t('2026-10-20T08:00:00Z'), envois: [
      { date: t('2026-10-25T13:05:00Z'), destinataires: ['b@x.fr'], copie: [] },
      { date: t('2026-10-20T08:00:30Z'), destinataires: ['a@x.fr'], copie: ['c@x.fr'] },
    ] };
    const h = E.historiqueEnvois(d);
    assert.equal(h.length, 2);
    assert.equal(h[0].texte, 'Envoyé le 20/10/2026 (10 h 00) à a@x.fr, en copie : c@x.fr');
    assert.equal(h[1].texte, 'Envoyé le 25/10/2026 (14 h 05) à b@x.fr');
  });
  test('5 marqué envoyé sans passer par l’e-mail : la date du premier envoi reste visible, sans adresse', () => {
    const h = E.historiqueEnvois({ envoyeLe: t('2026-10-20T08:00:00Z'), envois: [{ date: t('2026-10-25T13:05:00Z'), destinataires: ['b@x.fr'], copie: [] }] });
    assert.deepEqual(h.map((l) => l.texte), ['Envoyé le 20/10/2026 (10 h 00)', 'Envoyé le 25/10/2026 (14 h 05) à b@x.fr']);
  });
  test('5 l’origine de l’envoi (brouillon du logiciel ou hors logiciel) est dite ; une valeur inconnue ou absente n’ajoute rien', () => {
    const h = E.historiqueEnvois({ envois: [
      { date: t('2026-10-25T13:05:00Z'), destinataires: ['b@x.fr'], copie: [], origine: 'brouillon_logiciel' },
      { date: t('2026-10-26T13:05:00Z'), destinataires: ['b@x.fr'], copie: [], origine: 'hors_logiciel' },
      { date: t('2026-10-27T13:05:00Z'), destinataires: ['b@x.fr'], copie: [], origine: 'toString' },
      { date: t('2026-10-28T13:05:00Z'), destinataires: ['b@x.fr'], copie: [] },
    ] });
    assert.deepEqual(h.map((l) => l.texte), [
      'Envoyé le 25/10/2026 (14 h 05) à b@x.fr (depuis le brouillon du logiciel)', 'Envoyé le 26/10/2026 (14 h 05) à b@x.fr (hors logiciel)',
      'Envoyé le 27/10/2026 (14 h 05) à b@x.fr', 'Envoyé le 28/10/2026 (14 h 05) à b@x.fr',
    ]);
  });
  test('5 cas vide : ni envoi ni date -> liste vide ; des dates illisibles sont ignorées ; des Date et des textes ISO sont acceptés', () => {
    assert.deepEqual(E.historiqueEnvois({}), []);
    assert.deepEqual(E.historiqueEnvois({ envois: [{ date: 'n’importe quoi' }, null, {}] }), []);
    assert.equal(E.historiqueEnvois({ envois: [{ date: new Date('2026-10-25T13:05:00Z'), destinataires: [{ email: 'o@x.fr' }] }] })[0].texte, 'Envoyé le 25/10/2026 (14 h 05) à o@x.fr');
  });
  test('5 l’historique n’est pas recopié à la variante ni à la duplication (règle partagée avec le serveur)', () => {
    const source = { id: 'd1', statut: 'envoye', numero: 'DEV-1', version: 1, envoyeLe: new Date(), envois: [{ date: new Date(), destinataires: ['a@x.fr'], copie: [] }], sections: [], destinataires: ['a@x.fr'] };
    const v2 = nouvelleVersion(source, { id: 'd2', creeLe: new Date('2026-10-25T10:00:00Z') });
    assert.equal('envois' in v2, false);
    assert.equal('envoyeLe' in v2, false);
    assert.equal('envois' in copieDeDevis({ ...source, statut: 'brouillon' }, () => 'x'), false);
  });
});

describe('6 sécurité du dépôt public', () => {
  test('6 aucun secret : pas de clé, de jeton ni d’identifiant client écrits dans les fichiers de l’e-mail du devis', () => {
    for (const f of ['js/modules/devis/email-brouillon.js', 'js/modules/devis/email-ecran.js', 'js/modules/devis/email-preparer-ecran.js']) {
      const t = lire(f);
      assert.doesNotMatch(t, /AIza[0-9A-Za-z_-]{20,}|ya29\.|\.apps\.googleusercontent\.com|client_secret/, f);
    }
  });
  test('6 le mot « CRM » n’apparaît dans aucun texte affiché', () => {
    for (const f of ['js/modules/devis/email-brouillon.js', 'js/modules/devis/email-ecran.js', 'js/modules/devis/email-preparer-ecran.js']) {
      const visible = lire(f).split('\n').filter((l) => !/^\s*(\/\/|import )/.test(l)).join('\n').replace(/\/\/.*$/gm, '').replace(/\bCRM\.[a-zA-Z]+/g, '').replace(/\.\.\/crm\//g, '');
      assert.doesNotMatch(visible, /CRM/, f);
    }
  });
});
