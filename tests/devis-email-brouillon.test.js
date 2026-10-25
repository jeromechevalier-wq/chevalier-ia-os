// Envoi d'un devis par e-mail (js/modules/devis/email-brouillon.js) : message par défaut, contrôle de la saisie, MIME, appel à Gmail, historique des envois.
// Aucun navigateur : un faux Gmail répond aux requêtes. Le nom d'un test commence par le numéro du critère.
import assert from 'node:assert/strict';
import { test, describe } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as E from '../js/modules/devis/email-brouillon.js';
import { nouvelleVersion } from '../js/modules/devis/logique.js';
import { copieDeDevis } from '../js/modules/devis/editeur-logique.js';
import { nomFichierDrive } from '../js/modules/devis/drive-copie.js';

const lire = (chemin) => readFileSync(fileURLToPath(new URL(`../${chemin}`, import.meta.url)), 'utf8');
const PDF = new TextEncoder().encode('%PDF-1.4 faux\n%%EOF');
/** Décode le champ `raw` (base64url) en texte MIME. */
const decoder = (raw) => Buffer.from(raw.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
const mime = (extra = {}) => decoder(E.corpsBrouillon({ a: ['client@exemple.fr'], cc: [], objet: 'Devis DEV-1', texte: 'Bonjour', pdf: PDF, nomPdf: 'Devis DEV-1.pdf', frontiere: '=_essai_0123456789', ...extra }).message.raw);
/** Le corps texte du message (première partie, base64). */
const texteDe = (m) => Buffer.from(/base64\r\n\r\n([\s\S]*?)\r\n--/.exec(m)[1].replace(/\r\n/g, ''), 'base64').toString('utf8');

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

describe('2 saisie du dialogue', () => {
  test('2 destinataires et copie : séparateurs variés, doublons ignorés, copie déjà destinataire retirée', () => {
    const v = E.validerSaisie({ a: 'a@x.fr, b@x.fr; A@x.fr', cc: 'c@x.fr b@x.fr c@x.fr', objet: 'Devis', message: 'x' });
    assert.deepEqual(v.erreurs, {});
    assert.deepEqual(v.a, ['a@x.fr', 'b@x.fr']);
    assert.deepEqual(v.cc, ['c@x.fr']);
  });
  test('2 sans destinataire : refusé avec un message (jamais d’envoi sans)', () => {
    const v = E.validerSaisie({ a: '  ', objet: 'Devis' });
    assert.match(v.erreurs.a, /adresse e-mail du destinataire/);
  });
  test('2 une adresse invalide est refusée (À et Cc) et nommée', () => {
    for (const mauvaise of ['pas-une-adresse', 'a@b', '<a@b.fr>', 'a@b.fr>', 'jean@exemple']) {
      assert.match(E.validerSaisie({ a: mauvaise, objet: 'x' }).erreurs.a, /n’est pas valide/, mauvaise);
    }
    const v = E.validerSaisie({ a: 'ok@x.fr', cc: 'ok2@x.fr, faux', objet: 'x' });
    assert.match(v.erreurs.cc, /faux/);
    assert.equal(v.erreurs.a, undefined);
  });
  test('2 l’objet est obligatoire, tient sur une ligne et ne dépasse pas 200 caractères', () => {
    assert.match(E.validerSaisie({ a: 'a@x.fr', objet: '' }).erreurs.objet, /objet/);
    assert.match(E.validerSaisie({ a: 'a@x.fr', objet: 'Devis\r\nBcc: pirate@x.fr' }).erreurs.objet, /retours à la ligne/);
    assert.match(E.validerSaisie({ a: 'a@x.fr', objet: 'Devis\nBcc: pirate@x.fr' }).erreurs.objet, /retours à la ligne/);
    assert.match(E.validerSaisie({ a: 'a@x.fr', objet: 'x'.repeat(201) }).erreurs.objet, /trop long/);
    assert.deepEqual(E.validerSaisie({ a: 'a@x.fr', objet: 'Devis' }).erreurs, {});
  });
  test('2 plus de 10 destinataires ou de copies : refusé', () => {
    const onze = Array.from({ length: 11 }, (_, i) => `p${i}@x.fr`).join(', ');
    assert.match(E.validerSaisie({ a: onze, objet: 'x' }).erreurs.a, /10/);
    assert.match(E.validerSaisie({ a: 'a@x.fr', cc: onze, objet: 'x' }).erreurs.cc, /10/);
  });
  test('2 « Envoyer par e-mail » : permis pour un brouillon (on propose de finaliser), un finalisé, un envoyé ; refusé ensuite', () => {
    for (const s of ['brouillon', 'en_attente_envoi', 'envoye']) assert.equal(E.emailPossible(s).actif, true, s);
    for (const s of ['accepte', 'refuse', 'remplace', 'expire']) assert.equal(E.emailPossible(s).actif, false, s);
    assert.match(E.emailPossible('accepte').raison, /plus à envoyer/);
  });
});

describe('3 MIME', () => {
  test('3 multipart/mixed : en-têtes To, Cc, Subject, texte UTF-8 puis PDF en pièce jointe « Devis ….pdf », tout en ASCII', () => {
    const m = mime({ cc: ['copie@exemple.fr'], nomPdf: 'Devis DEV-2026-10-25-001 v1 – Rénovation.pdf' });
    assert.match(m, /^MIME-Version: 1\.0\r\nTo: client@exemple\.fr\r\nCc: copie@exemple\.fr\r\nSubject: Devis DEV-1\r\nContent-Type: multipart\/mixed; boundary="=_essai_0123456789"\r\n\r\n/);
    assert.match(m, /Content-Type: text\/plain; charset="UTF-8"\r\nContent-Transfer-Encoding: base64/);
    assert.match(m, /Content-Type: application\/pdf; name="=\?UTF-8\?B\?/);
    assert.match(m, /Content-Disposition: attachment; filename="Devis DEV-2026-10-25-001 v1 _ Renovation\.pdf"; filename\*=UTF-8''Devis%20DEV-2026-10-25-001%20v1%20%E2%80%93%20R%C3%A9novation\.pdf/);
    assert.ok(m.endsWith('--=_essai_0123456789--\r\n'));
    assert.match(E.corpsBrouillon({ a: ['a@x.fr'], objet: 'é', texte: 'é', pdf: PDF, nomPdf: 'é.pdf' }).message.raw, /^[A-Za-z0-9_-]+$/, 'base64url : ni +, ni /, ni =');
    assert.match(Buffer.from(mime({ nomPdf: 'é.pdf', objet: 'é', texte: 'é' }), 'latin1').toString('latin1'), /^[\x00-\x7f]*$/, 'tout le message est en ASCII');
  });
  test('3 le PDF est joint tel quel (octets identiques)', () => {
    const m = mime();
    const partie = /filename\*=UTF-8''[^\r]*\r\nContent-Transfer-Encoding: base64\r\n\r\n([\s\S]*?)\r\n--/.exec(m)[1];
    assert.deepEqual(new Uint8Array(Buffer.from(partie.replace(/\r\n/g, ''), 'base64')), PDF);
  });
  test('3 les accents de l’objet sont encodés (RFC 2047) et se relisent à l’identique, même pour un objet long', () => {
    const objet = 'Devis DEV-2026-10-25-001 – Rénovation de la cuisine et de la salle d’eau (étage) à Châteauroux, garage compris';
    const m = mime({ objet });
    const ligne = /Subject: ([\s\S]*?)\r\nContent-Type: multipart/.exec(m)[1];
    const mots = ligne.split('\r\n ');
    assert.ok(mots.length > 1, 'plusieurs mots encodés');
    for (const mot of mots) {
      assert.match(mot, /^=\?UTF-8\?B\?[A-Za-z0-9+/=]+\?=$/);
      assert.ok(mot.length <= 75, 'un mot encodé fait 75 caractères au plus');
    }
    const relu = mots.map((mot) => Buffer.from(/\?B\?(.*)\?=/.exec(mot)[1], 'base64').toString('utf8')).join('');
    assert.equal(relu, objet);
    assert.equal(E.encoderEntete('Devis simple'), 'Devis simple'); // sans accent : tel quel
  });
  test('3 le texte accentué du message se relit à l’identique, retours à la ligne normalisés en CRLF', () => {
    const m = mime({ texte: 'Bonjour é,\n\nÀ très bientôt — l’équipe' });
    assert.equal(texteDe(m), 'Bonjour é,\r\n\r\nÀ très bientôt — l’équipe');
  });
  test('3 plusieurs adresses « À » et « Cc » : séparées par des virgules, repliées si longues', () => {
    const a = Array.from({ length: 6 }, (_, i) => `destinataire.numero${i}@exemple-long.fr`);
    const m = mime({ a, cc: ['c1@x.fr', 'c2@x.fr', 'c3@x.fr'] });
    const to = /To: ([\s\S]*?)\r\nCc:/.exec(m)[1];
    assert.deepEqual(to.replace(/,?\r\n /g, ' ').split(/,? /).filter(Boolean), a);
    for (const l of to.split('\r\n')) assert.ok(l.length < 78, l);
    assert.match(m, /Cc: c1@x\.fr, c2@x\.fr, c3@x\.fr\r\nSubject/);
  });
  test('3 adresses invalides refusées par le MIME lui-même (ceinture de sécurité)', () => {
    for (const mauvaise of ['pas-une-adresse', 'a@b', ' a@b.fr', 'a@b.fr\r\nBcc: pirate@x.fr', 'a@b.fr\n', 'a b@c.fr', '<a@b.fr>', 'a@b.fr, c@d.fr']) {
      assert.throws(() => mime({ a: [mauvaise] }), (e) => e.name === 'ErreurMime' && e.code === 'adresse_invalide', JSON.stringify(mauvaise));
      assert.throws(() => mime({ cc: [mauvaise] }), (e) => e.code === 'adresse_invalide', `cc ${JSON.stringify(mauvaise)}`);
    }
    assert.throws(() => mime({ a: [] }), (e) => e.code === 'adresse_invalide');
  });
  test('3 pas d’injection d’en-tête : un retour à la ligne dans l’objet est refusé, jamais copié dans le message', () => {
    for (const objet of ['Devis\r\nBcc: pirate@x.fr', 'Devis\nBcc: pirate@x.fr', 'Devis\rBcc: x', 'Devis\u0000x', 'Devis\u0085x'.replace('\u0085', '\u001f')]) {
      assert.throws(() => mime({ objet }), (e) => e.name === 'ErreurMime' && e.code === 'entete_invalide', JSON.stringify(objet));
    }
    // Un retour à la ligne dans le TEXTE n'est pas un risque : il est encodé en base64 dans son propre bloc.
    const m = mime({ texte: 'Bonjour\r\nBcc: pirate@x.fr' });
    assert.doesNotMatch(m, /Bcc:/);
  });
  test('3 le nom de la pièce jointe est nettoyé (guillemets, barres, retours à la ligne) et finit par .pdf', () => {
    assert.equal(E.nomPieceJointe('Devis "A"/B\\C\r\nD'), 'Devis A B C D.pdf');
    assert.equal(E.nomPieceJointe(''), 'Devis.pdf');
    const m = mime({ nomPdf: 'x"\r\nContent-Type: text/html' });
    assert.doesNotMatch(m, /\r\nContent-Type: text\/html/);
  });
  test('3 un PDF vide ou trop gros est refusé', () => {
    assert.throws(() => mime({ pdf: new Uint8Array(0) }), (e) => e.code === 'pdf_vide');
    assert.throws(() => mime({ pdf: new Uint8Array(E.MAX_PDF_OCTETS + 1) }), (e) => e.code === 'pdf_trop_gros');
  });
  test('3 le nom du PDF envoyé est celui de la copie Drive : « Devis DEV-… v1 – Objet.pdf »', () => {
    assert.equal(nomFichierDrive({ numero: 'DEV-2026-10-25-001', version: 1, objet: 'Rénovation cuisine' }), 'Devis DEV-2026-10-25-001 v1 – Rénovation cuisine.pdf');
  });
});

/** Faux Gmail : garde la requête reçue ; `statut` / `corps` fixent la réponse ; `coupe` simule un réseau coupé. */
function fauxGmail({ statut = 200, corps = { id: 'r123', message: { id: 'm456', threadId: 't789' } }, coupe = false } = {}) {
  const g = { requetes: [], statut, corps, coupe };
  g.appel = async (url, options = {}) => {
    g.requetes.push({ url, options });
    if (g.coupe) throw new TypeError('Failed to fetch');
    return { ok: g.statut < 400, status: g.statut, json: async () => g.corps };
  };
  return g;
}
const SAISIE = { a: 'client@exemple.fr', cc: 'copie@exemple.fr', objet: 'Devis DEV-1 – Cuisine', message: 'Bonjour é' };
const outils = (g, surcharge = {}) => ({ appelFetch: g.appel, obtenirJeton: async () => 'JETON_ESSAI', lirePdf: async () => new Blob([PDF]), email: 'jerome@exemple.fr', ...surcharge });

describe('4 création du brouillon dans Gmail', () => {
  test('4 envoie à users.drafts.create le message en base64url avec le jeton, et rend l’adresse du brouillon', async () => {
    const g = fauxGmail();
    const r = await E.preparerBrouillonGmail({ saisie: SAISIE, nomPdf: 'Devis DEV-1.pdf', outils: outils(g) });
    assert.equal(r.etat, 'cree');
    assert.equal(g.requetes.length, 1);
    const { url, options } = g.requetes[0];
    assert.equal(url, 'https://gmail.googleapis.com/gmail/v1/users/me/drafts');
    assert.equal(options.method, 'POST');
    assert.equal(options.headers.Authorization, 'Bearer JETON_ESSAI');
    const m = decoder(JSON.parse(options.body).message.raw);
    assert.match(m, /To: client@exemple\.fr\r\nCc: copie@exemple\.fr\r\n/);
    assert.equal(texteDe(m), 'Bonjour é');
    assert.deepEqual([r.brouillon.id, r.brouillon.messageId], ['r123', 'm456']);
    assert.equal(r.url, 'https://mail.google.com/mail/?authuser=jerome%40exemple.fr#drafts?compose=m456');
    assert.deepEqual(r.saisie, { a: ['client@exemple.fr'], cc: ['copie@exemple.fr'], objet: 'Devis DEV-1 – Cuisine', message: 'Bonjour é' });
  });
  test('4 la portée demandée est gmail.compose (jamais gmail.send ni gmail.modify : l’appli n’envoie pas)', () => {
    assert.equal(E.PORTEE_GMAIL, 'https://www.googleapis.com/auth/gmail.compose');
    const code = lire('js/modules/devis/email-ecran.js') + lire('js/modules/devis/email-brouillon.js');
    assert.doesNotMatch(code, /gmail\.send|gmail\.modify|gmail\.readonly|messages\/send|drafts\/send/);
  });
  test('4 saisie invalide : rien n’est demandé à Google (ni jeton ni réseau)', async () => {
    const g = fauxGmail();
    let jetonDemande = false;
    const r = await E.preparerBrouillonGmail({ saisie: { ...SAISIE, a: '' }, nomPdf: 'x.pdf', outils: outils(g, { obtenirJeton: async () => { jetonDemande = true; return 'x'; } }) });
    assert.equal(r.etat, 'invalide');
    assert.ok(r.erreurs.a);
    assert.equal(jetonDemande, false);
    assert.equal(g.requetes.length, 0);
  });
  test('4 le jeton est demandé AVANT la lecture du PDF (la fenêtre Google doit suivre le clic)', async () => {
    const ordre = [];
    await E.preparerBrouillonGmail({ saisie: SAISIE, nomPdf: 'x.pdf', outils: outils(fauxGmail(), { obtenirJeton: async () => { ordre.push('jeton'); return 'j'; }, lirePdf: async () => { ordre.push('pdf'); return PDF; } }) });
    assert.deepEqual(ordre, ['jeton', 'pdf']);
  });
  test('4 autorisation refusée / fenêtre bloquée : message clair, rien n’est créé', async () => {
    const g = fauxGmail();
    const refus = await E.preparerBrouillonGmail({ saisie: SAISIE, nomPdf: 'x.pdf', outils: outils(g, { obtenirJeton: async () => { throw Object.assign(new Error('Autorisation refusée : rien n’a été fait.'), { annule: true, code: 'access_denied' }); } }) });
    assert.equal(refus.etat, 'erreur');
    assert.equal(refus.message, E.MESSAGE_REFUS);
    const bloque = await E.preparerBrouillonGmail({ saisie: SAISIE, nomPdf: 'x.pdf', outils: outils(g, { obtenirJeton: async () => { throw Object.assign(new Error('Le navigateur a bloqué la fenêtre d’autorisation Google : autorise les fenêtres surgissantes pour ce site, puis réessaie.'), { code: 'popup_failed_to_open' }); } }) });
    assert.match(bloque.message, /bloqué la fenêtre/);
    assert.equal(g.requetes.length, 0);
  });
  test('4 PDF illisible (stockage, réseau) : message clair, rien n’est créé', async () => {
    const g = fauxGmail();
    const r = await E.preparerBrouillonGmail({ saisie: SAISIE, nomPdf: 'x.pdf', outils: outils(g, { lirePdf: async () => { throw new Error('Lecture du PDF : 403'); } }) });
    assert.equal(r.etat, 'erreur');
    assert.equal(r.message, E.MESSAGE_LECTURE_PDF);
    assert.equal(g.requetes.length, 0);
  });
  test('4 API Gmail non activée (403), autorisation expirée (401), portée refusée, trop de demandes, panne : un message qui dit quoi faire', async () => {
    const cas = [
      [403, { error: { status: 'PERMISSION_DENIED', message: 'Gmail API has not been used in project 123 before or it is disabled.', errors: [{ reason: 'accessNotConfigured' }] } }, /API Gmail n’est pas activée/],
      [403, { error: { message: 'Request had insufficient authentication scopes.', errors: [{ reason: 'insufficientPermissions' }], status: 'PERMISSION_DENIED' } }, /droit de créer un brouillon/],
      [401, { error: { status: 'UNAUTHENTICATED' } }, /expiré/],
      [429, {}, /patienter/],
      [503, {}, /ne répond pas/],
      [400, {}, /refusé le message/],
    ];
    for (const [statut, corps, attendu] of cas) {
      const r = await E.preparerBrouillonGmail({ saisie: SAISIE, nomPdf: 'x.pdf', outils: outils(fauxGmail({ statut, corps })) });
      assert.equal(r.etat, 'erreur', String(statut));
      assert.match(r.message, attendu, String(statut));
      assert.equal(r.erreur.statut, statut);
    }
  });
  test('4 réseau coupé : « Impossible de joindre Gmail… »', async () => {
    const r = await E.preparerBrouillonGmail({ saisie: SAISIE, nomPdf: 'x.pdf', outils: outils(fauxGmail({ coupe: true })) });
    assert.equal(r.etat, 'erreur');
    assert.equal(r.message, E.MESSAGE_RESEAU);
  });
  test('4 l’adresse du brouillon est toujours une adresse Gmail (même avec un identifiant bizarre)', () => {
    assert.equal(E.adresseBrouillon({ messageId: 'abc_DEF-123' }), 'https://mail.google.com/mail/#drafts?compose=abc_DEF-123');
    assert.equal(E.adresseBrouillon({ messageId: '"><script>' }), 'https://mail.google.com/mail/#drafts');
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
  test('6 aucun secret : pas de clé, de jeton ni d’identifiant client écrits dans les fichiers de l’envoi par e-mail', () => {
    for (const f of ['js/modules/devis/email-brouillon.js', 'js/modules/devis/email-ecran.js']) {
      const t = lire(f);
      assert.doesNotMatch(t, /AIza[0-9A-Za-z_-]{20,}|ya29\.|\.apps\.googleusercontent\.com|client_secret/, f);
    }
  });
  test('6 le mot « CRM » n’apparaît dans aucun texte affiché', () => {
    for (const f of ['js/modules/devis/email-brouillon.js', 'js/modules/devis/email-ecran.js']) {
      const visible = lire(f).split('\n').filter((l) => !/^\s*(\/\/|import )/.test(l)).join('\n').replace(/\/\/.*$/gm, '').replace(/\bCRM\.[a-zA-Z]+/g, '').replace(/\.\.\/crm\//g, '');
      assert.doesNotMatch(visible, /CRM/, f);
    }
  });
});
