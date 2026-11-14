// Actions de la porte pour le module Rendez-vous : le serveur (functions/src/coeur/sms-direct.js) envoie les SMS par ClickSend et reçoit les réponses en appelant ces actions directement ; la plateforme décide de TOUT le reste.
//  - rdv.aEnvoyer           : liste les SMS dus maintenant (premiers SMS, relances, alerte de fin, rappel de la veille, confirmation, alertes, SMS écrits à la main), avec le texte EXACT
//                             (déjà normalisé et compté) et le numéro cible. Chaque SMS est RÉSERVÉ 15 minutes (aucun doublon entre « lire » et « confirmer », même si deux workflows tournent) ;
//  - rdv.confirmerEnvoi     : le workflow dit « envoyé » (avec l'identifiant du fournisseur) ou « raté ». Rejouable : un SMS déjà confirmé répond `deja: true` ;
//  - rdv.enregistrerReponse : une réponse reçue (numéro, texte, identifiant du message chez le fournisseur). Rattachée au bon participant, jamais deux fois (idempotente) ;
//                             « STOP » désinscrit le numéro ; un numéro présent dans deux rendez-vous ouverts n'est jamais deviné (la professionnelle tranche).
// Chaque SMS a un identifiant d'échéance DÉTERMINISTE (logique.js, idEcheance) qui sert d'identifiant de document : deux appels simultanés ne peuvent pas créer deux SMS.
// La porte ne parle jamais à ClickSend : l'appelant envoie le texte reçu tel quel. Le journal de la porte ne reçoit ni numéro, ni texte (ligneDeJournal : liste blanche).
import { ErreurAction } from './actions-veille.js';
import * as R from '../../js/modules/rdv/logique.js';

export const RESERVATION_MS = 15 * 60 * 1000;
export const ESSAIS_MAX = 3;
export const MAX_PAR_APPEL = 40;
const LOT_MAX = 18; // une opération en moins que la limite de 20 de l'adaptateur : marge pour le repère « déjà vu »
const T = { rdv: 'rdv_rendezvous', part: 'rdv_participants', msg: 'rdv_messages', param: 'rdv_parametres' };
const PRECONDITION = (v) => v && typeof v === 'object' && v.preconditionEchouee === true;

const chemin = (base, table, id) => `${base ? `${base}/` : ''}${table}${id === undefined ? '' : `/${id}`}`;
const instant = (maintenant) => (typeof maintenant === 'function' ? maintenant() : maintenant);

/** Identifiant de document d'un SMS : l'identifiant d'échéance, réduit aux caractères permis (et raccourci avec une empreinte s'il dépasse 100 caractères). */
export function docIdMessage(echeance) {
  const s = String(echeance).replace(/[^A-Za-z0-9_-]/g, '_');
  if (s.length <= 100) return s;
  let h = 2166136261;
  for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  return `${s.slice(0, 88)}_${h.toString(16).padStart(8, '0')}`;
}

/** Firestore refuse les champs « undefined » : on les retire avant d'écrire. */
const sansIndefini = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
const enMs = (v) => (v && typeof v.toMillis === 'function' ? v.toMillis() : R.enMs(v));

async function lireContexte(ctx) {
  const { base, donnees } = ctx;
  const [reglages, desinscrits] = await Promise.all([donnees.lireDoc(chemin(base, T.param, 'reglages')), donnees.lireDoc(chemin(base, T.param, 'desinscrits'))]);
  return { parametres: reglages ?? {}, desinscrits: Array.isArray(desinscrits?.numeros) ? desinscrits.numeros : [] };
}

const DEUX_JOURS_MS = 2 * 86400000;

/** Les rendez-vous non archivés de l'espace (les archivés sont lus par leur champ `archive`, jamais tous : pas de plafond qui masquerait des rendez-vous ouverts), avec leurs participants. */
async function rendezVousActifs(ctx, filtre) {
  const { base, donnees } = ctx;
  const tous = await donnees.listerPar(chemin(base, T.rdv), 'archive', false, { limite: 500 });
  const liste = [];
  for (const rdv of tous.filter((r) => r.annule !== true && filtre(r))) liste.push({ rdv, participants: await donnees.listerPar(chemin(base, T.part), 'rendezVousId', rdv.id, { limite: 50 }) });
  return liste;
}
/** Pour ENVOYER : les rendez-vous ouverts ET les confirmés dont le rendez-vous n'est pas passé depuis plus de 2 jours (confirmation et rappel de la veille naissent là) ; `smsDus` fait le tri. */
const rendezVousPourEnvoi = (ctx, maintenantMs) => rendezVousActifs(ctx, (r) => {
  if (R.estOuvert(r)) return true;
  const choisi = enMs(r.creneauChoisi);
  return (r.etat === 'confirme' || !!r.creneauChoisi) && (!Number.isFinite(choisi) || choisi > maintenantMs - DEUX_JOURS_MS);
});
/** Pour RATTACHER une réponse : les rendez-vous ouverts dont les propositions sont réellement parties (un brouillon n'attend aucune réponse). */
const rendezVousAttendantUneReponse = (ctx) => rendezVousActifs(ctx, (r) => R.estOuvert(r) && !!r.envoiDemandeLe);

/** Réserve un SMS : crée son document, ou reprend un SMS dont la réservation est expirée ou qui a échoué (moins de 3 fois). Rend le document à envoyer, ou null s'il n'est pas à envoyer. */
async function reserver(ctx, docId, creation, maintenantMs) {
  const { base, donnees } = ctx;
  const ch = chemin(base, T.msg, docId);
  const reservation = { etatEnvoi: 'reserve', reserveJusqua: new Date(maintenantMs + RESERVATION_MS) };
  if (creation && await donnees.creerSiAbsent(ch, sansIndefini({ ...creation, ...reservation, essais: 0, creeLe: new Date(maintenantMs) }))) return { ...creation, essais: 0 };
  const existant = await donnees.lireDoc(ch);
  if (!existant) return null;
  const expiree = existant.etatEnvoi === 'reserve' && enMs(existant.reserveJusqua) <= maintenantMs;
  const libre = existant.etatEnvoi === 'a_envoyer' || existant.etatEnvoi === 'echec' || expiree;
  if (!libre) return null;
  if (expiree) {
    // Réservation expirée = le SMS est peut-être parti sans que sa confirmation soit arrivée : chaque reprise compte comme un essai, et après 3 on ne le renvoie plus jamais seul.
    const essais = (existant.essais ?? 0) + 1;
    if (essais >= ESSAIS_MAX) { await donnees.majDoc(ch, { etatEnvoi: 'abandonne', essais, reserveJusqua: null, envoyeLe: new Date(maintenantMs), erreur: 'Confirmation d\'envoi jamais reçue' }, { lastUpdateTime: existant.updateTime }); return null; }
    const r = await donnees.majDoc(ch, { ...reservation, essais }, { lastUpdateTime: existant.updateTime });
    return r === false || PRECONDITION(r) ? null : existant;
  }
  const r = await donnees.majDoc(ch, reservation, { lastUpdateTime: existant.updateTime });
  if (r === false || PRECONDITION(r)) return null; // un autre appel l'a pris entre-temps
  return existant;
}

/**
 * Ce qui suit un SMS envoyé, écrit APRÈS la ligne « envoyé » et idempotent (rejouable sans effet de plus) :
 * l'alerte « relances terminées » est notée sur le rendez-vous ET le rendez-vous passe à « À reprendre » s'il manque encore des réponses ; le compteur de relances avance ; la demande d'envoi est notée.
 */
async function appliquerSuites(ctx, m, maintenantMs) {
  const { base, donnees } = ctx;
  if (!m.rendezVousId) return;
  const rdv = await donnees.lireDoc(chemin(base, T.rdv, m.rendezVousId));
  if (!rdv || (m.tour ?? 1) !== (rdv.tour ?? 1)) return; // un SMS d'une ancienne série (rejeu, nouvel essai du nœud) ne change rien à la série courante
  const patch = {};
  if (m.sousType === 'fin-relances' && !rdv.relancesTermineesLe) {
    patch.relancesTermineesLe = new Date(maintenantMs);
    const participants = await donnees.listerPar(chemin(base, T.part), 'rendezVousId', rdv.id, { limite: 50 });
    const etat = R.etatCalcule({ ...rdv, relancesTermineesLe: new Date(maintenantMs) }, participants);
    if (etat !== (rdv.etat || 'en_attente')) patch.etat = etat;
  }
  const k = /:relance(\d+):/.exec(String(m.echeance))?.[1];
  if (k && Number(k) > (rdv.relancesFaites ?? 0)) patch.relancesFaites = Number(k);
  if (Object.keys(patch).length) await donnees.majDoc(chemin(base, T.rdv, rdv.id), patch);
}

export const ACTIONS_RDV = Object.freeze({
  'rdv.aEnvoyer': {
    ecrit: true,
    schema: { limite: { type: 'nombre', min: 1, max: MAX_PAR_APPEL } },
    async executer(ctx, d) {
      const maintenantMs = instant(ctx.maintenant);
      const { parametres, desinscrits } = await lireContexte(ctx);
      const aEnvoyer = [];
      const limite = d.limite ?? MAX_PAR_APPEL;
      for (const { rdv, participants } of await rendezVousPourEnvoi(ctx, maintenantMs)) {
        if (aEnvoyer.length >= limite) break;
        // « envoyé » ET « abandonné » comptent comme faits pour le calendrier (sinon un SMS abandonné bloquerait les relances de tout le rendez-vous) ; l'abandon déclenche une alerte (smsDus).
        const messages = (await ctx.donnees.listerPar(chemin(ctx.base, T.msg), 'rendezVousId', rdv.id, { limite: 1000 })).filter((m) => (m.etatEnvoi === 'envoye' || m.etatEnvoi === 'abandonne') && m.sens !== 'entrant');
        const dus = R.smsDus({ rdv, participants, parametres, messages, maintenant: maintenantMs, desinscrits });
        for (const du of dus) {
          if (aEnvoyer.length >= limite) break;
          const docId = docIdMessage(du.idEcheance);
          const doc = await reserver(ctx, docId, {
            rendezVousId: rdv.id, participantId: du.participantId, tour: du.tour, sens: 'sortant', numero: du.numero, texte: du.texte, caracteres: du.caracteres, segments: du.segments,
            typeMessage: du.typeMessage, sousType: du.sousType, echeance: du.idEcheance, test: rdv.test === true ? true : undefined,
          }, maintenantMs);
          if (doc) aEnvoyer.push({ messageId: docId, rendezVousId: rdv.id, numero: du.numero, texte: du.texte, caracteres: du.caracteres, segments: du.segments, typeMessage: du.typeMessage });
        }
      }
      // SMS écrits à la main (pluie, annulation) : déjà créés à l'état « a_envoyer » par l'appli, jamais retardés par la plage d'envoi ; ils partent même si le rendez-vous est annulé ou archivé.
      for (const etatEnvoi of ['a_envoyer', 'echec', 'reserve']) {
        for (const m of await ctx.donnees.listerPar(chemin(ctx.base, T.msg), 'etatEnvoi', etatEnvoi, { limite: 200 })) {
          if (aEnvoyer.length >= limite) break;
          if (m.manuel !== true || m.sens === 'entrant') continue;
          const rdv = m.rendezVousId ? await ctx.donnees.lireDoc(chemin(ctx.base, T.rdv, m.rendezVousId)) : null;
          if (!rdv) continue; // rendez-vous introuvable : on n'envoie rien (jamais un SMS « test » vers un vrai numéro)
          const numero = R.numeroCible(m.numero, { test: rdv.test === true || m.test === true }, parametres);
          if (!numero || desinscrits.includes(m.numero)) continue;
          if (!(await reserver(ctx, m.id, null, maintenantMs))) continue;
          aEnvoyer.push({ messageId: m.id, rendezVousId: m.rendezVousId, numero, texte: m.texte, caracteres: m.caracteres, segments: m.segments, typeMessage: m.typeMessage });
        }
      }
      return { messages: aEnvoyer, nombre: aEnvoyer.length };
    },
  },

  'rdv.confirmerEnvoi': {
    ecrit: true,
    schema: {
      messageId: { type: 'id', requis: true },
      statut: { type: 'choix', valeurs: ['ok', 'echec'], requis: true },
      idFournisseur: { type: 'id' },
      message: { type: 'libre', max: 200 },
    },
    async executer(ctx, d) {
      const { base, donnees } = ctx;
      const maintenantMs = instant(ctx.maintenant);
      const ch = chemin(base, T.msg, d.messageId);
      const m = await donnees.lireDoc(ch);
      if (!m || m.sens === 'entrant') throw new ErreurAction('message_inconnu', 'Ce message n\'existe pas.', 404);
      if (m.etatEnvoi === 'envoye') { await appliquerSuites(ctx, m, maintenantMs); return { messageId: d.messageId, statut: 'ok', deja: true }; } // rejeu : on refait les suites (idempotentes) au cas où un plantage les aurait interrompues
      if (m.etatEnvoi === 'abandonne' && d.statut !== 'ok') return { messageId: d.messageId, statut: 'echec', deja: true };
      // Un « ok » qui arrive APRÈS l'abandon (réponse lente : le SMS est bien parti) remet le SMS à « envoyé » et applique les suites.
      if (d.statut === 'ok') {
        const r = await donnees.majDoc(ch, { etatEnvoi: 'envoye', envoyeLe: new Date(maintenantMs), reserveJusqua: null, ...(d.idFournisseur ? { idFournisseur: d.idFournisseur } : {}) }, { lastUpdateTime: m.updateTime });
        if (PRECONDITION(r)) { const apres = await donnees.lireDoc(ch); if (apres?.etatEnvoi === 'envoye') return { messageId: d.messageId, statut: 'ok', deja: true }; throw new ErreurAction('conflit', 'Le message a changé : réessaie.', 409); }
        await appliquerSuites(ctx, m, maintenantMs);
        return { messageId: d.messageId, statut: 'ok', deja: false };
      }
      const essais = (m.essais ?? 0) + 1;
      const abandon = essais >= ESSAIS_MAX;
      await donnees.majDoc(ch, { etatEnvoi: abandon ? 'abandonne' : 'echec', essais, reserveJusqua: null, ...(abandon ? { envoyeLe: new Date(maintenantMs) } : {}), ...(d.message ? { erreur: d.message } : {}) });
      return { messageId: d.messageId, statut: 'echec', essais, abandonne: abandon, deja: false };
    },
  },

  // Rend un SMS réservé à « à envoyer » SANS compter d'essai : l'appelant sait que rien n'est parti (clé refusée, crédit épuisé, ClickSend indisponible, budget de temps dépassé).
  // Sans cela, chaque réservation expirée compterait comme un essai et trois pannes passagères abandonneraient le SMS pour toujours.
  'rdv.libererEnvoi': {
    ecrit: true,
    schema: { messageId: { type: 'id', requis: true } },
    async executer(ctx, d) {
      const { base, donnees } = ctx;
      const ch = chemin(base, T.msg, d.messageId);
      const m = await donnees.lireDoc(ch);
      if (!m || m.sens === 'entrant') throw new ErreurAction('message_inconnu', 'Ce message n\'existe pas.', 404);
      if (m.etatEnvoi !== 'reserve') return { messageId: d.messageId, libere: false };
      const r = await donnees.majDoc(ch, { etatEnvoi: 'a_envoyer', reserveJusqua: null }, { lastUpdateTime: m.updateTime });
      return { messageId: d.messageId, libere: !(r === false || PRECONDITION(r)) };
    },
  },

  'rdv.enregistrerReponse': {
    ecrit: true,
    schema: {
      numero: { type: 'texte', max: 30, min: 5 },
      texte: { type: 'html', max: 1000 }, // « html » = texte long qui garde ses retours à la ligne (un SMS reçu peut en contenir) ; jamais exécuté ni affiché comme page
      recuLe: { type: 'date' },
      idFournisseur: { type: 'idsur' },
    },
    async executer(ctx, d) {
      const { base, donnees } = ctx;
      if (!d.numero || d.texte === undefined || !d.idFournisseur) throw new ErreurAction('requete_invalide', '« numero », « texte » et « idFournisseur » sont obligatoires.', 400);
      if (d.idFournisseur.length > 60) throw new ErreurAction('requete_invalide', '« idFournisseur » est trop long (60 caractères au plus).', 400);
      const maintenantMs = instant(ctx.maintenant);
      const tel = R.normaliserTelephone(d.numero);
      const numero = tel.ok ? tel.telephone : d.numero;
      const docId = docIdMessage(`in_${d.idFournisseur}`);
      if (await donnees.lireDoc(chemin(base, T.msg, docId))) return { deja: true, messageId: docId }; // le repère « déjà vu » est TOUJOURS le message `in_<id>`, même pour un numéro ambigu
      const recuLe = d.recuLe ?? new Date(maintenantMs);
      const sms = R.compterSms(d.texte);
      const commun = { sens: 'entrant', numero, texte: d.texte, caracteres: sms.caracteres, segments: sms.segments, typeMessage: 'reponse', idFournisseur: d.idFournisseur, recuLe, etatEnvoi: 'recu', creeLe: new Date(maintenantMs) };
      const stop = R.estDesinscription(d.texte);
      const liste = await rendezVousAttendantUneReponse(ctx);
      const cible = R.rattacherReponse(numero, liste);
      const operations = [];
      let rattache = cible.type;
      const parRdv = new Map(liste.map((x) => [x.rdv.id, x]));
      const creerMessage = (id, extra) => operations.push({ type: 'creer', chemin: chemin(base, T.msg, id), donnees: sansIndefini({ ...commun, ...extra }) });
      const appliquer = ({ rendezVousId, participantId }, { ambigu = false, idMessage }) => {
        const { rdv, participants } = parRdv.get(rendezVousId);
        const participant = participants.find((p) => p.id === participantId);
        const ligne = R.appliquerReponse({ participant, rdv, texte: d.texte, recuLe, idReponse: docId });
        // Numéro ambigu : « non comprise » pour chaque rendez-vous, SAUF pour celui où cette personne a déjà répondu (sa réponse n'est pas effacée par un message dont on ignore le destinataire).
        const dejaRepondu = participant && (participant.etatReponse === 'comprise' || participant.etatReponse === 'saisie');
        if (ambigu && !ligne.historiqueSeulement && !dejaRepondu) { ligne.comprise = false; ligne.patch = { reponse: d.texte, etatReponse: 'incomprise', creneauxOk: [], reponseLe: recuLe, idReponse: docId, ambigu: true }; }
        else if (ambigu && dejaRepondu) { ligne.historiqueSeulement = true; ligne.patch = null; }
        if (stop && !ligne.historiqueSeulement) ligne.patch = { ...ligne.patch, desinscrit: true };
        creerMessage(idMessage, { rendezVousId, participantId, tour: rdv.tour ?? 1, comprise: ligne.comprise === true, desinscription: stop || undefined, historique: ligne.historiqueSeulement || undefined, ambigu: ambigu || undefined });
        if (!ligne.historiqueSeulement) {
          operations.push({ type: 'maj', chemin: chemin(base, T.part, participantId), donnees: sansIndefini(ligne.patch) });
          const apres = participants.map((p) => (p.id === participantId ? { ...p, ...ligne.patch } : p));
          const etatCalcule = R.etatCalcule(rdv, apres);
          if (etatCalcule !== (rdv.etat || 'en_attente')) operations.push({ type: 'maj', chemin: chemin(base, T.rdv, rendezVousId), donnees: { etat: etatCalcule } });
        }
      };
      if (cible.type === 'unique') appliquer(cible, { idMessage: docId });
      else if (cible.type === 'ambigu') {
        // Le repère « déjà vu » (`in_<id>`) est créé en PREMIER, puis une trace par rendez-vous : le même numéro dans plusieurs rendez-vous ouverts n'est jamais deviné.
        creerMessage(docId, { rendezVousId: cible.cibles[0].rendezVousId, comprise: false, ambigu: true, desinscription: stop || undefined, historique: true });
        for (const [i, c] of cible.cibles.entries()) appliquer(c, { ambigu: true, idMessage: docIdMessage(`in_${d.idFournisseur}_${i + 1}`) });
      } else {
        // Aucun rendez-vous OUVERT n'attend ce numéro : s'il est dans UN rendez-vous confirmé (pas encore passé de plus de 2 jours), la réponse est gardée dans son historique et la
        // professionnelle est alertée (« empêchement », STOP…). Sinon : message orphelin (conservé, aucun écran ne l'affiche pour l'instant).
        const confirmes = (await rendezVousPourEnvoi(ctx, maintenantMs)).filter((x) => !R.estOuvert(x.rdv))
          .map(({ rdv, participants }) => ({ rdv, participant: participants.find((p) => R.normaliserTelephone(p.telephone).telephone === numero || p.telephone === numero) })).filter((x) => x.participant);
        if (confirmes.length === 1) {
          const { rdv, participant } = confirmes[0];
          creerMessage(docId, { rendezVousId: rdv.id, participantId: participant.id, tour: rdv.tour ?? 1, comprise: false, apresConfirmation: true, desinscription: stop || undefined });
          operations.push({ type: 'maj', chemin: chemin(base, T.part, participant.id), donnees: sansIndefini({ reponseTardive: d.texte.slice(0, 200), idReponseTardive: docId, reponseTardiveLe: recuLe, desinscrit: stop || undefined }) });
          rattache = 'confirme';
        } else creerMessage(docId, { rendezVousId: '', orphelin: true, comprise: false, desinscription: stop || undefined });
      }
      if (stop) {
        const existants = await donnees.lireDoc(chemin(base, T.param, 'desinscrits'));
        const numeros = [...new Set([...(Array.isArray(existants?.numeros) ? existants.numeros : []), numero])].slice(-2000);
        if (existants) await donnees.majDoc(chemin(base, T.param, 'desinscrits'), { numeros });
        else await donnees.creerSiAbsent(chemin(base, T.param, 'desinscrits'), { numeros });
      }
      // Plus de 20 opérations (un numéro dans beaucoup de rendez-vous) : plusieurs lots, le repère « déjà vu » partant dans le premier ; jamais de coupure silencieuse.
      try {
        for (let i = 0; i < operations.length; i += LOT_MAX) await donnees.ecrireLot(operations.slice(i, i + LOT_MAX));
      } catch (e) {
        if (e?.code === 6 || e?.code === 'already-exists' || e?.code === 'ALREADY_EXISTS') return { deja: true, messageId: docId }; // deux appels en même temps : un seul écrit
        throw e;
      }
      return { deja: false, messageId: docId, rattache, desinscription: stop, comprise: operations.find((o) => o.type === 'creer')?.donnees?.comprise ?? false };
    },
  },
});
