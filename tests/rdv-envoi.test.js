// Module Rendez-vous, côté serveur : ce que l'écran demande pour faire PARTIR des SMS (functions/src/coeur/rdv-envoi.js, rdv-appel.js, functions-plateforme/src/rdv.js).
// Tout en mémoire : ni Firebase ni réseau, ni n8n, ni ClickSend. La sortie vers n8n est remplacée par une fausse sortie qui note ce qu'elle reçoit.
import assert from 'node:assert/strict';
import { test, describe } from 'node:test';
import { etatEnvoi, envoyerPropositions, envoyerSms, ErreurRdvEnvoi, MESSAGE_RDV_NON_BRANCHE } from '../functions/src/coeur/rdv-envoi.js';
import { creerAccesMemoire } from '../functions/src/coeur/donnees.js';
import { creerSortieN8n, ErreurSortieN8n, SECRET_RDV_URL, SECRET_RDV_CLE, nomDuSecret, ACTION_N8N_RDV } from '../functions/src/coeur/n8n-sortie.js';
import { creerAppelRdvEnvoyer, creerAppelRdvEtat } from '../functions/src/rdv-appel.js';
import { envoyerRdv, etatRdv } from '../functions-plateforme/src/rdv.js';

const T0 = new Date('2026-11-16T10:00:00Z');
const FUTUR = [new Date(T0.getTime() + 4 * 86400000).toISOString()];

function fauxSortie({ branche = true, panne = false } = {}) {
  const appels = [];
  return {
    appels,
    brancheRdv: async () => branche,
    tirerRdv: async (espace, params) => { if (panne) throw new ErreurSortieN8n('indisponible', 'n8n ne répond pas.'); appels.push({ espace, params }); },
  };
}
const base = (extra = {}) => ({
  rdv_rendezvous: [{ id: 'r1', client: 'M. Durand', creneaux: FUTUR, etat: 'en_attente', archive: false, annule: false, tour: 1, envoiDemandeLe: null, ...extra }],
  rdv_participants: [{ id: 'p1', rendezVousId: 'r1', nom: 'M. Durand', telephone: '+33600000001' }, { id: 'p2', rendezVousId: 'r1', nom: 'Terrassier', telephone: '+33600000002' }],
  rdv_messages: [],
});
const ctx = { maintenant: T0 };

describe('état du branchement', () => {
  test('« branché » seulement si les deux secrets de l\'espace existent ; jamais l\'adresse ni le secret dans la réponse', async () => {
    assert.deepEqual(await etatEnvoi({ sortie: fauxSortie({ branche: true }), espace: 'interne' }), { branche: true });
    assert.deepEqual(await etatEnvoi({ sortie: fauxSortie({ branche: false }), espace: 'interne' }), { branche: false });
  });
});

describe('envoyerPropositions', () => {
  test('note la demande d\'envoi sur le rendez-vous et dit à n8n « tire maintenant » avec le seul identifiant du rendez-vous', async () => {
    const donnees = creerAccesMemoire(base());
    const sortie = fauxSortie();
    const r = await envoyerPropositions({ donnees, ctx, espace: 'interne', sortie, rendezVousId: 'r1' });
    assert.deepEqual(r, { ok: true, declenche: true });
    assert.deepEqual(sortie.appels, [{ espace: 'interne', params: { rendezVousId: 'r1' } }]);
    assert.equal(new Date((await donnees.document('rdv_rendezvous', 'r1')).envoiDemandeLe).getTime(), T0.getTime() - 60_000, 'notée une minute en arrière : les créneaux partent dans le même tir que la présentation');
  });
  test('n8n pas branché : refus clair AVANT d\'écrire quoi que ce soit', async () => {
    const donnees = creerAccesMemoire(base());
    await assert.rejects(() => envoyerPropositions({ donnees, ctx, espace: 'interne', sortie: fauxSortie({ branche: false }), rendezVousId: 'r1' }), (e) => e instanceof ErreurRdvEnvoi && e.code === 'failed-precondition' && e.message === MESSAGE_RDV_NON_BRANCHE);
    assert.equal((await donnees.document('rdv_rendezvous', 'r1')).envoiDemandeLe, null);
  });
  test('n8n en panne : la demande est notée (le workflow planifié enverra quand même), `declenche: false`', async () => {
    const donnees = creerAccesMemoire(base());
    const r = await envoyerPropositions({ donnees, ctx, espace: 'interne', sortie: fauxSortie({ panne: true }), rendezVousId: 'r1' });
    assert.deepEqual(r, { ok: true, declenche: false });
    assert.ok((await donnees.document('rdv_rendezvous', 'r1')).envoiDemandeLe);
  });
  test('renvoyer ne change pas la date de la première demande', async () => {
    const donnees = creerAccesMemoire(base({ envoiDemandeLe: new Date('2026-11-15T09:00:00Z') }));
    await envoyerPropositions({ donnees, ctx, espace: 'interne', sortie: fauxSortie(), rendezVousId: 'r1' });
    assert.equal(new Date((await donnees.document('rdv_rendezvous', 'r1')).envoiDemandeLe).toISOString(), '2026-11-15T09:00:00.000Z');
  });
  test('refusés : rendez-vous inconnu, identifiant piégé, archivé, annulé, confirmé, créneau passé, téléphone fixe, aucun participant', async () => {
    const essai = (rdv, extra = {}) => envoyerPropositions({ donnees: creerAccesMemoire({ ...base(rdv), ...extra }), ctx, espace: 'interne', sortie: fauxSortie(), rendezVousId: 'r1' });
    await assert.rejects(() => envoyerPropositions({ donnees: creerAccesMemoire(base()), ctx, espace: 'interne', sortie: fauxSortie(), rendezVousId: 'inconnu' }), (e) => e.code === 'not-found');
    await assert.rejects(() => envoyerPropositions({ donnees: creerAccesMemoire(base()), ctx, espace: 'interne', sortie: fauxSortie(), rendezVousId: '../x' }), (e) => e.code === 'invalid-argument');
    for (const rdv of [{ archive: true }, { annule: true }, { etat: 'confirme', creneauChoisi: FUTUR[0] }]) await assert.rejects(() => essai(rdv), (e) => e.code === 'failed-precondition', JSON.stringify(rdv));
    await assert.rejects(() => essai({ creneaux: [new Date(T0.getTime() - 86400000).toISOString()] }), /futur/);
    await assert.rejects(() => essai({}, { rdv_participants: [{ id: 'p1', rendezVousId: 'r1', nom: 'X', telephone: '0100000000' }] }), /fixe|mobile/);
    await assert.rejects(() => essai({}, { rdv_participants: [] }), /au moins un participant/);
  });
});

describe('envoyerSms (pluie, annulation)', () => {
  test('un SMS « a_envoyer » par participant, texte normalisé et compté par le serveur, puis « tire maintenant »', async () => {
    const donnees = creerAccesMemoire(base({ etat: 'confirme', creneauChoisi: FUTUR[0] }));
    const sortie = fauxSortie();
    const r = await envoyerSms({ donnees, ctx, espace: 'interne', sortie, rendezVousId: 'r1', type: 'pluie', texte: 'Pluie demain : RDV reporté à cause de la forêt.' });
    assert.deepEqual([r.ok, r.nombre, r.declenche, r.segments], [true, 2, true, 1]);
    const msgs = await donnees.liste('rdv_messages');
    assert.equal(msgs.length, 2);
    assert.ok(msgs.every((m) => m.manuel === true && m.etatEnvoi === 'a_envoyer' && m.typeMessage === 'pluie' && m.sens === 'sortant'));
    assert.equal(msgs[0].texte, 'Pluie demain : RDV reporté à cause de la foret.\nChevalier IA - Répondez STOP pour vous désabonner.', 'ê est remplacé par le serveur, même si l\'écran ne l\'avait pas fait');
    assert.deepEqual(msgs.map((m) => m.numero).sort(), ['+33600000001', '+33600000002']);
    assert.equal(new Set(msgs.map((m) => m.id)).size, 2);
    assert.deepEqual(sortie.appels, [{ espace: 'interne', params: { rendezVousId: 'r1' } }]);
  });
  test('la ligne finale reprend le nom d\'entreprise des réglages de l\'espace, une seule fois, même si le client s\'appelle « Stop » ou si le texte la porte déjà', async () => {
    const lignes = async (texte, rdv = {}) => {
      const donnees = creerAccesMemoire({ ...base(rdv), rdv_parametres: [{ id: 'reglages', nomEntreprise: 'Géolucie' }] });
      await envoyerSms({ donnees, ctx, espace: 'interne', sortie: fauxSortie(), rendezVousId: 'r1', type: 'pluie', texte });
      return (await donnees.liste('rdv_messages'))[0].texte;
    };
    const fin = 'Géolucie - Répondez STOP pour vous désabonner.';
    assert.equal(await lignes('Pluie demain.'), `Pluie demain.\n${fin}`);
    assert.equal(await lignes('Chantier Garage Auto Stop : pluie demain.', { client: 'Garage Auto Stop' }), `Chantier Garage Auto Stop : pluie demain.\n${fin}`);
    assert.equal(await lignes(`Pluie demain.\n${fin}`), `Pluie demain.\n${fin}`);
  });
  test('annulation : le rendez-vous est marqué annulé et archivé dans le même lot', async () => {
    const donnees = creerAccesMemoire(base());
    await envoyerSms({ donnees, ctx, espace: 'interne', sortie: fauxSortie(), rendezVousId: 'r1', type: 'annulation', texte: 'Le RDV est annulé.' });
    assert.deepEqual([(await donnees.document('rdv_rendezvous', 'r1')).annule, (await donnees.document('rdv_rendezvous', 'r1')).archive], [true, true]);
  });
  test('refusés : type inconnu, texte vide ou trop long, caractère qu\'on ne sait pas remplacer, plus de 3 SMS, pas branché, rendez-vous archivé (hors annulé)', async () => {
    const appel = (extra = {}, rdv = {}) => envoyerSms({ donnees: creerAccesMemoire(base(rdv)), ctx, espace: 'interne', sortie: fauxSortie(), rendezVousId: 'r1', type: 'pluie', texte: 'Pluie.', ...extra });
    await assert.rejects(() => appel({ type: 'promo' }), /Type de SMS inconnu/);
    await assert.rejects(() => appel({ texte: '   ' }), /Écris le texte/);
    await assert.rejects(() => appel({ texte: 'a'.repeat(1001) }), /Écris le texte/);
    await assert.rejects(() => appel({ texte: 'Bonjour 你好' }), /caractère spécial/);
    await assert.rejects(() => appel({ texte: 'a'.repeat(500) }), /trop long/);
    await assert.rejects(() => appel({}, { archive: true }), /archivé/);
    await assert.rejects(() => envoyerSms({ donnees: creerAccesMemoire(base()), ctx, espace: 'interne', sortie: fauxSortie({ branche: false }), rendezVousId: 'r1', type: 'pluie', texte: 'x' }), (e) => e.message === MESSAGE_RDV_NON_BRANCHE);
    assert.equal((await appel({}, { annule: true, archive: true })).ok, true, 'un SMS d\'annulation peut partir même si le rendez-vous est déjà annulé');
  });
  test('le même SMS manuel redemandé dans les 2 minutes (deuxième onglet, clic refait) n\'est pas recréé ; un autre type ou plus tard, si', async () => {
    const donnees = creerAccesMemoire(base({ etat: 'confirme', creneauChoisi: FUTUR[0] }));
    const demander = (type, quand) => envoyerSms({ donnees, ctx: { maintenant: quand }, espace: 'interne', sortie: fauxSortie(), rendezVousId: 'r1', type, texte: 'Pluie.' });
    await demander('pluie', T0);
    await assert.rejects(() => demander('pluie', new Date(T0.getTime() + 30_000)), /vient déjà d’être demandé/);
    await demander('annulation', new Date(T0.getTime() + 30_000));
    await demander('pluie', new Date(T0.getTime() + 121_000));
    assert.equal((await donnees.liste('rdv_messages')).length, 6);
  });
  test('rien n\'est écrit quand un contrôle échoue', async () => {
    const donnees = creerAccesMemoire(base());
    await assert.rejects(() => envoyerSms({ donnees, ctx, espace: 'interne', sortie: fauxSortie({ branche: false }), rendezVousId: 'r1', type: 'pluie', texte: 'x' }));
    assert.equal((await donnees.liste('rdv_messages')).length, 0);
  });
});

describe('fonctions appelables de Jérôme', () => {
  const jeton = (email, verifie = true) => ({ auth: { uid: 'u', token: { email, email_verified: verifie } } });
  const COMPTES = ['jerome@exemple.test'];
  test('un compte autorisé envoie ; un autre compte, un compte non vérifié ou sans connexion : refus', async () => {
    const donnees = creerAccesMemoire(base());
    const journaux = [];
    const appel = creerAppelRdvEnvoyer({ donnees: () => donnees, sortie: fauxSortie(), comptes: COMPTES, journal: (e) => journaux.push(e), maintenant: () => T0.getTime() });
    const ok = await appel({ ...jeton('jerome@exemple.test'), data: { action: 'propositions', rendezVousId: 'r1' } });
    assert.equal(ok.ok, true);
    for (const requete of [jeton('autre@exemple.test'), jeton('jerome@exemple.test', false), {}]) await assert.rejects(() => appel({ ...requete, data: { action: 'propositions', rendezVousId: 'r1' } }), (e) => ['permission-denied', 'unauthenticated'].includes(e.code));
    await assert.rejects(() => appel({ ...jeton('jerome@exemple.test'), data: { action: 'inconnue', rendezVousId: 'r1' } }), (e) => e.code === 'invalid-argument');
    assert.ok(!JSON.stringify(journaux).match(/\+336|Durand|r1/), 'le journal ne reçoit ni numéro, ni nom, ni identifiant de rendez-vous');
  });
  test('l\'état du branchement est réservé aux comptes autorisés', async () => {
    const etat = creerAppelRdvEtat({ sortie: fauxSortie({ branche: true }), comptes: COMPTES });
    assert.deepEqual(await etat({ ...jeton('jerome@exemple.test') }), { branche: true });
    await assert.rejects(() => etat({ ...jeton('autre@exemple.test') }), (e) => e.code === 'permission-denied');
  });
});

describe('fonctions appelables chez les clients', () => {
  const fauxFirestore = ({ membres = {}, fiches = {} } = {}) => ({
    doc: (chemin) => ({ get: async () => {
      const m = /^clients\/([^/]+)\/membres\/(.+)$/.exec(chemin);
      const donnee = m ? membres[`${m[1]}/${m[2]}`] : fiches[chemin.replace(/^clients\//, '')];
      return { exists: Boolean(donnee), get: (champ) => donnee?.[champ] };
    } }),
  });
  const auth = (email) => ({ uid: 'u', token: { email, email_verified: true } });
  const db = fauxFirestore({ membres: { 'atelier/ed@exemple.test': { role: 'editeur' }, 'atelier/lec@exemple.test': { role: 'lecteur' }, 'sansrdv/ed@exemple.test': { role: 'editeur' } }, fiches: { atelier: { modules: { rdv: true } }, sansrdv: { modules: { devis: true } } } });
  const acces = () => creerAccesMemoire(base());
  test('un éditeur du client avec le module « rdv » envoie ; le secret lu est celui DU client', async () => {
    const sortie = fauxSortie();
    const r = await envoyerRdv({ db, auth: auth('ed@exemple.test'), donnees: { client: 'atelier', action: 'propositions', rendezVousId: 'r1' }, sortie, maintenant: T0.getTime(), creerDonnees: acces });
    assert.equal(r.ok, true);
    assert.deepEqual(sortie.appels, [{ espace: 'atelier', params: { rendezVousId: 'r1' } }]);
    assert.equal(nomDuSecret(SECRET_RDV_URL, 'atelier'), 'N8N_RDV_URL_atelier');
    assert.equal(nomDuSecret(SECRET_RDV_CLE, 'atelier'), 'N8N_RDV_SECRET_atelier');
    assert.equal(nomDuSecret(SECRET_RDV_URL, 'interne'), 'N8N_RDV_URL');
  });
  test('refus neutre pour un lecteur, un non-membre, un module inactif et l\'espace « interne » ; l\'état du branchement suit les mêmes règles', async () => {
    const essais = [['lec@exemple.test', 'atelier'], ['inconnu@exemple.test', 'atelier'], ['ed@exemple.test', 'sansrdv'], ['ed@exemple.test', 'interne'], ['ed@exemple.test', 'absent']];
    for (const [email, client] of essais) {
      await assert.rejects(() => envoyerRdv({ db, auth: auth(email), donnees: { client, action: 'propositions', rendezVousId: 'r1' }, sortie: fauxSortie(), creerDonnees: acces }), (e) => e.message === 'Action non autorisée.', `${email} ${client}`);
      await assert.rejects(() => etatRdv({ db, auth: auth(email), donnees: { client }, sortie: fauxSortie() }), (e) => e.message === 'Action non autorisée.', `état ${email} ${client}`);
    }
    assert.deepEqual(await etatRdv({ db, auth: auth('ed@exemple.test'), donnees: { client: 'atelier' }, sortie: fauxSortie({ branche: false }) }), { branche: false });
  });
  test('une demande sans connexion vérifiée est refusée', async () => {
    await assert.rejects(() => envoyerRdv({ db, auth: undefined, donnees: { client: 'atelier', action: 'propositions', rendezVousId: 'r1' }, sortie: fauxSortie(), creerDonnees: acces }), (e) => e.code === 'unauthenticated');
  });
});

describe('sortie vers n8n pour les rendez-vous', () => {
  const URL = 'https://n8n.chevalier-ia.fr/webhook/essai-faux-rdv';
  const sortie = (secrets, extra = {}) => {
    const appels = [];
    const s = creerSortieN8n({ lireSecret: async (nom) => { if (!(nom in secrets)) throw new Error('absent'); return secrets[nom]; }, fetchImpl: extra.fetchImpl ?? (async (url, options) => { appels.push({ url, options }); return { ok: true, status: 200 }; }), maintenant: extra.maintenant });
    return { s, appels };
  };
  test('un seul corps fixe : action, espace, identifiant du rendez-vous (aucun numéro, aucun texte) ; en-tête secret ; aucune redirection', async () => {
    const { s, appels } = sortie({ [SECRET_RDV_URL]: URL, [SECRET_RDV_CLE]: ' secret-essai ' });
    assert.equal(await s.brancheRdv('interne'), true);
    await s.tirerRdv('interne', { rendezVousId: 'r1', numero: '+33600000001', texte: 'ne doit pas partir' });
    assert.equal(appels.length, 1);
    assert.deepEqual(JSON.parse(appels[0].options.body), { action: ACTION_N8N_RDV, espace: 'interne', rendezVousId: 'r1' });
    assert.equal(appels[0].options.headers['X-Chevalier-Secret'], 'secret-essai');
    assert.equal(appels[0].options.redirect, 'error');
    assert.equal(appels[0].url, URL);
  });
  test('les secrets de « Préparer l\'e-mail » ne branchent pas les rendez-vous, et inversement', async () => {
    const devis = sortie({ N8N_DEVIS_EMAIL_URL: URL, N8N_DEVIS_EMAIL_SECRET: 's' });
    assert.equal(await devis.s.branche('interne'), true);
    assert.equal(await devis.s.brancheRdv('interne'), false);
    await assert.rejects(() => devis.s.tirerRdv('interne', { rendezVousId: 'r1' }), (e) => e.genre === 'non_branche');
    const rdv = sortie({ [SECRET_RDV_URL]: URL, [SECRET_RDV_CLE]: 's' });
    assert.equal(await rdv.s.branche('interne'), false);
  });
  test('adresse hors de notre n8n ou secret illisible : pas branché ; n8n qui refuse ou ne répond pas : erreurs distinctes', async () => {
    assert.equal(await sortie({ [SECRET_RDV_URL]: 'https://exemple.test/webhook/x', [SECRET_RDV_CLE]: 's' }).s.brancheRdv('interne'), false);
    assert.equal(await sortie({ [SECRET_RDV_URL]: URL, [SECRET_RDV_CLE]: 'a\nb' }).s.brancheRdv('interne'), false);
    const refuse = sortie({ [SECRET_RDV_URL]: URL, [SECRET_RDV_CLE]: 's' }, { fetchImpl: async () => ({ ok: false, status: 403 }) });
    await assert.rejects(() => refuse.s.tirerRdv('interne', { rendezVousId: 'r1' }), (e) => e.genre === 'refuse');
    const coupe = sortie({ [SECRET_RDV_URL]: URL, [SECRET_RDV_CLE]: 's' }, { fetchImpl: async () => { throw new Error('réseau'); } });
    await assert.rejects(() => coupe.s.tirerRdv('interne', { rendezVousId: 'r1' }), (e) => e.genre === 'indisponible');
  });
});
