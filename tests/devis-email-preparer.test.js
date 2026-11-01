// « Préparer l'e-mail » d'un devis (serveur) : la fonction appelable (faux n8n local, jamais le vrai), les deux actions de la porte (devis.lireEmail, devis.noterEmailPrepare),
// le journal des demandes, la porte de la plateforme clients. Accès aux données EN MÉMOIRE ; aucune base, aucun réseau. Le nom d'un test commence par le numéro du critère.
import assert from 'node:assert/strict';
import { test, describe } from 'node:test';
import { creerAccesMemoire, avecBase, COLLECTIONS as C } from '../functions/src/coeur/donnees.js';
import * as S from '../functions/src/coeur/devis.js';
import * as M from '../functions/src/coeur/devis-email.js';
import { creerSortieN8n, ENTETE_SECRET, MESSAGE_NON_BRANCHE, SECRET_URL, SECRET_CLE } from '../functions/src/coeur/n8n-sortie.js';
import { creerAppelPreparerEmail, creerAppelEtatPreparerEmail } from '../functions/src/devis-email-appel.js';
import * as E from '../functions/partage/devis-email.js';
import { nouveauDevis } from '../functions/partage/devis.js';
import { genererCle, enregistrementDe } from '../scripts/porte/cles.js';
import { creerPorte } from '../scripts/porte/porte.js';
import { ErreurN8n } from '../scripts/porte/n8n.js';

process.env.GCLOUD_PROJECT = 'demo-chevalier-ia-os';
const { preparerEmailDevis, etatPreparerEmail } = await import('../functions-plateforme/src/devis.js');
const { Refus } = await import('../functions-plateforme/src/appels.js');

const ACTEUR = 'jerome.chevalier@gmail.com';
const T0 = new Date('2026-10-25T10:00:00Z');
const URL_WEBHOOK = 'https://n8n.chevalier-ia.fr/webhook/essai-faux-webhook';
const SECRET = 'secret-de-test-pas-un-vrai';
const CHEMIN_PDF = 'devis/aff1/SECRET-CHEMIN-A-NE-PAS-FUIR/devis.pdf';

/** Un faux n8n local : garde chaque POST reçu (adresse, en-têtes, corps) et répond comme on le lui dit. */
function fauxN8n({ secrets = { [SECRET_URL]: URL_WEBHOOK, [SECRET_CLE]: SECRET }, statut = 200, panne = false } = {}) {
  const recus = [];
  const etat = { statut, panne };
  const sortie = creerSortieN8n({
    lireSecret: async (nom) => { if (!(nom in secrets)) throw new Error('absent'); return secrets[nom]; },
    fetchImpl: async (url, options) => {
      recus.push({ url, options, corps: JSON.parse(options.body) });
      if (etat.panne) throw new Error('réseau coupé');
      return { ok: etat.statut >= 200 && etat.statut < 300, status: etat.statut };
    },
    maintenant: () => T0.getTime(),
  });
  return { recus, etat, sortie };
}

/** Un monde en mémoire : un devis finalisé (PDF prêt), une personne, les journaux. */
function monde(extra = {}, devisExtra = {}) {
  const d = nouveauDevis({ destinataires: [{ email: 'marie@exemple.fr' }], copie: ['compta@exemple.fr'], affaireId: 'aff1', personneId: 'p1', objet: 'Rénovation cuisine' }, { id: 'dv1', maintenant: T0, auteur: ACTEUR }, { marge: 37 });
  const devis = {
    ...d, objet: 'Rénovation cuisine', destinataires: [{ email: 'marie@exemple.fr' }], copie: ['compta@exemple.fr'], statut: 'en_attente_envoi', numero: 'DEV-2026-10-25-001', version: 1, finaliseLe: T0,
    sections: [{ id: 's1', titre: 'Travaux', lignes: [{ id: 'l1', libelle: 'Carrelage', unite: 'm²', quantite: 2, prixAchat: 4242, prixVente: 6000 }] }],
    pdf: { statut: 'ok', chemin: CHEMIN_PDF, sha256: 'SHA-SECRETE-A-NE-PAS-FUIR', nom: 'Devis DEV-2026-10-25-001 v1 – Rénovation cuisine.pdf', tentatives: 1 },
    ...devisExtra,
  };
  const collections = { [C.devis]: [devis], [C.personnes]: [{ id: 'p1', nom: 'Marie Durand' }], [C.audit]: [], [C.auditAvant]: [], [C.actionsLancements]: [], ...extra };
  return { collections, donnees: creerAccesMemoire(collections), devis: () => collections[C.devis][0] };
}
let compteur = 0;
const ids = () => { compteur += 1; return `dem_essai${compteur}`; };
const ctx = (quand = T0) => ({ acteur: ACTEUR, via: 'ecran', maintenant: quand });
const apres = (minutes) => new Date(T0.getTime() + minutes * 60_000);
const lignes = (m) => m.collections[C.actionsLancements].filter((l) => l.action === 'devis.preparerEmail'); // sans le document fixe « dernier-<devis> » (anti-doublon)
const demander = (m, n8n, quand = T0, extra = {}) => M.demanderPreparation({ donnees: m.donnees, ctx: ctx(quand), devisId: 'dv1', espace: 'interne', sortie: n8n.sortie, genererId: ids, ...extra });
const refuse = (promesse, code) => assert.rejects(promesse, (e) => e.name === 'ErreurDevis' && e.code === code, `refus « ${code} » attendu`);
const pdfFaux = async ({ chemin }) => ({ lienSigne: `https://stockage.exemple.test/lecture-signee?c=${chemin.length}`, octets: 123456 });

describe('E1 la fonction appelable : une demande à n8n, jamais un envoi', () => {
  test('E1 un devis finalisé : une ligne de journal « demandee » (sans contenu d’e-mail) et UN POST { action, espace, devisId, demandeId } avec l’en-tête secret', async () => {
    const m = monde();
    const n8n = fauxN8n();
    const r = await demander(m, n8n);
    assert.equal(r.ok, true);
    assert.match(r.demandeId, /^dem_[a-z0-9_-]+$/);
    assert.equal(n8n.recus.length, 1);
    const recu = n8n.recus[0];
    assert.equal(recu.url, URL_WEBHOOK);
    assert.equal(recu.options.method, 'POST');
    assert.equal(recu.options.headers[ENTETE_SECRET], SECRET);
    assert.equal(recu.options.redirect, 'error');
    assert.deepEqual(recu.corps, { action: 'devis.preparerEmail', espace: 'interne', devisId: 'dv1', demandeId: r.demandeId });
    assert.equal(lignes(m).length, 1);
    const l = lignes(m)[0];
    assert.equal(l.id, r.demandeId);
    assert.deepEqual(Object.keys(l).sort(), ['action', 'client', 'demandeId', 'demandeLe', 'devisId', 'id', 'statut']);
    assert.equal(l.statut, 'demandee');
    assert.equal(l.client, 'interne');
    // le devis garde son statut et ses envois ; il porte seulement « demandee » (l'Historique dit « Préparation de l'e-mail en cours… »)
    assert.equal(m.devis().statut, 'en_attente_envoi');
    assert.equal(m.devis().envois, undefined);
    assert.deepEqual({ ...m.devis().emailPrepare, le: undefined }, { le: undefined, demandeId: r.demandeId, canal: 'n8n', statut: 'demandee' });
    assert.equal(m.collections[C.audit].length, 1);
  });
  test('E1 le journal des demandes et le corps envoyé ne contiennent ni adresse e-mail, ni objet, ni prix, ni texte du message', async () => {
    const m = monde();
    const n8n = fauxN8n();
    await demander(m, n8n);
    const texte = JSON.stringify([lignes(m), n8n.recus.map((x) => x.options.body)]);
    for (const interdit of ['marie@exemple.fr', 'compta@exemple.fr', 'Rénovation', 'Marie Durand', '4242', '6000', 'Veuillez trouver', 'SECRET-CHEMIN']) assert.ok(!texte.includes(interdit), `« ${interdit} » ne doit pas être dans le journal ni dans le corps`);
  });
  test('E1 secret ou adresse absents : « La préparation de l’e-mail n’est pas encore branchée. », rien n’est écrit, rien n’est envoyé', async () => {
    for (const secrets of [{}, { [SECRET_URL]: URL_WEBHOOK }, { [SECRET_CLE]: SECRET }, { [SECRET_URL]: 'http://n8n.chevalier-ia.fr/webhook/x', [SECRET_CLE]: SECRET }, { [SECRET_URL]: 'https://autre.exemple.test/webhook/x', [SECRET_CLE]: SECRET }]) {
      const m = monde();
      const n8n = fauxN8n({ secrets });
      await assert.rejects(demander(m, n8n), (e) => e.name === 'ErreurDevis' && e.code === 'non_branche' && e.message === MESSAGE_NON_BRANCHE);
      assert.equal(MESSAGE_NON_BRANCHE, 'La préparation de l’e-mail n’est pas encore branchée.');
      assert.equal(lignes(m).length, 0);
      assert.equal(n8n.recus.length, 0);
    }
  });
  test('E1 un brouillon, un devis sans destinataire ou sans PDF « ok » et un devis inconnu sont refusés : rien n’est écrit, rien n’est envoyé', async () => {
    const cas = [
      [{ statut: 'brouillon', numero: null, pdf: null }, 'brouillon'],
      [{ destinataires: [] }, 'sans_destinataire'],
      [{ destinataires: [{ email: 'pas une adresse' }] }, 'sans_destinataire'],
      [{ pdf: { statut: 'en_cours', tentatives: 1 } }, 'pdf_pas_pret'],
      [{ pdf: { statut: 'echec', tentatives: 1 } }, 'pdf_pas_pret'],
      [{ pdf: null }, 'pdf_pas_pret'],
      [{ statut: 'signe' }, 'statut_interdit'],
    ];
    for (const [extra, code] of cas) {
      const m = monde({}, extra);
      const n8n = fauxN8n();
      await refuse(demander(m, n8n), code);
      assert.equal(lignes(m).length, 0, code);
      assert.equal(n8n.recus.length, 0, code);
    }
    const m = monde();
    await refuse(M.demanderPreparation({ donnees: m.donnees, ctx: ctx(), devisId: 'inconnu', espace: 'interne', sortie: fauxN8n().sortie }), 'introuvable');
    await refuse(M.demanderPreparation({ donnees: m.donnees, ctx: ctx(), devisId: 'a/b', espace: 'interne', sortie: fauxN8n().sortie }), 'demande_invalide');
  });
  test('E1 anti-doublon : une 2e demande pour le même devis est refusée pendant 3 minutes, permise après ; un échec se réessaie tout de suite', async () => {
    const m = monde();
    const n8n = fauxN8n();
    await demander(m, n8n, T0);
    await refuse(demander(m, n8n, apres(2.9)), 'deja_demande');
    assert.equal(n8n.recus.length, 1);
    assert.equal(lignes(m).length, 1);
    await demander(m, n8n, apres(3.1));
    assert.equal(n8n.recus.length, 2);
    // un échec noté par n8n : on peut réessayer sans attendre
    const m2 = monde();
    const n2 = fauxN8n();
    const r = await demander(m2, n2, T0);
    await M.noterEmailPrepare({ donnees: m2.donnees, ctx: ctx(apres(1)), devisId: 'dv1', demandeId: r.demandeId, statut: 'echec', message: 'Gmail refuse' });
    await demander(m2, n2, apres(1.5));
    assert.equal(n2.recus.length, 2);
  });
  test('E1 un brouillon vient d’être créé (ok) : une nouvelle demande est refusée 3 minutes avec un message qui renvoie vers Gmail', async () => {
    const m = monde();
    const n8n = fauxN8n();
    const r = await demander(m, n8n, T0);
    await M.noterEmailPrepare({ donnees: m.donnees, ctx: ctx(apres(1)), devisId: 'dv1', demandeId: r.demandeId, statut: 'ok', brouillonGmailId: 'r-123' });
    await assert.rejects(demander(m, n8n, apres(2)), (e) => e.code === 'deja_demande' && /Gmail/.test(e.message));
    await demander(m, n8n, apres(4.5));
  });
  test('E1 n8n injoignable ou en erreur : la ligne passe à « echec », message clair, aucun détail technique (ni adresse, ni secret)', async () => {
    for (const regle of [{ panne: true }, { statut: 500 }]) {
      const m = monde();
      const n8n = fauxN8n(regle);
      await assert.rejects(demander(m, n8n), (e) => e.name === 'ErreurDevis' && e.code === 'n8n_indisponible' && !/n8n\.chevalier|secret|webhook/i.test(e.message));
      assert.equal(m.devis().emailPrepare.statut, 'echec', 'le devis aussi dit que ça a raté');
      assert.equal(lignes(m).length, 1);
      assert.equal(lignes(m)[0].statut, 'echec');
      assert.ok(Number.isInteger(lignes(m)[0].dureeMs));
      assert.ok(!JSON.stringify(lignes(m)).includes(SECRET));
    }
  });
});

describe('E1b refus de n8n, délai, appels simultanés', () => {
  test('E1b n8n répond 401 ou 403 (secret refusé) : message de configuration sans « Réessaie » ni détail, ligne à « echec »', async () => {
    for (const statut of [401, 403]) {
      const m = monde();
      await assert.rejects(demander(m, fauxN8n({ statut })), (e) => e.code === 'n8n_refuse' && e.message === 'La préparation de l’e-mail n’est pas bien configurée. Préviens Jérôme.');
      assert.equal(lignes(m)[0].statut, 'echec');
    }
  });
  test('E1b deux demandes simultanées pour le même devis : une seule part vers n8n (document fixe lu et réécrit dans la transaction)', async () => {
    const m = monde();
    const n8n = fauxN8n();
    const r = await Promise.allSettled([demander(m, n8n), demander(m, n8n), demander(m, n8n)]);
    assert.equal(r.filter((x) => x.status === 'fulfilled').length, 1);
    assert.equal(n8n.recus.length, 1);
    assert.equal(lignes(m).length, 1);
    assert.ok(m.collections[C.actionsLancements].some((l) => l.id === 'dernier-dv1'));
  });
  test('E1b la clôture utilise la date du contexte (pas l’horloge) : durée exacte', async () => {
    const m = monde();
    const r = await demander(m, fauxN8n(), T0);
    await M.noterEmailPrepare({ donnees: m.donnees, ctx: ctx(apres(2)), devisId: 'dv1', demandeId: r.demandeId, statut: 'ok' });
    assert.equal(lignes(m)[0].dureeMs, 120_000);
    assert.equal(m.collections[C.actionsLancements].find((l) => l.id === 'dernier-dv1').statut, 'ok');
  });
  test('E1b le délai : si n8n ne répond pas, la demande est coupée (signal d’arrêt) et devient « indisponible »', async () => {
    const sortie = creerSortieN8n({
      lireSecret: async (nom) => ({ [SECRET_URL]: URL_WEBHOOK, [SECRET_CLE]: SECRET })[nom],
      delaiMs: 20,
      fetchImpl: (url, options) => new Promise((_, rejeter) => options.signal.addEventListener('abort', () => rejeter(new Error('arrêt')))),
    });
    await assert.rejects(sortie.demander('interne', { devisId: 'a', demandeId: 'b' }), (e) => e.genre === 'indisponible');
  });
});

describe('E2 la fonction appelable chez Jérôme : qui peut appeler', () => {
  const auth = (email, verifie = true) => ({ token: { email, email_verified: verifie } });
  const appel = (m, n8n, journal = () => {}) => creerAppelPreparerEmail({ donnees: () => m.donnees, sortie: n8n.sortie, journal, maintenant: () => T0.getTime(), genererId: ids });
  test('E2 un compte autorisé reçoit { ok, demandeId } ; l’appel sans connexion, un compte non vérifié ou inconnu est refusé sans rien écrire', async () => {
    const m = monde();
    const n8n = fauxN8n();
    const r = await appel(m, n8n)({ auth: auth(ACTEUR), data: { devisId: 'dv1' } });
    assert.deepEqual(Object.keys(r).sort(), ['demandeId', 'ok']);
    assert.equal(r.ok, true);
    const m2 = monde();
    const n2 = fauxN8n();
    await assert.rejects(appel(m2, n2)({ data: { devisId: 'dv1' } }), (e) => e.code === 'unauthenticated');
    await assert.rejects(appel(m2, n2)({ auth: auth(ACTEUR, false), data: { devisId: 'dv1' } }), (e) => e.code === 'permission-denied');
    await assert.rejects(appel(m2, n2)({ auth: auth('inconnu@exemple.test'), data: { devisId: 'dv1' } }), (e) => e.code === 'permission-denied');
    assert.equal(lignes(m2).length, 0);
    assert.equal(n2.recus.length, 0);
  });
  test('E2 les erreurs métier deviennent des erreurs lisibles (non branché, brouillon, doublon) et le journal Cloud ne reçoit ni devis, ni adresse', async () => {
    const entrees = [];
    const m = monde();
    const n8n = fauxN8n({ secrets: {} });
    await assert.rejects(appel(m, n8n, (e) => entrees.push(e))({ auth: auth(ACTEUR), data: { devisId: 'dv1' } }), (e) => e.code === 'failed-precondition' && e.message === MESSAGE_NON_BRANCHE);
    const m2 = monde({}, { statut: 'brouillon', numero: null, pdf: null });
    await assert.rejects(appel(m2, fauxN8n(), (e) => entrees.push(e))({ auth: auth(ACTEUR), data: { devisId: 'dv1' } }), (e) => e.code === 'failed-precondition');
    await assert.rejects(appel(m2, fauxN8n(), (e) => entrees.push(e))({ auth: auth(ACTEUR), data: {} }), (e) => e.code === 'invalid-argument');
    const texte = JSON.stringify(entrees);
    assert.ok(!texte.includes('dv1') && !texte.includes(ACTEUR) && !texte.includes('marie@'));
    assert.ok(entrees.every((e) => Object.keys(e).every((k) => ['action', 'statut', 'code', 'dureeMs'].includes(k))));
  });
  test('E2 une erreur inattendue (chez Jérôme) journalise son code et un court message nettoyé, sans adresse ni identifiant de devis', async () => {
    const entrees = [];
    const m = monde();
    const casse = { ...m.donnees, transaction: async () => { throw Object.assign(new Error('5 NOT_FOUND: marie@exemple.fr\nchemin dv1'), { code: 5 }); } };
    const appelCasse = creerAppelPreparerEmail({ donnees: () => casse, sortie: fauxN8n().sortie, comptes: [ACTEUR], journal: (e) => entrees.push(e), maintenant: () => T0.getTime(), genererId: ids });
    await assert.rejects(appelCasse({ auth: auth(ACTEUR), data: { devisId: 'dv1' } }), (e) => e.code === 'internal');
    assert.equal(entrees.length, 1);
    assert.equal(entrees[0].statut, 'erreur');
    assert.equal(entrees[0].code, '5');
    assert.match(entrees[0].detail, /NOT_FOUND/);
    assert.ok(!entrees[0].detail.includes('marie@') && !entrees[0].detail.includes('\n'));
  });
  test('E2 l’état « branché oui/non » : vrai seulement si l’adresse ET le secret existent ; la réponse ne contient aucune valeur', async () => {
    const lire = (n8n) => creerAppelEtatPreparerEmail({ sortie: n8n.sortie })({ auth: auth(ACTEUR), data: {} });
    assert.deepEqual(await lire(fauxN8n()), { branche: true });
    assert.deepEqual(await lire(fauxN8n({ secrets: {} })), { branche: false });
    assert.deepEqual(await lire(fauxN8n({ secrets: { [SECRET_URL]: URL_WEBHOOK } })), { branche: false });
    await assert.rejects(creerAppelEtatPreparerEmail({ sortie: fauxN8n().sortie })({ data: {} }), (e) => e.code === 'unauthenticated');
    await assert.rejects(creerAppelEtatPreparerEmail({ sortie: fauxN8n().sortie })({ auth: auth('inconnu@exemple.test'), data: {} }), (e) => e.code === 'permission-denied');
  });
});

describe('E3 la plateforme clients : un éditeur du client, module « devis » actif, workflow et secret DU CLIENT', () => {
  const FICHES = {
    'clients/a': { modules: { devis: true } }, 'clients/b': { modules: { devis: true } }, 'clients/c': { modules: {} },
    'clients/a/membres/alice@exemple.test': { role: 'editeur' }, 'clients/a/membres/lea@exemple.test': { role: 'lecteur' },
    'clients/b/membres/bob@exemple.test': { role: 'editeur' }, 'clients/c/membres/zoe@exemple.test': { role: 'editeur' },
  };
  const fauxDb = { doc: (chemin) => ({ get: async () => { const f = FICHES[chemin]; return { exists: Boolean(f), get: (champ) => f?.[champ] }; } }) };
  const auth = (email, verifie = true) => ({ uid: `uid-${email}`, token: { email, email_verified: verifie } });
  function mondeClients() {
    const collections = {};
    for (const c of ['a', 'b', 'c']) Object.assign(collections, { [`clients/${c}/devis_devis`]: [], [`clients/${c}/crm_personnes`]: [], [`clients/${c}/crm_audit`]: [], [`clients/${c}/crm_audit_avant`]: [], [`clients/${c}/crm_actions_lancements`]: [] });
    collections['clients/a/devis_devis'].push(monde().devis());
    collections['clients/b/devis_devis'].push(monde().devis());
    const brut = creerAccesMemoire(collections);
    return { collections, creerDonnees: (client) => avecBase(brut, `clients/${client}`) };
  }
  const secretsClient = (client) => ({ [`${SECRET_URL}_${client}`]: `https://n8n.chevalier-ia.fr/webhook/devis-${client}`, [`${SECRET_CLE}_${client}`]: `secret-${client}` });
  test('E3 sans `maintenant` donné (comme en production), la date écrite est valide : une date invalide est refusée par Firestore et « Préparer l\'e-mail » échouait chez les clients (01/11/2026)', async () => {
    const mc = mondeClients();
    const surDate = (v) => { if (v instanceof Date && Number.isNaN(v.getTime())) throw new Error('Invalid time value (Firestore refuse cette date)'); if (v && typeof v === 'object' && !(v instanceof Date)) Object.values(v).forEach(surDate); };
    const creerDonnees = (client) => { const base = mc.creerDonnees(client); return { ...base, transaction: (fn) => base.transaction((tx) => fn({ ...tx, ecrire: (ec) => { ec.forEach((e) => surDate(e.donnees)); tx.ecrire(ec); } })) }; };
    const n8n = fauxN8n({ secrets: { ...secretsClient('a') } });
    const r = await preparerEmailDevis({ db: fauxDb, auth: auth('alice@exemple.test'), donnees: { client: 'a', devisId: 'dv1' }, sortie: n8n.sortie, creerDonnees, genererId: ids });
    assert.equal(r.ok, true);
    const ligne = mc.collections['clients/a/crm_actions_lancements'].find((l) => l.action === 'devis.preparerEmail');
    assert.ok(Number.isFinite(ligne.demandeLe.getTime()));
    // une fonction qui rend le temps est aussi acceptée
    const r2 = await preparerEmailDevis({ db: fauxDb, auth: auth('alice@exemple.test'), donnees: { client: 'a', devisId: 'dv1' }, sortie: n8n.sortie, maintenant: () => Date.now() + 10 * 60_000, creerDonnees, genererId: ids });
    assert.equal(r2.ok, true);
  });
  test('E3 une erreur inattendue journalise son code et un court message nettoyé (sans adresse), jamais le contenu du devis', async () => {
    const mc = mondeClients();
    const n8n = fauxN8n({ secrets: { ...secretsClient('a') } });
    const casse = (client) => { const base = mc.creerDonnees(client); return { ...base, transaction: async () => { throw Object.assign(new Error('9 FAILED_PRECONDITION: marie@exemple.fr\nIndex manquant'), { code: 9 }); } }; };
    const sorties = [];
    const ecrireOrig = process.stdout.write;
    const erreurOrig = process.stderr.write;
    const capter = (m, ...r) => { sorties.push(String(m)); const cb = r.find((x) => typeof x === 'function'); if (cb) cb(); return true; };
    process.stdout.write = capter; process.stderr.write = capter;
    try {
      await assert.rejects(preparerEmailDevis({ db: fauxDb, auth: auth('alice@exemple.test'), donnees: { client: 'a', devisId: 'dv1' }, sortie: n8n.sortie, maintenant: T0.getTime(), creerDonnees: casse, genererId: ids }), (e) => e instanceof Refus && e.code === 'internal');
    } finally { process.stdout.write = ecrireOrig; process.stderr.write = erreurOrig; }
    const texte = sorties.join('');
    const ligne = JSON.parse(texte.split('\n').find((l) => l.includes('préparer')));
    assert.equal(ligne.code, '9');
    assert.match(ligne.detail, /FAILED_PRECONDITION/);
    assert.ok(!texte.includes('marie@') && !ligne.detail.includes('\n'));
  });
  test('E3 une éditrice de a : la demande part vers le webhook de a avec le secret de a, et la ligne est dans l’espace de a seulement', async () => {
    const mc = mondeClients();
    const n8n = fauxN8n({ secrets: { ...secretsClient('a'), ...secretsClient('b') } });
    const r = await preparerEmailDevis({ db: fauxDb, auth: auth('alice@exemple.test'), donnees: { client: 'a', devisId: 'dv1' }, sortie: n8n.sortie, maintenant: T0.getTime(), creerDonnees: mc.creerDonnees, genererId: ids });
    assert.equal(r.ok, true);
    assert.equal(n8n.recus[0].url, 'https://n8n.chevalier-ia.fr/webhook/devis-a');
    assert.equal(n8n.recus[0].options.headers[ENTETE_SECRET], 'secret-a');
    assert.equal(n8n.recus[0].corps.espace, 'a');
    assert.equal(mc.collections['clients/a/crm_actions_lancements'].filter((l) => l.action === 'devis.preparerEmail').length, 1);
    assert.equal(mc.collections['clients/b/crm_actions_lancements'].length, 0);
  });
  test('E3 chez un client aussi (01/11/2026) : destinataires, copie, objet et message de la fenêtre sont gardés côté serveur dans l’espace de ce client, n8n ne reçoit que des identifiants, le devis ne change pas', async () => {
    const mc = mondeClients();
    const n8n = fauxN8n({ secrets: secretsClient('a') });
    const r = await preparerEmailDevis({ db: fauxDb, auth: auth('alice@exemple.test'), donnees: { client: 'a', devisId: 'dv1', destinataires: ['paul@exemple.fr'], objet: 'Mon objet', message: 'Mon texte' }, sortie: n8n.sortie, maintenant: T0.getTime(), creerDonnees: mc.creerDonnees, genererId: ids });
    assert.equal(r.ok, true);
    assert.deepEqual(Object.keys(n8n.recus[0].corps).sort(), ['action', 'demandeId', 'devisId', 'espace']);
    const contenu = mc.collections['clients/a/crm_actions_lancements'].find((l) => l.id === `contenu-${r.demandeId}`);
    assert.deepEqual([contenu.destinataires, contenu.sujet, contenu.message], [['paul@exemple.fr'], 'Mon objet', 'Mon texte']);
    assert.deepEqual(mc.collections['clients/a/devis_devis'][0].destinataires, [{ email: 'marie@exemple.fr' }]);
    await assert.rejects(preparerEmailDevis({ db: fauxDb, auth: auth('alice@exemple.test'), donnees: { client: 'a', devisId: 'dv1', destinataires: ['pas une adresse'] }, sortie: n8n.sortie, maintenant: T0.getTime() + 600_000, creerDonnees: mc.creerDonnees, genererId: ids }), (e) => e instanceof Refus && e.code === 'invalid-argument');
  });
  test('E3 un lecteur, un éditeur d’un AUTRE client, un espace sans le module, un compte non vérifié et un appel sans connexion sont refusés sans rien écrire ni envoyer', async () => {
    const mc = mondeClients();
    const n8n = fauxN8n({ secrets: { ...secretsClient('a'), ...secretsClient('b'), ...secretsClient('c') } });
    const faire = (email, client, extra = {}) => preparerEmailDevis({ db: fauxDb, auth: email === null ? null : auth(email, extra.verifie), donnees: { client, devisId: 'dv1' }, sortie: n8n.sortie, maintenant: T0.getTime(), creerDonnees: mc.creerDonnees });
    const refus = (p, code) => assert.rejects(p, (e) => e instanceof Refus && e.code === code);
    await refus(faire('lea@exemple.test', 'a'), 'permission-denied');
    await refus(faire('bob@exemple.test', 'a'), 'permission-denied');
    await refus(faire('zoe@exemple.test', 'c'), 'permission-denied');
    await refus(faire('alice@exemple.test', 'a', { verifie: false }), 'unauthenticated');
    await refus(faire(null, 'a'), 'unauthenticated');
    await refus(faire('alice@exemple.test', 'espace-inexistant'), 'permission-denied');
    await refus(faire('alice@exemple.test', 'interne'), 'permission-denied'); // « interne » est réservé à Jérôme (secrets sans suffixe)
    assert.equal(n8n.recus.length, 0);
    assert.equal(mc.collections['clients/a/crm_actions_lancements'].length, 0);
  });
  test('E3 le secret du client absent : « pas encore branchée » et l’état dit non ; le secret d’un autre client ne sert pas', async () => {
    const mc = mondeClients();
    const n8n = fauxN8n({ secrets: secretsClient('b') });
    await assert.rejects(preparerEmailDevis({ db: fauxDb, auth: auth('alice@exemple.test'), donnees: { client: 'a', devisId: 'dv1' }, sortie: n8n.sortie, maintenant: T0.getTime(), creerDonnees: mc.creerDonnees }), (e) => e instanceof Refus && e.code === 'failed-precondition' && e.message === MESSAGE_NON_BRANCHE);
    assert.deepEqual(await etatPreparerEmail({ db: fauxDb, auth: auth('alice@exemple.test'), donnees: { client: 'a' }, sortie: n8n.sortie }), { branche: false });
    assert.deepEqual(await etatPreparerEmail({ db: fauxDb, auth: auth('bob@exemple.test'), donnees: { client: 'b' }, sortie: n8n.sortie }), { branche: true });
    await assert.rejects(etatPreparerEmail({ db: fauxDb, auth: auth('bob@exemple.test'), donnees: { client: 'a' }, sortie: n8n.sortie }), (e) => e instanceof Refus && e.code === 'permission-denied');
    assert.equal(n8n.recus.length, 0);
  });
});

/** Une demande « demandee » toute fraîche dans un monde (comme si l’écran venait de la faire). */
async function mondeAvecDemande(quand = T0) {
  const m = monde();
  const n8n = fauxN8n();
  const { demandeId } = await demander(m, n8n, quand);
  return { m, demandeId };
}

describe('E4 devis.lireEmail : ce que n8n relit, rien de plus', () => {
  test('E4 le résultat contient exactement numero, version, objet, destinataires, copie, sujet, message et pdf { nom, lienSigne, octets } ; sujet et message sont ceux de l’écran', async () => {
    const { m, demandeId } = await mondeAvecDemande();
    const r = await M.lireEmailPourDemande({ donnees: m.donnees, devisId: 'dv1', demandeId, maintenant: apres(5), pdf: pdfFaux });
    assert.deepEqual(Object.keys(r).sort(), ['copie', 'destinataires', 'message', 'numero', 'objet', 'pdf', 'sujet', 'version']);
    assert.deepEqual(Object.keys(r.pdf).sort(), ['lienSigne', 'nom', 'octets']);
    assert.equal(r.numero, 'DEV-2026-10-25-001');
    assert.equal(r.version, 1);
    assert.equal(r.objet, 'Rénovation cuisine');
    assert.deepEqual(r.destinataires, ['marie@exemple.fr']);
    assert.deepEqual(r.copie, ['compta@exemple.fr']);
    const variables = { contact: 'Marie Durand', numero: 'DEV-2026-10-25-001', objet: 'Rénovation cuisine' };
    assert.equal(r.sujet, E.objetParDefaut(variables));
    assert.equal(r.message, E.messageParDefaut(variables));
    assert.match(r.message, /^Bonjour Marie Durand,/);
    assert.equal(r.pdf.nom, 'Devis DEV-2026-10-25-001 v1 – Rénovation cuisine.pdf');
    assert.equal(r.pdf.octets, 123456);
    assert.match(r.pdf.lienSigne, /^https:\/\//);
  });
  test('E4 aucune fuite : ni prix d’achat, ni marge, ni prix de vente, ni chemin de stockage, ni empreinte, dans le résultat', async () => {
    const { m, demandeId } = await mondeAvecDemande();
    const texte = JSON.stringify(await M.lireEmailPourDemande({ donnees: m.donnees, devisId: 'dv1', demandeId, maintenant: apres(1), pdf: pdfFaux }));
    for (const interdit of ['4242', '6000', 'prixAchat', 'marge', 'SECRET-CHEMIN', 'SHA-SECRETE', 'chemin', 'sha256', 'devis/aff1']) assert.ok(!texte.includes(interdit), `« ${interdit} » ne doit pas sortir`);
  });
  test('E4 demande inconnue, d’un autre devis, trop ancienne (plus de 15 minutes) ou déjà terminée : refusée avec le même message', async () => {
    const { m, demandeId } = await mondeAvecDemande();
    const lire = (devisId, id, quand) => M.lireEmailPourDemande({ donnees: m.donnees, devisId, demandeId: id, maintenant: quand, pdf: pdfFaux });
    await refuse(lire('dv1', 'dem_inconnue', apres(1)), 'demande_inconnue');
    await assert.rejects(lire('devis-qui-n-existe-pas', demandeId, apres(1)), (e) => e.code === 'demande_inconnue' && e.message === M.MESSAGE_DEMANDE_INCONNUE && !e.message.includes('devis-qui-n-existe-pas'));
    await assert.rejects(M.noterEmailPrepare({ donnees: m.donnees, ctx: ctx(apres(1)), devisId: 'devis-qui-n-existe-pas', demandeId, statut: 'ok' }), (e) => e.code === 'demande_inconnue' && e.message === M.MESSAGE_DEMANDE_INCONNUE);
    await refuse(lire('dv1', 'Pas Valable/..', apres(1)), 'demande_inconnue');
    await assert.rejects(lire('dv1', demandeId, apres(15.5)), (e) => e.code === 'demande_inconnue' && e.message === M.MESSAGE_DEMANDE_INCONNUE);
    await lire('dv1', demandeId, apres(14.5)); // 14 min 30 : encore bon
    // un autre devis ne peut pas utiliser cette demande
    m.collections[C.devis].push({ ...m.devis(), id: 'dv2', numero: 'DEV-2026-10-25-002' });
    await assert.rejects(lire('dv2', demandeId, apres(1)), (e) => e.code === 'demande_inconnue' && e.message === M.MESSAGE_DEMANDE_INCONNUE);
    await M.noterEmailPrepare({ donnees: m.donnees, ctx: ctx(apres(2)), devisId: 'dv1', demandeId, statut: 'ok' });
    await refuse(lire('dv1', demandeId, apres(3)), 'demande_close');
  });
  test('E4 le devis a changé depuis la demande (plus de PDF prêt, plus de destinataire) : refusé', async () => {
    const { m, demandeId } = await mondeAvecDemande();
    m.collections[C.devis][0].pdf = { statut: 'echec' };
    await refuse(M.lireEmailPourDemande({ donnees: m.donnees, devisId: 'dv1', demandeId, maintenant: apres(1), pdf: pdfFaux }), 'pdf_pas_pret');
  });
});

describe('E5 devis.noterEmailPrepare : le résultat écrit par le serveur', () => {
  test('E5 « ok » : emailPrepare { le, demandeId, canal, statut } sur le devis, ligne de journal crm_audit, ligne de demande close ; envois et statut INTACTS', async () => {
    const { m, demandeId } = await mondeAvecDemande();
    const avant = structuredClone(m.devis());
    delete avant.emailPrepare; // « demandee » posé par la demande ; la note le remplace
    const r = await M.noterEmailPrepare({ donnees: m.donnees, ctx: ctx(apres(1)), devisId: 'dv1', demandeId, statut: 'ok', brouillonGmailId: 'r-1234', message: 'Brouillon créé' });
    assert.equal(r.ok, true);
    const d = m.devis();
    assert.deepEqual(Object.keys(d.emailPrepare).sort(), ['canal', 'demandeId', 'le', 'statut']);
    assert.equal(d.emailPrepare.canal, 'n8n');
    assert.equal(d.emailPrepare.statut, 'ok');
    assert.equal(d.emailPrepare.demandeId, demandeId);
    assert.ok(d.emailPrepare.le instanceof Date);
    assert.equal(d.statut, avant.statut);
    assert.equal(d.envois, avant.envois);
    assert.equal(d.envoyeLe, avant.envoyeLe);
    const sansPrepare = { ...d }; delete sansPrepare.emailPrepare;
    assert.deepEqual(sansPrepare, avant, 'rien d’autre n’a changé sur le devis');
    const journal = m.collections[C.audit].filter((l) => l.outil === 'porteDevisNoterEmailPrepare');
    assert.equal(journal.length, 1);
    assert.deepEqual([journal[0].outil, journal[0].collection, journal[0].docId, journal[0].action, journal[0].champsModifies], ['porteDevisNoterEmailPrepare', C.devis, 'dv1', 'modifier', ['emailPrepare']]);
    const l = lignes(m)[0];
    assert.equal(l.statut, 'ok');
    assert.equal(l.brouillonGmailId, 'r-1234');
    assert.equal(l.dureeMs, 60_000);
  });
  test('E5 « echec » : emailPrepare.statut = echec, le devis reste « Finalisé » ; rejouer la même note ne change rien (deja), une note contraire est refusée', async () => {
    const { m, demandeId } = await mondeAvecDemande();
    await M.noterEmailPrepare({ donnees: m.donnees, ctx: ctx(apres(1)), devisId: 'dv1', demandeId, statut: 'echec', message: 'Gmail a refusé' });
    assert.equal(m.devis().emailPrepare.statut, 'echec');
    assert.equal(m.devis().statut, 'en_attente_envoi');
    const apresPremiere = JSON.stringify(m.collections);
    const rejeu = await M.noterEmailPrepare({ donnees: m.donnees, ctx: ctx(apres(2)), devisId: 'dv1', demandeId, statut: 'echec' });
    assert.equal(rejeu.deja, true);
    assert.equal(JSON.stringify(m.collections), apresPremiere);
    await refuse(M.noterEmailPrepare({ donnees: m.donnees, ctx: ctx(apres(3)), devisId: 'dv1', demandeId, statut: 'ok' }), 'demande_close');
  });
  test('E5 validation : statut inconnu, message de plus de 200 caractères, identifiant Gmail douteux, demande inconnue ou d’un autre devis : refusés sans rien écrire', async () => {
    const { m, demandeId } = await mondeAvecDemande();
    const avant = JSON.stringify(m.collections);
    const noter = (extra) => M.noterEmailPrepare({ donnees: m.donnees, ctx: ctx(apres(1)), devisId: 'dv1', demandeId, statut: 'ok', ...extra });
    await refuse(noter({ statut: 'envoye' }), 'demande_invalide');
    await refuse(noter({ message: 'x'.repeat(201) }), 'demande_invalide');
    await refuse(noter({ brouillonGmailId: '../etc/passwd' }), 'demande_invalide');
    await refuse(noter({ demandeId: 'dem_inconnue' }), 'demande_inconnue');
    assert.equal(JSON.stringify(m.collections), avant);
  });
  test('E5 le message d’état est nettoyé : adresses e-mail masquées, une seule ligne, 200 caractères au plus', async () => {
    const { m, demandeId } = await mondeAvecDemande();
    await M.noterEmailPrepare({ donnees: m.donnees, ctx: ctx(apres(1)), devisId: 'dv1', demandeId, statut: 'echec', message: 'Refusé pour marie@exemple.fr\nréessaie' });
    assert.equal(lignes(m)[0].message, 'Refusé pour [adresse] réessaie');
    assert.equal(M.messageEtatPropre('a'.repeat(500)).length, 200);
  });
  test('E5 une note tardive (plus d’une heure) est refusée', async () => {
    const { m, demandeId } = await mondeAvecDemande();
    await refuse(M.noterEmailPrepare({ donnees: m.donnees, ctx: ctx(apres(61)), devisId: 'dv1', demandeId, statut: 'ok' }), 'demande_inconnue');
  });
});

describe('E6 la porte : droits par module « devis », validation stricte, aucune fuite', () => {
  const T = T0.getTime();
  function porteEssai({ modules = { interne: ['devis'], autre: [], sansservice: ['devis'] }, avecService = true } = {}) {
    const m = monde();
    const cles = new Map();
    const journaux = [];
    const base = { lireCle: async (e) => cles.get(e) ?? null, majCle: async (e, p) => { cles.set(e, { ...cles.get(e), ...p }); }, lireDoc: async () => null, creerSiAbsent: async () => false, majDoc: async () => false, lister: async () => [] };
    const cle = (proprietaire) => { const c = genererCle(proprietaire); const { id, donnees } = enregistrementDe(c, proprietaire, new Date(T)); cles.set(id, donnees); return c; };
    const workflows = { w1: { id: 'w1', nom: 'interne-devis-email', etiquettes: ['interne'] } };
    const porte = creerPorte({
      contexte: 'crm', donnees: base, n8n: { lireWorkflow: async (id) => { if (!workflows[id]) throw new ErreurN8n('introuvable', 'non'); return workflows[id]; } },
      modulesActifs: async (p) => modules[p] ?? [], maintenant: () => T + 5 * 60_000, journal: (e) => journaux.push(e),
      services: avecService ? { devis: () => M.creerServiceDevisPorte({ donnees: m.donnees, pdf: pdfFaux, maintenant: () => new Date(T + 5 * 60_000) }) } : {},
    });
    const appeler = (cleAppel, action, donnees, extra = {}) => porte({ methode: 'POST', authorization: `Bearer ${cleAppel}`, corps: { module: 'devis', action, workflowId: 'w1', donnees, ...extra } });
    return { m, porte, appeler, cle, journaux };
  }
  test('E6 le module « devis » doit être actif pour la clé : sinon 403 « module_non_actif », rien n’est lu ni écrit', async () => {
    const p = porteEssai({ modules: { interne: ['veille'] } });
    const r = await p.appeler(p.cle('interne'), 'devis.lireEmail', { devisId: 'dv1', demandeId: 'dem_x' });
    assert.equal(r.statut, 403);
    assert.equal(r.corps.erreur, 'module_non_actif');
  });
  test('E6 une clé inconnue ou un workflow qui n’est pas à l’espace est refusé ; une action inconnue du module aussi', async () => {
    const p = porteEssai();
    assert.equal((await p.appeler('cle-n8n.interne.' + 'A'.repeat(43), 'devis.lireEmail', {})).statut, 401);
    assert.equal((await p.appeler(p.cle('interne'), 'devis.lireEmail', { devisId: 'dv1', demandeId: 'dem_x' }, { workflowId: 'wInconnu' })).statut, 403);
    assert.equal((await p.appeler(p.cle('interne'), 'devis.envoyer', { devisId: 'dv1' })).corps.erreur, 'action_inconnue');
    assert.equal((await p.appeler(p.cle('interne'), 'devis.finaliser', { devisId: 'dv1' })).corps.erreur, 'action_inconnue');
  });
  test('E6 validation stricte : champ inconnu, champ manquant, identifiant mal formé, statut inconnu, message trop long ou ressemblant à un secret : 400', async () => {
    const p = porteEssai();
    const c = p.cle('interne');
    const code = async (action, donnees) => (await p.appeler(c, action, donnees)).statut;
    assert.equal(await code('devis.lireEmail', { devisId: 'dv1' }), 400);
    assert.equal(await code('devis.lireEmail', { devisId: 'dv1', demandeId: 'dem_x', prix: 1 }), 400);
    assert.equal(await code('devis.lireEmail', { devisId: 'dv1', demandeId: 'DEM X' }), 400);
    assert.equal(await code('devis.lireEmail', { devisId: '../x', demandeId: 'dem_x' }), 400);
    assert.equal(await code('devis.noterEmailPrepare', { devisId: 'dv1', demandeId: 'dem_x' }), 400);
    assert.equal(await code('devis.noterEmailPrepare', { devisId: 'dv1', demandeId: 'dem_x', statut: 'envoye' }), 400);
    assert.equal(await code('devis.noterEmailPrepare', { devisId: 'dv1', demandeId: 'dem_x', statut: 'ok', message: 'x'.repeat(201) }), 400);
    assert.equal(await code('devis.noterEmailPrepare', { devisId: 'dv1', demandeId: 'dem_x', statut: 'ok', message: 'cia_abcdefghijklmnopqrstuvwxyz' }), 400);
    assert.equal(await code('devis.noterEmailPrepare', { devisId: 'dv1', demandeId: 'dem_x', statut: 'ok', envois: [] }), 400);
  });
  test('E6 de bout en bout : lireEmail puis noterEmailPrepare par la porte ; réponses sans prix d’achat, marge, chemin ni empreinte ; le journal de la porte ne reçoit pas le résultat', async () => {
    const p = porteEssai();
    const n8n = fauxN8n();
    const { demandeId } = await M.demanderPreparation({ donnees: p.m.donnees, ctx: ctx(T0), devisId: 'dv1', espace: 'interne', sortie: n8n.sortie, genererId: ids });
    const c = p.cle('interne');
    const lu = await p.appeler(c, 'devis.lireEmail', { devisId: 'dv1', demandeId });
    assert.equal(lu.statut, 200);
    assert.equal(lu.corps.ok, true);
    assert.deepEqual(Object.keys(lu.corps.resultat).sort(), ['copie', 'destinataires', 'message', 'numero', 'objet', 'pdf', 'sujet', 'version']);
    const texte = JSON.stringify(lu.corps);
    for (const interdit of ['4242', '6000', 'prixAchat', 'marge', 'SECRET-CHEMIN', 'SHA-SECRETE']) assert.ok(!texte.includes(interdit), interdit);
    const noté = await p.appeler(c, 'devis.noterEmailPrepare', { devisId: 'dv1', demandeId, statut: 'ok', brouillonGmailId: 'r-99' });
    assert.equal(noté.statut, 200);
    assert.deepEqual(noté.corps.resultat, { devisId: 'dv1', demandeId, statut: 'ok', deja: false });
    assert.equal(p.m.devis().emailPrepare.statut, 'ok');
    assert.equal(p.m.devis().statut, 'en_attente_envoi');
    assert.equal(p.m.devis().envois, undefined);
    const ligneNote = p.m.collections[C.audit].find((l) => l.outil === 'porteDevisNoterEmailPrepare');
    assert.match(ligneNote.acteur, /^porte:/);
    assert.equal(ligneNote.via, 'porte');
    assert.ok(!JSON.stringify(p.journaux).includes('marie@exemple.fr'));
    // une demande déjà close n'est plus lisible
    assert.equal((await p.appeler(c, 'devis.lireEmail', { devisId: 'dv1', demandeId })).statut, 409);
    // une demande inconnue : 404
    assert.equal((await p.appeler(c, 'devis.lireEmail', { devisId: 'dv1', demandeId: 'dem_fausse' })).statut, 404);
  });
  test('E6 sans service « devis » branché sur la porte (ex. plateforme pas encore équipée) : 503 clair, rien d’écrit', async () => {
    const p = porteEssai({ avecService: false });
    const r = await p.appeler(p.cle('interne'), 'devis.lireEmail', { devisId: 'dv1', demandeId: 'dem_x' });
    assert.equal(r.statut, 503);
    assert.equal(r.corps.erreur, 'devis_non_branche');
  });
});

describe('E7 le lien du PDF donné à n8n : 10 minutes, seulement dans le dossier des devis de l’espace', () => {
  test('E7 le service de la porte signe le lien pour 10 minutes avec la taille du fichier ; un chemin hors du dossier des devis de l’espace n’est jamais signé', async () => {
    const porteJs = await import('../functions/src/porte.js');
    const appels = [];
    const rangement = { lienSigne: async (chemin, options) => { appels.push({ chemin, options }); return 'https://stockage.exemple.test/signe'; }, taille: async () => 4096 };
    const fabrique = (acces, base) => porteJs.creerServiceDevis({ acces, stockage: () => rangement, maintenant: () => apres(1) })(base);
    // Jérôme : espace ''
    const m = monde();
    const n8n = fauxN8n();
    const { demandeId } = await demander(m, n8n);
    m.collections[C.devis][0].pdf.chemin = 'devis/aff1/dv1/devis.pdf';
    const r = await fabrique(m.donnees, '').lireEmail({ devisId: 'dv1', demandeId });
    assert.deepEqual(r.pdf, { nom: 'Devis DEV-2026-10-25-001 v1 – Rénovation cuisine.pdf', lienSigne: 'https://stockage.exemple.test/signe', octets: 4096 });
    assert.equal(appels[0].options.minutes, 10);
    assert.equal(porteJs.DUREE_LIEN_PDF_N8N_MINUTES, 10);
    // un chemin qui sort du dossier des devis : refusé, rien de signé
    m.collections[C.devis][0].pdf.chemin = 'marques/logo.pdf';
    appels.length = 0;
    await assert.rejects(fabrique(m.donnees, '').lireEmail({ devisId: 'dv1', demandeId }), (e) => e.code === 'pdf_indisponible');
    assert.equal(appels.length, 0);
    // un client : le chemin doit être sous clients/<client>/devis/ (jamais celui de Jérôme ni d'un autre client)
    const mc = monde();
    const collections = { 'clients/a/devis_devis': mc.collections[C.devis], 'clients/a/crm_personnes': mc.collections[C.personnes], 'clients/a/crm_actions_lancements': [], 'clients/a/crm_audit': [], 'clients/a/crm_audit_avant': [] };
    const brut = creerAccesMemoire(collections);
    const { demandeId: dc } = await M.demanderPreparation({ donnees: avecBase(brut, 'clients/a'), ctx: ctx(), devisId: 'dv1', espace: 'a', sortie: fauxN8n({ secrets: { [`${SECRET_URL}_a`]: URL_WEBHOOK, [`${SECRET_CLE}_a`]: SECRET } }).sortie, genererId: ids });
    for (const chemin of ['devis/aff1/dv1/devis.pdf', 'clients/b/devis/aff1/dv1/devis.pdf']) {
      collections['clients/a/devis_devis'][0].pdf.chemin = chemin;
      await assert.rejects(fabrique(brut, 'clients/a').lireEmail({ devisId: 'dv1', demandeId: dc }), (e) => e.code === 'pdf_indisponible', chemin);
    }
    collections['clients/a/devis_devis'][0].pdf.chemin = 'clients/a/devis/aff1/dv1/devis.pdf';
    assert.equal((await fabrique(brut, 'clients/a').lireEmail({ devisId: 'dv1', demandeId: dc })).pdf.octets, 4096);
  });
  test('E7 le stockage lit la taille du fichier (null si illisible)', async () => {
    const { creerStockage } = await import('../functions/src/devis/stockage.js');
    const bucket = (meta) => ({ file: () => ({ getMetadata: async () => { if (meta === null) throw new Error('non'); return [meta]; } }) });
    assert.equal(await creerStockage({ bucket: bucket({ size: '2048' }) }).taille('devis/x.pdf'), 2048);
    assert.equal(await creerStockage({ bucket: bucket({}) }).taille('devis/x.pdf'), null);
    assert.equal(await creerStockage({ bucket: bucket(null) }).taille('devis/x.pdf'), null);
  });
});

describe('E8 une nouvelle version repart sans le brouillon préparé de l’ancienne', () => {
  test('E8 la nouvelle version d’un devis dont l’e-mail a été préparé n’hérite pas de emailPrepare (l’ancienne version le garde)', async () => {
    const { m, demandeId } = await mondeAvecDemande();
    await M.noterEmailPrepare({ donnees: m.donnees, ctx: ctx(apres(1)), devisId: 'dv1', demandeId, statut: 'ok' });
    const r = await S.nouvelleVersion({ donnees: m.donnees, ctx: ctx(apres(2)), devisId: 'dv1' });
    assert.equal(r.ok, true);
    assert.equal(r.devis.emailPrepare, undefined);
    assert.equal(m.collections[C.devis].find((d) => d.id === r.devis.id).emailPrepare, undefined);
    assert.equal(m.devis().emailPrepare.statut, 'ok');
  });
});
