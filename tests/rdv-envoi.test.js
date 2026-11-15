// Module Rendez-vous, côté serveur : ce que l'écran demande pour faire PARTIR des SMS (functions/src/coeur/rdv-envoi.js, rdv-appel.js, functions-plateforme/src/rdv.js).
// Tout en mémoire : ni Firebase ni réseau, ni ClickSend. La sortie d'envoi (coeur/sms-direct.js, testé à part dans sms-direct.test.js) est remplacée par une fausse sortie qui note ce qu'elle reçoit.
import assert from 'node:assert/strict';
import { test, describe } from 'node:test';
import { lireSoldeEnvoi, etatEnvoi, envoyerPropositions, envoyerSms, ErreurRdvEnvoi, MESSAGE_RDV_NON_BRANCHE } from '../functions/src/coeur/rdv-envoi.js';
import { creerAccesMemoire } from '../functions/src/coeur/donnees.js';
import { ErreurSortieSms, nomDuSecret } from '../functions/src/coeur/sms-direct.js';
import { creerAppelRdvEnvoyer, creerAppelRdvEtat } from '../functions/src/rdv-appel.js';
import { ADMINISTRATEURS } from '../js/os/administrateur.js';
import { envoyerRdv, etatRdv } from '../functions-plateforme/src/rdv.js';

const T0 = new Date('2026-11-16T10:00:00Z');
const FUTUR = [new Date(T0.getTime() + 4 * 86400000).toISOString()];

function fauxSortie({ branche = true, panne = false, bilan = undefined, solde = 12.5, panneSolde = false } = {}) {
  const appels = [];
  return {
    appels,
    brancheRdv: async () => branche,
    lireSolde: async (espace) => { if (panneSolde) throw new Error('boum'); appels.push({ espace, lecture: 'solde' }); return { branche, solde: branche ? solde : null, devise: branche ? 'EUR' : '', cle: 'jamais-rendue' }; },
    tirerRdv: async (espace, params) => { if (panne) throw new ErreurSortieSms('indisponible', 'L’envoi n’a pas abouti.'); appels.push({ espace, params }); return bilan; },
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
  test('note la demande d\'envoi sur le rendez-vous et demande « tire maintenant »', async () => {
    const donnees = creerAccesMemoire(base());
    const sortie = fauxSortie();
    const r = await envoyerPropositions({ donnees, ctx, espace: 'interne', sortie, rendezVousId: 'r1' });
    assert.deepEqual(r, { ok: true, declenche: true });
    assert.deepEqual(sortie.appels, [{ espace: 'interne', params: { rendezVousId: 'r1' } }]);
    assert.equal(new Date((await donnees.document('rdv_rendezvous', 'r1')).envoiDemandeLe).getTime(), T0.getTime() - 60_000, 'notée une minute en arrière : les créneaux partent dans le même tir que la présentation');
  });
  test('un tir arrêté (crédit épuisé), incertain ou incomplet : `declenche: false` (l\'écran ne dit jamais « envoyé » quand rien n\'est parti), la demande reste notée', async () => {
    for (const bilan of [{ branche: true, envoyes: 0, echecs: 0, incertains: 0, restants: 2, arret: 'credit_epuise' }, { branche: true, envoyes: 0, echecs: 0, incertains: 1, restants: 0 }, { branche: true, envoyes: 1, echecs: 0, incertains: 0, restants: 3 }, { branche: true, envoyes: 0, echecs: 2, incertains: 0, restants: 0 }]) {
      const donnees = creerAccesMemoire(base());
      const r = await envoyerPropositions({ donnees, ctx, espace: 'interne', sortie: fauxSortie({ bilan }), rendezVousId: 'r1' });
      assert.deepEqual([r.ok, r.declenche], [true, false], JSON.stringify(bilan));
      assert.ok((await donnees.document('rdv_rendezvous', 'r1')).envoiDemandeLe);
    }
    const bon = await envoyerPropositions({ donnees: creerAccesMemoire(base()), ctx, espace: 'interne', sortie: fauxSortie({ bilan: { branche: true, envoyes: 2, echecs: 0, incertains: 0, restants: 0 } }), rendezVousId: 'r1' });
    assert.equal(bon.declenche, true);
  });
  test('envoi pas branché : refus clair AVANT d\'écrire quoi que ce soit', async () => {
    const donnees = creerAccesMemoire(base());
    await assert.rejects(() => envoyerPropositions({ donnees, ctx, espace: 'interne', sortie: fauxSortie({ branche: false }), rendezVousId: 'r1' }), (e) => e instanceof ErreurRdvEnvoi && e.code === 'failed-precondition' && e.message === MESSAGE_RDV_NON_BRANCHE);
    assert.equal((await donnees.document('rdv_rendezvous', 'r1')).envoiDemandeLe, null);
  });
  test('envoi en panne : la demande est notée (la fonction planifiée enverra quand même), `declenche: false`', async () => {
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
    assert.deepEqual(await etat({ ...jeton('jerome@exemple.test') }), { branche: true, peutConfigurer: false }, 'un compte autorisé qui n’est pas Jérôme ne peut pas configurer la connexion SMS');
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
    assert.equal(nomDuSecret('atelier'), 'CLICKSEND_RDV_atelier');
    assert.equal(nomDuSecret('interne'), 'CLICKSEND_RDV');
  });
  test('refus neutre pour un lecteur, un non-membre, un module inactif et l\'espace « interne » ; l\'état du branchement suit les mêmes règles', async () => {
    const essais = [['lec@exemple.test', 'atelier'], ['inconnu@exemple.test', 'atelier'], ['ed@exemple.test', 'sansrdv'], ['ed@exemple.test', 'interne'], ['ed@exemple.test', 'absent']];
    for (const [email, client] of essais) {
      await assert.rejects(() => envoyerRdv({ db, auth: auth(email), donnees: { client, action: 'propositions', rendezVousId: 'r1' }, sortie: fauxSortie(), creerDonnees: acces }), (e) => e.message === 'Action non autorisée.', `${email} ${client}`);
      await assert.rejects(() => etatRdv({ db, auth: auth(email), donnees: { client }, sortie: fauxSortie() }), (e) => e.message === 'Action non autorisée.', `état ${email} ${client}`);
    }
    assert.deepEqual(await etatRdv({ db, auth: auth('ed@exemple.test'), donnees: { client: 'atelier' }, sortie: fauxSortie({ branche: false }) }), { branche: false, peutConfigurer: false }, 'un éditeur du client ne peut pas configurer la connexion SMS');
  });
  test('une demande sans connexion vérifiée est refusée', async () => {
    await assert.rejects(() => envoyerRdv({ db, auth: undefined, donnees: { client: 'atelier', action: 'propositions', rendezVousId: 'r1' }, sortie: fauxSortie(), creerDonnees: acces }), (e) => e.code === 'unauthenticated');
  });
});

describe('solde ClickSend pour le bilan « Prêt à passer en vrai ? » (action « solde » de rdvEnvoyer)', () => {
  const jeton = (email, verifie = true) => ({ auth: { uid: 'u', token: { email, email_verified: verifie } } });
  test('E1-16 lireSoldeEnvoi : { branche, solde, devise } seulement (aucune autre clé de la sortie ne passe) ; non branché ou panne = « indisponible », jamais une erreur', async () => {
    assert.deepEqual(await lireSoldeEnvoi({ sortie: fauxSortie({ solde: 4.5 }), espace: 'interne' }), { branche: true, solde: 4.5, devise: 'EUR' });
    assert.deepEqual(await lireSoldeEnvoi({ sortie: fauxSortie({ branche: false }), espace: 'interne' }), { branche: false, solde: null, devise: '' });
    assert.deepEqual(await lireSoldeEnvoi({ sortie: fauxSortie({ panneSolde: true }), espace: 'interne' }), { branche: false, solde: null, devise: '' });
    assert.deepEqual(await lireSoldeEnvoi({ sortie: { lireSolde: async () => ({ branche: true, solde: 'beaucoup', devise: 7 }) }, espace: 'interne' }), { branche: true, solde: null, devise: '' });
  });
  test('E1-17 chez Jérôme : un compte autorisé lit le solde ; un autre compte, un compte non vérifié ou sans connexion sont refusés ; le journal ne reçoit ni le solde ni un identifiant', async () => {
    const journaux = [];
    const sortie = fauxSortie({ solde: 12.5 });
    const appel = creerAppelRdvEnvoyer({ donnees: () => creerAccesMemoire(base()), sortie, comptes: ['jerome@exemple.test'], journal: (e) => journaux.push(e), maintenant: () => T0.getTime() });
    assert.deepEqual(await appel({ ...jeton('jerome@exemple.test'), data: { action: 'solde' } }), { branche: true, solde: 12.5, devise: 'EUR' });
    assert.deepEqual(sortie.appels, [{ espace: 'interne', lecture: 'solde' }]);
    for (const requete of [jeton('autre@exemple.test'), jeton('jerome@exemple.test', false), {}]) await assert.rejects(() => appel({ ...requete, data: { action: 'solde' } }), (e) => ['permission-denied', 'unauthenticated'].includes(e.code));
    assert.ok(!JSON.stringify(journaux).includes('12.5'), 'le journal ne reçoit pas le solde');
    assert.equal(sortie.appels.length, 1, 'aucune lecture pour les comptes refusés');
  });
  test('E1-18 chez un client : un éditeur lit le solde DE SON espace ; un lecteur, un non-membre, un module inactif et « interne » : refus neutre, aucune lecture', async () => {
    const fauxFirestore = (membres, fiches) => ({ doc: (chemin) => ({ get: async () => {
      const m = /^clients\/([^/]+)\/membres\/(.+)$/.exec(chemin);
      const donnee = m ? membres[`${m[1]}/${m[2]}`] : fiches[chemin.replace(/^clients\//, '')];
      return { exists: Boolean(donnee), get: (champ) => donnee?.[champ] };
    } }) });
    const db = fauxFirestore({ 'atelier/ed@exemple.test': { role: 'editeur' }, 'atelier/lec@exemple.test': { role: 'lecteur' }, 'sansrdv/ed@exemple.test': { role: 'editeur' } }, { atelier: { modules: { rdv: true } }, sansrdv: { modules: { devis: true } } });
    const auth = (email) => ({ uid: 'u', token: { email, email_verified: true } });
    const sortie = fauxSortie({ solde: 33 });
    assert.deepEqual(await envoyerRdv({ db, auth: auth('ed@exemple.test'), donnees: { client: 'atelier', action: 'solde' }, sortie }), { branche: true, solde: 33, devise: 'EUR' });
    assert.deepEqual(sortie.appels, [{ espace: 'atelier', lecture: 'solde' }]);
    for (const [email, client] of [['lec@exemple.test', 'atelier'], ['inconnu@exemple.test', 'atelier'], ['ed@exemple.test', 'sansrdv'], ['ed@exemple.test', 'interne'], ['ed@exemple.test', 'absent']]) {
      await assert.rejects(() => envoyerRdv({ db, auth: auth(email), donnees: { client, action: 'solde' }, sortie }), (e) => e.message === 'Action non autorisée.', `${email} ${client}`);
    }
    assert.equal(sortie.appels.length, 1, 'aucune lecture pour les refusés');
  });
  test('E1-19 le solde ne passe PAS par rdvConnexionSms (réservé à Jérôme) : l’action « solde » y est refusée même pour lui', async () => {
    const { connexionRdv } = await import('../functions-plateforme/src/rdv.js');
    const JEROME = { uid: 'j', token: { email: ADMINISTRATEURS[0], email_verified: true } };
    await assert.rejects(() => connexionRdv({ auth: JEROME, donnees: { client: 'atelier', action: 'solde' }, connexion: { etat: async () => { throw new Error('ne doit pas être appelé'); } }, modulesActifs: async () => ['rdv'] }), (e) => e.code !== undefined);
  });
});
