// Module Rendez-vous, côté serveur : ce que l'écran demande pour faire PARTIR des SMS (functions/src/coeur/rdv-envoi.js, rdv-appel.js, functions-plateforme/src/rdv.js).
// Tout en mémoire : ni Firebase ni réseau, ni ClickSend. La sortie d'envoi (coeur/sms-direct.js, testé à part dans sms-direct.test.js) est remplacée par une fausse sortie qui note ce qu'elle reçoit.
import assert from 'node:assert/strict';
import { test, describe } from 'node:test';
import { lireSoldeEnvoi, etatEnvoi, envoyerPropositions, envoyerSms, renvoyerSms, reautoriserNumero, ErreurRdvEnvoi, MESSAGE_RDV_NON_BRANCHE } from '../functions/src/coeur/rdv-envoi.js';
import { creerAccesMemoire } from '../functions/src/coeur/donnees.js';
import { ErreurSortieSms, nomDuSecret } from '../functions/src/coeur/sms-direct.js';
import * as R from '../js/modules/rdv/logique.js';
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

describe('C2 renvoyerSms (SMS abandonné d\'un participant)', () => {
  const abandonne = (extra = {}) => ({ id: 'm1', rendezVousId: 'r1', participantId: 'p1', tour: 1, sens: 'sortant', manuel: false, typeMessage: 'creneaux', numero: '+33600000001', texte: 'Quel créneau ? 1) mardi 2) mercredi', caracteres: 36, segments: 1, etatEnvoi: 'abandonne', essais: 3, echeance: 'r1:t1:creneaux:p1', creeLe: new Date(T0.getTime() - 3600_000), envoyeLe: new Date(T0.getTime() - 3000_000), ...extra });
  const avec = (messages, rdv = {}, extra = {}) => creerAccesMemoire({ ...base({ envoiDemandeLe: new Date(T0.getTime() - 7200_000), ...rdv }), rdv_messages: messages, ...extra });
  const renvoyer = (donnees, extra = {}) => renvoyerSms({ donnees, ctx, espace: 'interne', sortie: fauxSortie(), rendezVousId: 'r1', participantId: 'p1', ...extra });

  test('C2 le renvoi crée un SMS manuel avec le texte exact, une échéance « renvoi-… », vers ce participant seulement ; l\'ancien est marqué renvoyé ; « tire maintenant »', async () => {
    const donnees = avec([abandonne()]);
    const sortie = fauxSortie();
    const r = await renvoyerSms({ donnees, ctx, espace: 'interne', sortie, rendezVousId: 'r1', participantId: 'p1' });
    assert.deepEqual(r, { ok: true, declenche: true });
    const msgs = await donnees.liste('rdv_messages');
    assert.equal(msgs.length, 2);
    const neuf = msgs.find((m) => m.id !== 'm1');
    assert.deepEqual([neuf.manuel, neuf.renvoi, neuf.etatEnvoi, neuf.essais, neuf.participantId, neuf.numero, neuf.texte, neuf.typeMessage, neuf.tour, neuf.sens], [true, true, 'a_envoyer', 0, 'p1', '+33600000001', 'Quel créneau ? 1) mardi 2) mercredi', 'creneaux', 1, 'sortant']);
    assert.equal(neuf.echeance, `r1:renvoi:${T0.getTime().toString(36)}:p1`);
    assert.equal(neuf.id, 'ren_m1', 'identifiant fixe : le même ancien SMS ne donne jamais deux nouveaux SMS');
    assert.ok(!/:relance\d+:/.test(neuf.echeance), 'le calendrier des relances ne le lit pas');
    assert.ok((await donnees.document('rdv_messages', 'm1')).renvoyeLe, 'l\'ancien SMS est marqué : le bouton disparaît, pas de deuxième renvoi');
    assert.deepEqual(sortie.appels, [{ espace: 'interne', params: { rendezVousId: 'r1' } }]);
  });
  test('C2 les relances ne bougent pas : mêmes SMS dus avant et après un renvoi parti', async () => {
    const parametres = { ...R.PARAMETRES_DEFAUT };
    const rdv = { ...base({ envoiDemandeLe: new Date(T0.getTime() - 86400_000) }).rdv_rendezvous[0] };
    const parts = base().rdv_participants;
    const avant = [abandonne({ echeance: R.idEcheance('r1', 1, 'creneaux', 'p1') })];
    const apres = [...avant, { ...abandonne({ id: 'm9', etatEnvoi: 'envoye', echeance: `r1:renvoi:${T0.getTime().toString(36)}:p1`, manuel: true, renvoi: true }) }];
    const maintenant = T0.getTime() + 4 * 86400_000;
    const cles = (messages) => R.smsDus({ rdv, participants: parts, parametres, messages, maintenant }).map((d) => d.idEcheance).sort();
    assert.deepEqual(cles(apres), cles(avant));
  });
  test('C2 refusés : pas de SMS abandonné (envoyé, en échec, réservé), ancienne série, alerte, déjà renvoyé', async () => {
    for (const extra of [{ etatEnvoi: 'envoye' }, { etatEnvoi: 'echec' }, { etatEnvoi: 'reserve' }, { tour: 0 }, { typeMessage: 'alerte' }, { renvoyeLe: T0 }]) {
      const donnees = avec([abandonne(extra)], { tour: 1 });
      await assert.rejects(() => renvoyer(donnees), (e) => e instanceof ErreurRdvEnvoi && e.code === 'failed-precondition' && /Aucun SMS abandonné/.test(e.message), JSON.stringify(extra));
      assert.equal((await donnees.liste('rdv_messages')).length, 1, 'rien n\'est écrit');
    }
  });
  test('C2 deux SMS abandonnés pour la personne : le plus récent est repris et TOUS sont marqués renvoyés', async () => {
    const donnees = avec([abandonne({ id: 'm1', texte: 'Ancien', envoyeLe: new Date(T0.getTime() - 5000_000) }), abandonne({ id: 'm2', texte: 'Récent', envoyeLe: new Date(T0.getTime() - 1000_000), echeance: 'r1:t1:relance1:p1', typeMessage: 'relance' })]);
    await renvoyer(donnees);
    const neuf = (await donnees.liste('rdv_messages')).find((m) => m.renvoi === true);
    assert.deepEqual([neuf.texte, neuf.typeMessage, neuf.renvoiDe], ['Récent', 'relance', 'm2']);
    assert.ok((await donnees.document('rdv_messages', 'm1')).renvoyeLe && (await donnees.document('rdv_messages', 'm2')).renvoyeLe);
  });
  test('C2 les types sans sens sont écartés avant de prendre le plus récent : sur un rendez-vous annulé, l\'annulation abandonnée est renvoyée même si un SMS « créneaux » plus récent est abandonné', async () => {
    const donnees = avec([abandonne({ id: 'a', typeMessage: 'annulation', texte: 'Annulé', envoyeLe: new Date(T0.getTime() - 5000_000) }), abandonne({ id: 'b', typeMessage: 'creneaux', envoyeLe: new Date(T0.getTime() - 1000_000), echeance: 'r1:t1:creneaux:p1' })], { annule: true, archive: true });
    await renvoyer(donnees);
    const neuf = (await donnees.liste('rdv_messages')).find((m) => m.renvoi === true);
    assert.deepEqual([neuf.renvoiDe, neuf.texte], ['a', 'Annulé']);
  });
  test('C2 un identifiant trop long (la porte refuse plus de 100 caractères) est refusé proprement', async () => {
    const donnees = avec([abandonne({ id: 'x'.repeat(98) })]);
    await assert.rejects(() => renvoyer(donnees), (e) => e instanceof ErreurRdvEnvoi && /tel quel/.test(e.message));
    assert.equal((await donnees.liste('rdv_messages')).length, 1);
  });
  test('C2 deux appels simultanés : un seul SMS est créé (l\'autre est refusé)', async () => {
    const donnees = avec([abandonne()]);
    const resultats = await Promise.allSettled([renvoyer(donnees), renvoyer(donnees)]);
    assert.equal(resultats.filter((r) => r.status === 'fulfilled').length, 1);
    assert.ok(resultats.find((r) => r.status === 'rejected').reason instanceof ErreurRdvEnvoi);
    assert.equal((await donnees.liste('rdv_messages')).filter((m) => m.renvoi === true).length, 1);
  });
  test('C2 présentation, créneaux, relance : refusés si le rendez-vous n\'est plus ouvert ou si tous les créneaux sont passés ; annulation et confirmation restent renvoyables', async () => {
    const passes = [new Date(T0.getTime() - 86400000).toISOString()];
    for (const type of ['confiance', 'creneaux', 'relance']) {
      await assert.rejects(() => renvoyer(avec([abandonne({ typeMessage: type })], { etat: 'confirme', creneauChoisi: FUTUR[0] })), /n’a plus de sens|plus ouvert/, `${type} confirmé`);
      await assert.rejects(() => renvoyer(avec([abandonne({ typeMessage: type })], { creneaux: passes })), /créneaux sont passés/, `${type} passé`);
    }
    assert.equal((await renvoyer(avec([abandonne({ typeMessage: 'annulation' })], { annule: true, archive: true }))).ok, true, 'le SMS d\'annulation se renvoie même si le rendez-vous est annulé');
    assert.equal((await renvoyer(avec([abandonne({ typeMessage: 'confirmation' })], { etat: 'confirme', creneauChoisi: FUTUR[0] }))).ok, true);
    await assert.rejects(() => renvoyer(avec([abandonne({ typeMessage: 'pluie' })], { archive: true })), /annulé ou archivé/);
  });
  test('C2 refusés : pas branché, rendez-vous annulé ou archivé, participant d\'un autre rendez-vous ou inconnu, identifiants piégés', async () => {
    await assert.rejects(() => renvoyer(avec([abandonne()]), { sortie: fauxSortie({ branche: false }) }), (e) => e.code === 'failed-precondition' && e.message === MESSAGE_RDV_NON_BRANCHE);
    for (const rdv of [{ annule: true }, { archive: true }]) await assert.rejects(() => renvoyer(avec([abandonne()], rdv)), /annulé ou archivé/);
    const autre = avec([abandonne()], {}, { rdv_participants: [...base().rdv_participants, { id: 'p9', rendezVousId: 'autre', nom: 'Ailleurs', telephone: '+33600000009' }] });
    await assert.rejects(() => renvoyer(autre, { participantId: 'p9' }), (e) => e.code === 'not-found');
    await assert.rejects(() => renvoyer(avec([abandonne()]), { participantId: 'inconnu' }), (e) => e.code === 'not-found');
    for (const participantId of ['../x', '', 42, undefined]) await assert.rejects(() => renvoyer(avec([abandonne()]), { participantId }), (e) => e.code === 'invalid-argument', String(participantId));
    await assert.rejects(() => renvoyer(avec([abandonne()]), { rendezVousId: '../x' }), (e) => e.code === 'invalid-argument');
    await assert.rejects(() => renvoyer(avec([abandonne()]), { rendezVousId: 'inconnu' }), (e) => e.code === 'not-found');
  });
  test('C2 un participant désinscrit (STOP) n\'est jamais renvoyé, ni par son fiche ni par la liste des désinscrits', async () => {
    const parts = [{ id: 'p1', rendezVousId: 'r1', nom: 'M. Durand', telephone: '+33600000001', desinscrit: true }];
    await assert.rejects(() => renvoyer(avec([abandonne()], {}, { rdv_participants: parts })), /STOP/);
    await assert.rejects(() => renvoyer(avec([abandonne()], {}, { rdv_parametres: [{ id: 'desinscrits', numeros: ['+33600000001'] }] })), /STOP/);
  });
  test('C2 anti double-clic : un renvoi demandé il y a moins de 2 minutes bloque le suivant ; un renvoi abandonné à son tour peut être refait', async () => {
    const donnees = avec([abandonne()]);
    await renvoyer(donnees);
    await assert.rejects(() => renvoyer(donnees), /vient déjà d’être renvoyé/);
    const recent = avec([abandonne({ id: 'm1', renvoyeLe: T0 }), abandonne({ id: 'm2', renvoi: true, manuel: true, creeLe: new Date(T0.getTime() - 30_000), echeance: 'r1:renvoi:1:p1' })]);
    await assert.rejects(() => renvoyer(recent), /vient déjà d’être renvoyé/);
    const ancien = avec([abandonne({ id: 'm1', renvoyeLe: T0 }), abandonne({ id: 'm2', renvoi: true, manuel: true, creeLe: new Date(T0.getTime() - 600_000), echeance: 'r1:renvoi:1:p1' })]);
    assert.equal((await renvoyer(ancien)).ok, true);
  });
  test('C2 un rendez-vous de test garde son repère « test » sur le SMS renvoyé', async () => {
    const donnees = avec([abandonne()], { test: true });
    await renvoyer(donnees);
    assert.equal((await donnees.liste('rdv_messages')).find((m) => m.id !== 'm1').test, true);
  });
  test('C2 la fonction de Jérôme : action « renvoyer » réservée aux comptes autorisés ; le journal ne reçoit ni numéro, ni texte, ni identifiant', async () => {
    const journaux = [];
    const donnees = avec([abandonne()]);
    const appel = creerAppelRdvEnvoyer({ donnees: () => donnees, sortie: fauxSortie(), comptes: ['jerome@exemple.test'], journal: (e) => journaux.push(e), maintenant: () => T0.getTime() });
    const jeton = (email) => ({ auth: { uid: 'u', token: { email, email_verified: true } } });
    await assert.rejects(() => appel({ ...jeton('autre@exemple.test'), data: { action: 'renvoyer', rendezVousId: 'r1', participantId: 'p1' } }), (e) => e.code === 'permission-denied');
    assert.equal((await appel({ ...jeton('jerome@exemple.test'), data: { action: 'renvoyer', rendezVousId: 'r1', participantId: 'p1' } })).ok, true);
    await assert.rejects(() => appel({ ...jeton('jerome@exemple.test'), data: { action: 'renvoyer', rendezVousId: 'r1', participantId: '../x' } }), (e) => e.code === 'invalid-argument');
    assert.deepEqual(journaux.map((j) => [j.action, j.statut]), [['rdvEnvoyer.renvoyer', 'ok'], ['rdvEnvoyer.renvoyer', 'refus']]);
    assert.ok(!JSON.stringify(journaux).match(/\+336|Quel créneau|r1|p1/));
  });
  test('C2 chez les clients : un éditeur renvoie, un lecteur, un non-membre ou un module inactif sont refusés (« Action non autorisée. »)', async () => {
    const membres = { 'atelier/ed@exemple.test': { role: 'editeur' }, 'atelier/lec@exemple.test': { role: 'lecteur' }, 'sansrdv/ed@exemple.test': { role: 'editeur' } };
    const fiches = { atelier: { modules: { rdv: true } }, sansrdv: { modules: { devis: true } } };
    const db = { doc: (chemin) => ({ get: async () => { const m = /^clients\/([^/]+)\/membres\/(.+)$/.exec(chemin); const d = m ? membres[`${m[1]}/${m[2]}`] : fiches[chemin.replace(/^clients\//, '')]; return { exists: Boolean(d), get: (c) => d?.[c] }; } }) };
    const auth = (email) => ({ uid: 'u', token: { email, email_verified: true } });
    const donnees = avec([abandonne()]);
    const sortie = fauxSortie();
    const demande = (email, client) => envoyerRdv({ db, auth: auth(email), donnees: { client, action: 'renvoyer', rendezVousId: 'r1', participantId: 'p1' }, sortie, maintenant: T0.getTime(), creerDonnees: () => donnees });
    for (const [email, client] of [['lec@exemple.test', 'atelier'], ['inconnu@exemple.test', 'atelier'], ['ed@exemple.test', 'sansrdv']]) await assert.rejects(() => demande(email, client), (e) => e.message === 'Action non autorisée.', `${email} ${client}`);
    assert.equal((await donnees.liste('rdv_messages')).length, 1, 'rien n\'est écrit pour un refusé');
    assert.equal((await demande('ed@exemple.test', 'atelier')).ok, true);
    assert.deepEqual(sortie.appels, [{ espace: 'atelier', params: { rendezVousId: 'r1' } }]);
    await assert.rejects(() => envoyerRdv({ db, auth: auth('ed@exemple.test'), donnees: { client: 'atelier', action: 'renvoyer', rendezVousId: 'r1', participantId: '../x' }, sortie, creerDonnees: () => donnees }), (e) => e.code === 'invalid-argument');
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

describe('D2 numéros désinscrits : « Réautoriser » et SMS manuel bloqué', () => {
  const NUM = '+33600000001';
  const monde = (extraParts = {}, { liste = [NUM], rdv = {} } = {}) => creerAccesMemoire({
    ...base({ envoiDemandeLe: new Date(T0.getTime() - 3600_000), ...rdv }),
    rdv_participants: [
      { id: 'p1', rendezVousId: 'r1', nom: 'M. Durand', telephone: NUM, etatReponse: 'incomprise', reponse: 'STOP', creneauxOk: [], desinscrit: true, ...extraParts },
      { id: 'p2', rendezVousId: 'r1', nom: 'Terrassier', telephone: '+33600000002', etatReponse: 'comprise', reponse: '1', creneauxOk: [1] },
    ],
    rdv_messages: [{ id: 'm1', rendezVousId: 'r1', participantId: 'p1', sens: 'sortant', etatEnvoi: 'abandonne', typeMessage: 'creneaux', numero: NUM, texte: 'x', echeance: 'r1:t1:creneaux:p1' }],
    rdv_parametres: liste ? [{ id: 'desinscrits', numeros: liste }] : [],
  });

  test('D2-2 réautoriser : le numéro quitte la liste, la fiche perd le repère STOP, le STOP « incompris » revient à « en attente », l’état du rendez-vous est recalculé, AUCUN message n’est touché', async () => {
    const donnees = monde();
    const avantMsgs = JSON.stringify(await donnees.liste('rdv_messages'));
    assert.equal((await donnees.document('rdv_rendezvous', 'r1')).etat, 'en_attente');
    const r = await reautoriserNumero({ donnees, numero: NUM });
    assert.deepEqual(r, { ok: true, reautorise: true });
    assert.deepEqual((await donnees.document('rdv_parametres', 'desinscrits')).numeros, []);
    const p1 = await donnees.document('rdv_participants', 'p1');
    assert.deepEqual([p1.desinscrit, p1.etatReponse, p1.reponse, p1.creneauxOk], [false, 'attente', '', []]);
    assert.equal((await donnees.document('rdv_participants', 'p2')).etatReponse, 'comprise', 'les autres fiches ne bougent pas');
    assert.equal(JSON.stringify(await donnees.liste('rdv_messages')), avantMsgs, 'un SMS « bloqué » ou abandonné ne repart JAMAIS : aucun message touché');
  });
  test('D2-2 l’état est recalculé : tant que le STOP « bloquait » un rendez-vous où tous les autres avaient répondu, la réautorisation le repasse « en attente » (la personne doit encore répondre)', async () => {
    const donnees = monde({}, { rdv: { etat: 'a_valider' } });
    await reautoriserNumero({ donnees, numero: NUM });
    assert.equal((await donnees.document('rdv_rendezvous', 'r1')).etat, 'en_attente');
  });
  test('D2-2 une réponse SAISIE par la professionnelle est gardée ; un rendez-vous confirmé, annulé ou archivé garde son état', async () => {
    const saisie = monde({ etatReponse: 'saisie', creneauxOk: [2], reponse: '' });
    await reautoriserNumero({ donnees: saisie, numero: NUM });
    const p = await saisie.document('rdv_participants', 'p1');
    assert.deepEqual([p.desinscrit, p.etatReponse, p.creneauxOk], [false, 'saisie', [2]]);
    for (const rdv of [{ etat: 'confirme', creneauChoisi: FUTUR[0] }, { archive: true }, { annule: true }]) {
      const donnees = monde({}, { rdv: { ...rdv, etat: rdv.etat ?? 'a_valider' } });
      await reautoriserNumero({ donnees, numero: NUM });
      assert.equal((await donnees.document('rdv_rendezvous', 'r1')).etat, rdv.etat ?? 'a_valider', JSON.stringify(rdv));
      assert.equal((await donnees.document('rdv_participants', 'p1')).desinscrit, false);
    }
  });
  test('D2-2 un STOP d’avant D1 (numéro dans la liste, aucun repère sur la fiche) : le numéro sort de la liste, la fiche reste intacte ; numéro inconnu : rien à faire', async () => {
    const donnees = monde({ desinscrit: undefined, etatReponse: 'comprise', creneauxOk: [1] });
    assert.equal((await reautoriserNumero({ donnees, numero: NUM })).reautorise, true);
    assert.deepEqual((await donnees.document('rdv_parametres', 'desinscrits')).numeros, []);
    assert.equal((await donnees.document('rdv_participants', 'p1')).etatReponse, 'comprise');
    assert.deepEqual(await reautoriserNumero({ donnees, numero: NUM }), { ok: true, reautorise: false }, 'deux « Réautoriser » de suite : idempotents');
    assert.deepEqual(await reautoriserNumero({ donnees: monde({}, { liste: null }), numero: '+33699999999' }), { ok: true, reautorise: false });
  });
  test('D2-2 le numéro est validé et normalisé ; seul ce numéro est retiré', async () => {
    for (const numero of ['', 'abc', 42, undefined, null, '../x', '0600']) await assert.rejects(() => reautoriserNumero({ donnees: monde(), numero }), (e) => e instanceof ErreurRdvEnvoi && e.code === 'invalid-argument', String(numero));
    const donnees = monde({}, { liste: [NUM, '+33600000009'] });
    await reautoriserNumero({ donnees, numero: '06 00 00 00 01' });
    assert.deepEqual((await donnees.document('rdv_parametres', 'desinscrits')).numeros, ['+33600000009']);
    assert.equal((await donnees.document('rdv_participants', 'p1')).desinscrit, false);
  });
  test('D2-2 un STOP reçu pendant la demande (la liste a changé) : « réessaie », rien n’est écrit', async () => {
    const donnees = monde();
    const vrai = donnees.appliquer;
    donnees.appliquer = async (...a) => { await vrai([{ type: 'update', collection: 'rdv_parametres', id: 'desinscrits', donnees: { numeros: [NUM, '+33600000007'] } }]); return vrai(...a); };
    await assert.rejects(() => reautoriserNumero({ donnees, numero: NUM }), (e) => e.code === 'failed-precondition' && /réessaie/.test(e.message) && !e.message.includes('+336'));
    assert.equal((await donnees.document('rdv_participants', 'p1')).desinscrit, true);
  });
  test('D2-2 la fonction de Jérôme : sans rendez-vous ni branchement, réservée aux comptes autorisés ; le journal ne reçoit pas le numéro', async () => {
    const journaux = [];
    const donnees = monde();
    const sortie = fauxSortie({ branche: false });
    const appel = creerAppelRdvEnvoyer({ donnees: () => donnees, sortie, comptes: ['jerome@exemple.test'], journal: (e) => journaux.push(e), maintenant: () => T0.getTime() });
    const jeton = (email) => ({ auth: { uid: 'u', token: { email, email_verified: true } } });
    await assert.rejects(() => appel({ ...jeton('autre@exemple.test'), data: { action: 'reautoriser', numero: NUM } }), (e) => e.code === 'permission-denied');
    assert.equal((await donnees.document('rdv_participants', 'p1')).desinscrit, true, 'refusé : rien écrit');
    await assert.rejects(() => appel({ ...jeton('jerome@exemple.test'), data: { action: 'reautoriser', numero: 'x' } }), (e) => e.code === 'invalid-argument');
    assert.deepEqual(await appel({ ...jeton('jerome@exemple.test'), data: { action: 'reautoriser', numero: NUM } }), { ok: true, reautorise: true });
    assert.deepEqual(sortie.appels, [], 'aucun envoi, aucune lecture du branchement');
    assert.deepEqual(journaux.map((j) => [j.action, j.statut]), [['rdvEnvoyer.reautoriser', 'refus'], ['rdvEnvoyer.reautoriser', 'ok']]); // le compte refusé n'écrit pas au journal (refus avant l'action)
    assert.ok(!JSON.stringify(journaux).match(/\+336|0600/));
  });
  test('D2-2 chez les clients : un éditeur avec le module réautorise (sans rendez-vous) ; un lecteur, un non-membre ou un module inactif sont refusés (« Action non autorisée. »)', async () => {
    const membres = { 'atelier/ed@exemple.test': { role: 'editeur' }, 'atelier/lec@exemple.test': { role: 'lecteur' }, 'sansrdv/ed@exemple.test': { role: 'editeur' } };
    const fiches = { atelier: { modules: { rdv: true } }, sansrdv: { modules: { devis: true } } };
    const db = { doc: (chemin) => ({ get: async () => { const m = /^clients\/([^/]+)\/membres\/(.+)$/.exec(chemin); const d = m ? membres[`${m[1]}/${m[2]}`] : fiches[chemin.replace(/^clients\//, '')]; return { exists: Boolean(d), get: (c) => d?.[c] }; } }) };
    const auth = (email) => ({ uid: 'u', token: { email, email_verified: true } });
    const donnees = monde();
    const sortie = fauxSortie({ branche: false });
    const demande = (email, client) => envoyerRdv({ db, auth: auth(email), donnees: { client, action: 'reautoriser', numero: NUM }, sortie, maintenant: T0.getTime(), creerDonnees: () => donnees });
    for (const [email, client] of [['lec@exemple.test', 'atelier'], ['inconnu@exemple.test', 'atelier'], ['ed@exemple.test', 'sansrdv']]) await assert.rejects(() => demande(email, client), (e) => e.message === 'Action non autorisée.', `${email} ${client}`);
    assert.equal((await donnees.document('rdv_participants', 'p1')).desinscrit, true, 'refusés : rien n’est écrit');
    assert.deepEqual(await demande('ed@exemple.test', 'atelier'), { ok: true, reautorise: true });
    assert.equal((await donnees.document('rdv_participants', 'p1')).desinscrit, false);
    assert.deepEqual(sortie.appels, []);
    await assert.rejects(() => envoyerRdv({ db, auth: auth('ed@exemple.test'), donnees: { client: 'atelier', action: 'reautoriser', numero: '../x' }, sortie, creerDonnees: () => donnees }), (e) => e.code === 'invalid-argument');
  });
  test('D2-3b SMS manuel : un désinscrit (repère OU liste) reçoit un message « bloque » qui ne part pas ; `nombre` ne compte pas les bloqués ; « tire maintenant » seulement s’il reste quelqu’un', async () => {
    for (const [extra, liste] of [[{}, []], [{ desinscrit: undefined }, [NUM]]]) {
      const donnees = monde(extra, { liste, rdv: { etat: 'confirme', creneauChoisi: FUTUR[0] } });
      const sortie = fauxSortie();
      const r = await envoyerSms({ donnees, ctx, espace: 'interne', sortie, rendezVousId: 'r1', type: 'pluie', texte: 'Pluie demain.' });
      assert.deepEqual([r.ok, r.nombre, r.nombreBloques, r.declenche], [true, 1, 1, true]);
      const msgs = (await donnees.liste('rdv_messages')).filter((m) => m.manuel === true);
      assert.deepEqual(msgs.map((m) => [m.participantId, m.etatEnvoi]).sort(), [['p1', 'bloque'], ['p2', 'a_envoyer']]);
    }
  });
  test('D2-3b tous bloqués : rien n’est demandé à l’envoi ; l’annulation est quand même faite (annulé et archivé)', async () => {
    const donnees = monde({}, { liste: [NUM, '+33600000002'], rdv: { etat: 'en_attente' } });
    const sortie = fauxSortie();
    const r = await envoyerSms({ donnees, ctx, espace: 'interne', sortie, rendezVousId: 'r1', type: 'annulation', texte: 'Rendez-vous annulé.' });
    assert.deepEqual([r.nombre, r.nombreBloques, r.declenche], [0, 2, false]);
    assert.deepEqual(sortie.appels, []);
    const rdv = await donnees.document('rdv_rendezvous', 'r1');
    assert.deepEqual([rdv.annule, rdv.archive], [true, true]);
  });
  test('D2-3b un participant non désinscrit : aucun changement (nombreBloques: 0)', async () => {
    const donnees = creerAccesMemoire(base({ etat: 'confirme', creneauChoisi: FUTUR[0] }));
    const r = await envoyerSms({ donnees, ctx, espace: 'interne', sortie: fauxSortie(), rendezVousId: 'r1', type: 'pluie', texte: 'Pluie demain.' });
    assert.deepEqual([r.nombre, r.nombreBloques], [2, 0]);
  });
});
