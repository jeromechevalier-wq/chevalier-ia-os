// Module Rendez-vous : ce que l'écran demande au serveur pour faire PARTIR des SMS (« Envoyer les propositions », « Prévenir de la pluie », « Annuler le rendez-vous » avec SMS).
// Le même code chez Jérôme et chez les clients (`donnees` est déjà cadré sur l'espace : `avecBase` chez un client).
//  - envoyerPropositions : note la demande d'envoi sur le rendez-vous (`envoiDemandeLe`) puis demande « tire maintenant » à coeur/sms-direct.js. Les SMS eux-mêmes sont
//    fabriqués et réservés par la porte (rdv.aEnvoyer) : un seul chemin d'envoi. Si l'envoi n'aboutit pas, la fonction planifiée (toutes les 15 minutes) enverra quand même ;
//  - envoyerSms          : crée un SMS « a_envoyer » par participant avec le texte écrit à la main (normalisé et compté ici, par le serveur), puis demande « tire maintenant ».
// Rien ne part si l'envoi n'est pas branché pour l'espace (secret CLICKSEND_RDV[_client] : coeur/sms-direct.js) : la demande est refusée AVANT d'écrire quoi que ce soit.
import * as R from '../../partage/rdv.js';
import { ErreurSortieSms } from './sms-direct.js';

export const MESSAGE_RDV_NON_BRANCHE = 'L’envoi des SMS n’est pas encore branché sur cet espace.';
export const TYPES_SMS_MANUEL = Object.freeze(['pluie', 'annulation']);
export const SEGMENTS_MAX_MANUEL = 3;
const T = { rdv: 'rdv_rendezvous', part: 'rdv_participants', msg: 'rdv_messages' };
const MOTIF_ID = /^[A-Za-z0-9_-]{1,100}$/;

/** Erreur « métier » : code stable (invalid-argument, not-found, failed-precondition) et message lisible. */
export class ErreurRdvEnvoi extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ErreurRdvEnvoi';
    this.code = code;
  }
}

/** Le bouton « Envoyer » doit-il être actif ? { branche: true | false }. Ne rend jamais l'adresse ni le secret. */
export async function etatEnvoi({ sortie, espace }) {
  return { branche: (await sortie.brancheRdv(espace)) === true };
}

/**
 * Le solde ClickSend de l'espace, pour le bilan « Prêt à passer en vrai ? » : { branche, solde: <nombre> | null, devise }. Lecture seule, cache de 60 s côté serveur, jamais stocké ;
 * la clé n'en sort jamais. Non branché : { branche: false, solde: null } (jamais d'erreur). Qui a le droit de la demander est contrôlé par la fonction d'appel (compte autorisé, ou éditeur chez un client).
 */
export async function lireSoldeEnvoi({ sortie, espace }) {
  try {
    const r = await sortie.lireSolde(espace);
    return { branche: r?.branche === true, solde: typeof r?.solde === 'number' ? r.solde : null, devise: typeof r?.devise === 'string' ? r.devise : '' };
  } catch { return { branche: false, solde: null, devise: '' }; }
}

async function lireRendezVous(donnees, rendezVousId) {
  if (typeof rendezVousId !== 'string' || !MOTIF_ID.test(rendezVousId)) throw new ErreurRdvEnvoi('invalid-argument', 'Rendez-vous invalide.');
  const rdv = await donnees.document(T.rdv, rendezVousId);
  if (!rdv) throw new ErreurRdvEnvoi('not-found', 'Ce rendez-vous n’existe pas.');
  const participants = await donnees.liste(T.part, { champ: 'rendezVousId', valeur: rendezVousId });
  return { rdv, participants };
}

/** « Tire maintenant » : vrai si le tir a abouti. Une panne n'annule rien (la fonction planifiée enverra) ; « pas branché » est refusé avant. */
async function declencher(sortie, espace, rendezVousId) {
  try {
    const bilan = await sortie.tirerRdv(espace, { rendezVousId });
    // Vrai seulement si le tir est allé au bout sans arrêt, doute ni refus : sinon la demande reste notée et l'écran dit que l'envoi partira dans quelques minutes (jamais « envoyé » à tort).
    return !bilan || (!bilan.arret && !bilan.incertains && !bilan.restants && !bilan.echecs);
  } catch (e) {
    if (e instanceof ErreurSortieSms && e.genre !== 'non_branche') return false;
    throw e;
  }
}

async function exigerBranche(sortie, espace) {
  if ((await sortie.brancheRdv(espace)) !== true) throw new ErreurRdvEnvoi('failed-precondition', MESSAGE_RDV_NON_BRANCHE);
}

/** Envoie les propositions d'un rendez-vous : { ok, declenche }. `ctx.maintenant` : Date. */
export async function envoyerPropositions({ donnees, ctx, espace, sortie, rendezVousId }) {
  await exigerBranche(sortie, espace);
  const { rdv, participants } = await lireRendezVous(donnees, rendezVousId);
  if (!R.estOuvert(rdv)) throw new ErreurRdvEnvoi('failed-precondition', 'Ce rendez-vous n’est plus à envoyer.');
  const verdict = R.validerNouveauRdv({ participants, creneaux: rdv.creneaux, maintenant: ctx.maintenant });
  if (!verdict.ok) throw new ErreurRdvEnvoi('failed-precondition', verdict.erreurs[0]);
  // La demande est notée une minute en arrière : les SMS « créneaux » (dus une minute après la présentation) partent dans le MÊME tir que le premier SMS, sans attendre 15 minutes.
  if (!rdv.envoiDemandeLe) await donnees.appliquer([{ type: 'update', collection: T.rdv, id: rendezVousId, donnees: { envoiDemandeLe: new Date(ctx.maintenant.getTime() - 60_000) } }]);
  return { ok: true, declenche: await declencher(sortie, espace, rendezVousId) };
}

/** Crée un SMS à la main (pluie ou annulation) pour chaque participant : { ok, nombre, declenche, caracteres, segments }. */
export async function envoyerSms({ donnees, ctx, espace, sortie, rendezVousId, type, texte }) {
  if (!TYPES_SMS_MANUEL.includes(type)) throw new ErreurRdvEnvoi('invalid-argument', 'Type de SMS inconnu.');
  if (typeof texte !== 'string' || !texte.trim() || texte.length > 1000) throw new ErreurRdvEnvoi('invalid-argument', 'Écris le texte du SMS (1 000 caractères au plus).');
  await exigerBranche(sortie, espace);
  // Le nom de l'entreprise et « STOP » sont toujours présents (ajoutés ici si la professionnelle les a effacés du texte).
  const reglages = await donnees.document('rdv_parametres', 'reglages');
  const sms = R.preparerSms(R.avecMentionStop(texte, reglages ?? {}));
  if (sms.encodage !== 'gsm7') throw new ErreurRdvEnvoi('invalid-argument', 'Ce texte contient un caractère spécial qui ne peut pas être envoyé tel quel : retire-le.');
  if (sms.segments > SEGMENTS_MAX_MANUEL) throw new ErreurRdvEnvoi('invalid-argument', `Ce SMS est trop long (${SEGMENTS_MAX_MANUEL} SMS au plus).`);
  const { rdv, participants } = await lireRendezVous(donnees, rendezVousId);
  if (rdv.archive && !rdv.annule) throw new ErreurRdvEnvoi('failed-precondition', 'Ce rendez-vous est archivé.');
  if (!participants.length) throw new ErreurRdvEnvoi('failed-precondition', 'Ce rendez-vous n’a aucun participant.');
  // Anti-doublon : un SMS du même type demandé il y a moins de 2 minutes pour ce rendez-vous (deuxième onglet, clic refait après une réponse perdue) n'est pas recréé.
  const recents = (await donnees.liste(T.msg, { champ: 'rendezVousId', valeur: rendezVousId })).filter((m) => m.manuel === true && m.typeMessage === type && ctx.maintenant.getTime() - (m.creeLe?.toMillis?.() ?? new Date(m.creeLe).getTime()) < 120_000);
  if (recents.length) throw new ErreurRdvEnvoi('failed-precondition', 'Ce SMS vient déjà d’être demandé : patiente deux minutes avant de le renvoyer.');
  const suffixe = ctx.maintenant.getTime().toString(36);
  const ecritures = participants.map((p, i) => ({
    type: 'set', collection: T.msg, id: `man_${rendezVousId}_${suffixe}_${i + 1}`,
    donnees: {
      rendezVousId, participantId: p.id, tour: rdv.tour ?? 1, sens: 'sortant', manuel: true, typeMessage: type, numero: p.telephone, texte: sms.texte,
      caracteres: sms.caracteres, segments: sms.segments, etatEnvoi: 'a_envoyer', essais: 0, echeance: `${rendezVousId}:man:${suffixe}:${p.id}`, creeLe: ctx.maintenant,
      ...(rdv.test === true ? { test: true } : {}),
    },
  }));
  if (type === 'annulation') ecritures.push({ type: 'update', collection: T.rdv, id: rendezVousId, donnees: { annule: true, archive: true } });
  await donnees.appliquer(ecritures);
  return { ok: true, nombre: participants.length, declenche: await declencher(sortie, espace, rendezVousId), caracteres: sms.caracteres, segments: sms.segments };
}
