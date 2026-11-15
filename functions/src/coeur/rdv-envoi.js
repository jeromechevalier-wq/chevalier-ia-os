// Module Rendez-vous : ce que l'écran demande au serveur pour faire PARTIR des SMS (« Envoyer les propositions », « Prévenir de la pluie », « Annuler le rendez-vous » avec SMS).
// Le même code chez Jérôme et chez les clients (`donnees` est déjà cadré sur l'espace : `avecBase` chez un client).
//  - envoyerPropositions : note la demande d'envoi sur le rendez-vous (`envoiDemandeLe`) puis demande « tire maintenant » à coeur/sms-direct.js. Les SMS eux-mêmes sont
//    fabriqués et réservés par la porte (rdv.aEnvoyer) : un seul chemin d'envoi. Si l'envoi n'aboutit pas, la fonction planifiée (toutes les 15 minutes) enverra quand même ;
//  - renvoyerSms         : refait partir UN SMS « abandonné » (3 échecs) vers UN participant, à la demande de la professionnelle (nouveau SMS à la main, mêmes mots, relances inchangées) ;
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

const DOUBLE_CLIC_MS = 120_000;
const msDe = (v) => v?.toMillis?.() ?? new Date(v).getTime();

/**
 * Renvoie le SMS « abandonné » d'UN participant (série courante) : { ok, declenche }.
 * Crée un SMS manuel (`manuel: true`) avec le texte exact du SMS abandonné et une échéance neuve `renvoi-<horodatage>` : le calendrier des relances ne bouge pas (il lit `:relance<k>:`
 * dans l'échéance), et le SMS abandonné reçoit `renvoyeLe` (il n'est renvoyé qu'une fois ; si le renvoi est abandonné à son tour, il peut l'être à nouveau).
 * Refus : envoi pas branché, rendez-vous annulé ou archivé, participant d'un autre rendez-vous, participant désinscrit (STOP : aussi la liste `desinscrits`), aucun SMS abandonné, double clic (2 minutes).
 * Jamais le numéro ni le texte dans la réponse d'erreur. Les SMS « envoyés », « en échec » ou « réservés » ne se renvoient pas ici (la fonction planifiée les reprend seule).
 */
export async function renvoyerSms({ donnees, ctx, espace, sortie, rendezVousId, participantId }) {
  if (typeof participantId !== 'string' || !MOTIF_ID.test(participantId)) throw new ErreurRdvEnvoi('invalid-argument', 'Participant invalide.');
  await exigerBranche(sortie, espace);
  const { rdv, participants } = await lireRendezVous(donnees, rendezVousId);
  if (rdv.annule || rdv.archive) throw new ErreurRdvEnvoi('failed-precondition', 'Ce rendez-vous est annulé ou archivé : rien n’est renvoyé.');
  const p = participants.find((x) => x.id === participantId);
  if (!p) throw new ErreurRdvEnvoi('not-found', 'Ce participant n’est pas dans ce rendez-vous.');
  const liste = await donnees.document('rdv_parametres', 'desinscrits');
  if (p.desinscrit === true || (Array.isArray(liste?.numeros) && liste.numeros.includes(p.telephone))) throw new ErreurRdvEnvoi('failed-precondition', 'Cette personne a répondu STOP : aucun SMS ne lui est envoyé.');
  const messages = (await donnees.liste(T.msg, { champ: 'rendezVousId', valeur: rendezVousId })).filter((m) => m.participantId === participantId && m.sens !== 'entrant');
  const maintenantMs = ctx.maintenant.getTime();
  if (messages.some((m) => m.renvoi === true && maintenantMs - msDe(m.creeLe) < DOUBLE_CLIC_MS)) throw new ErreurRdvEnvoi('failed-precondition', 'Ce SMS vient déjà d’être renvoyé : patiente deux minutes.');
  const abandonnes = messages.filter((m) => m.etatEnvoi === 'abandonne' && m.typeMessage !== 'alerte' && (m.tour ?? 1) === (rdv.tour ?? 1) && !m.renvoyeLe);
  if (!abandonnes.length) throw new ErreurRdvEnvoi('failed-precondition', 'Aucun SMS abandonné à renvoyer pour cette personne.');
  const source = abandonnes.sort((a, b) => (msDe(b.envoyeLe ?? b.creeLe) || 0) - (msDe(a.envoyeLe ?? a.creeLe) || 0))[0];
  if (typeof source.texte !== 'string' || !source.texte.trim() || !p.telephone) throw new ErreurRdvEnvoi('failed-precondition', 'Ce SMS ne peut pas être renvoyé tel quel.');
  const suffixe = maintenantMs.toString(36);
  await donnees.appliquer([
    {
      type: 'set', collection: T.msg, id: `ren_${rendezVousId}_${suffixe}_${participantId}`.slice(0, 150),
      donnees: {
        rendezVousId, participantId, tour: rdv.tour ?? 1, sens: 'sortant', manuel: true, renvoi: true, renvoiDe: source.id, typeMessage: source.typeMessage ?? 'creneaux', numero: p.telephone, texte: source.texte,
        caracteres: source.caracteres, segments: source.segments, etatEnvoi: 'a_envoyer', essais: 0, echeance: `renvoi-${maintenantMs}`, creeLe: ctx.maintenant,
        ...(rdv.test === true ? { test: true } : {}),
      },
    },
    { type: 'update', collection: T.msg, id: source.id, donnees: { renvoyeLe: ctx.maintenant } },
  ]);
  return { ok: true, declenche: await declencher(sortie, espace, rendezVousId) };
}
