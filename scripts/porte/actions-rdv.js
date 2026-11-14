// Actions de la porte pour le module Rendez-vous : les workflows n8n envoient les SMS (ClickSend) et reçoivent les réponses ; la plateforme décide de TOUT le reste.
//  - rdv.aEnvoyer           : liste les SMS dus maintenant (premiers SMS, relances, alerte de fin, rappel de la veille, confirmation, alertes, SMS écrits à la main), avec le texte EXACT
//                             (déjà normalisé et compté) et le numéro cible. Chaque SMS est RÉSERVÉ 15 minutes (aucun doublon entre « lire » et « confirmer », même si deux workflows tournent) ;
//  - rdv.confirmerEnvoi     : le workflow dit « envoyé » (avec l'identifiant du fournisseur) ou « raté ». Rejouable : un SMS déjà confirmé répond `deja: true` ;
//  - rdv.enregistrerReponse : une réponse reçue (numéro, texte, identifiant du message chez le fournisseur). Rattachée au bon participant, jamais deux fois (idempotente) ;
//                             « STOP » désinscrit le numéro ; un numéro présent dans deux rendez-vous ouverts n'est jamais deviné (la professionnelle tranche).
// Chaque SMS a un identifiant d'échéance DÉTERMINISTE (logique.js, idEcheance) qui sert d'identifiant de document : deux appels simultanés ne peuvent pas créer deux SMS.
// La porte ne parle jamais à ClickSend : n8n envoie le texte reçu tel quel. Le journal de la porte ne reçoit ni numéro, ni texte (ligneDeJournal : liste blanche).
import { ErreurAction } from './actions-veille.js';
import * as R from '../../js/modules/rdv/logique.js';

export const RESERVATION_MS = 15 * 60 * 1000;
export const ESSAIS_MAX = 3;
export const MAX_PAR_APPEL = 40;
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

/** Tous les rendez-vous OUVERTS de l'espace, avec leurs participants. */
async function rendezVousOuverts(ctx) {
  const { base, donnees } = ctx;
  const tous = await donnees.lister(chemin(base, T.rdv), { limite: 500 });
  const ouverts = tous.filter((r) => R.estOuvert(r));
  const liste = [];
  for (const rdv of ouverts) liste.push({ rdv, participants: await donnees.listerPar(chemin(base, T.part), 'rendezVousId', rdv.id, { limite: 50 }) });
  return liste;
}

/** Réserve un SMS : crée son document, ou reprend un SMS dont la réservation est expirée ou qui a échoué (moins de 3 fois). Rend le document à envoyer, ou null s'il n'est pas à envoyer. */
async function reserver(ctx, docId, creation, maintenantMs) {
  const { base, donnees } = ctx;
  const ch = chemin(base, T.msg, docId);
  const reservation = { etatEnvoi: 'reserve', reserveJusqua: new Date(maintenantMs + RESERVATION_MS) };
  if (creation && await donnees.creerSiAbsent(ch, sansIndefini({ ...creation, ...reservation, essais: 0, creeLe: new Date(maintenantMs) }))) return { ...creation, essais: 0 };
  const existant = await donnees.lireDoc(ch);
  if (!existant) return null;
  const libre = existant.etatEnvoi === 'a_envoyer' || existant.etatEnvoi === 'echec' || (existant.etatEnvoi === 'reserve' && enMs(existant.reserveJusqua) <= maintenantMs);
  if (!libre) return null;
  const r = await donnees.majDoc(ch, reservation, { lastUpdateTime: existant.updateTime });
  if (r === false || PRECONDITION(r)) return null; // un autre appel l'a pris entre-temps
  return existant;
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
      for (const { rdv, participants } of await rendezVousOuverts(ctx)) {
        if (aEnvoyer.length >= limite) break;
        const messages = (await ctx.donnees.listerPar(chemin(ctx.base, T.msg), 'rendezVousId', rdv.id, { limite: 1000 })).filter((m) => m.etatEnvoi === 'envoye' && m.sens !== 'entrant');
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
          const numero = R.numeroCible(m.numero, rdv ?? {}, parametres);
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
      if (m.etatEnvoi === 'envoye') return { messageId: d.messageId, statut: 'ok', deja: true };
      if (m.etatEnvoi === 'abandonne') return { messageId: d.messageId, statut: 'echec', deja: true };
      if (d.statut === 'ok') {
        const r = await donnees.majDoc(ch, { etatEnvoi: 'envoye', envoyeLe: new Date(maintenantMs), reserveJusqua: null, ...(d.idFournisseur ? { idFournisseur: d.idFournisseur } : {}) }, { lastUpdateTime: m.updateTime });
        if (PRECONDITION(r)) { const apres = await donnees.lireDoc(ch); if (apres?.etatEnvoi === 'envoye') return { messageId: d.messageId, statut: 'ok', deja: true }; throw new ErreurAction('conflit', 'Le message a changé : réessaie.', 409); }
        // Suites : l'alerte « relances terminées » est notée sur le rendez-vous ; le compteur de relances avance.
        const rdv = m.rendezVousId ? await donnees.lireDoc(chemin(base, T.rdv, m.rendezVousId)) : null;
        if (rdv) {
          const patch = {};
          if (m.sousType === 'fin-relances' && !rdv.relancesTermineesLe) patch.relancesTermineesLe = new Date(maintenantMs);
          const k = /:relance(\d+):/.exec(String(m.echeance))?.[1];
          if (k && Number(k) > (rdv.relancesFaites ?? 0)) patch.relancesFaites = Number(k);
          if (!rdv.envoiDemandeLe && m.typeMessage === 'creneaux') patch.envoiDemandeLe = new Date(maintenantMs);
          if (Object.keys(patch).length) await donnees.majDoc(chemin(base, T.rdv, rdv.id), patch);
        }
        return { messageId: d.messageId, statut: 'ok', deja: false };
      }
      const essais = (m.essais ?? 0) + 1;
      const abandon = essais >= ESSAIS_MAX;
      await donnees.majDoc(ch, { etatEnvoi: abandon ? 'abandonne' : 'echec', essais, reserveJusqua: null, ...(d.message ? { erreur: d.message } : {}) });
      return { messageId: d.messageId, statut: 'echec', essais, abandonne: abandon, deja: false };
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
      if (await donnees.lireDoc(chemin(base, T.msg, docId))) return { deja: true, messageId: docId };
      const recuLe = d.recuLe ?? new Date(maintenantMs);
      const sms = R.compterSms(d.texte);
      const commun = { sens: 'entrant', numero, texte: d.texte, caracteres: sms.caracteres, segments: sms.segments, typeMessage: 'reponse', idFournisseur: d.idFournisseur, recuLe, etatEnvoi: 'recu', creeLe: new Date(maintenantMs) };
      const stop = R.estDesinscription(d.texte);
      const liste = await rendezVousOuverts(ctx);
      const cible = R.rattacherReponse(numero, liste);
      const operations = [];
      let rattache = cible.type;
      const parRdv = new Map(liste.map((x) => [x.rdv.id, x]));
      const appliquer = ({ rendezVousId, participantId }, suffixe = '', ambigu = false) => {
        const { rdv, participants } = parRdv.get(rendezVousId);
        const participant = participants.find((p) => p.id === participantId);
        const ligne = R.appliquerReponse({ participant, rdv, texte: d.texte, recuLe, idReponse: docId });
        if (ambigu && !ligne.historiqueSeulement) { ligne.comprise = false; ligne.patch = { reponse: d.texte, etatReponse: 'incomprise', creneauxOk: [], reponseLe: recuLe, idReponse: docId, ambigu: true }; }
        const idMsg = suffixe ? docIdMessage(`in_${d.idFournisseur}${suffixe}`) : docId;
        operations.push({ type: 'creer', chemin: chemin(base, T.msg, idMsg), donnees: sansIndefini({ ...commun, rendezVousId, participantId, tour: rdv.tour ?? 1, comprise: ligne.comprise === true, desinscription: stop || undefined, historique: ligne.historiqueSeulement || undefined }) });
        if (!ligne.historiqueSeulement) {
          operations.push({ type: 'maj', chemin: chemin(base, T.part, participantId), donnees: sansIndefini(ligne.patch) });
          const apres = participants.map((p) => (p.id === participantId ? { ...p, ...ligne.patch } : p));
          const etatCalcule = R.etatCalcule(rdv, apres);
          if (etatCalcule !== (rdv.etat || 'en_attente')) operations.push({ type: 'maj', chemin: chemin(base, T.rdv, rendezVousId), donnees: { etat: etatCalcule } });
        }
      };
      if (cible.type === 'unique') appliquer(cible);
      else if (cible.type === 'ambigu') {
        // Le même numéro dans plusieurs rendez-vous ouverts : jamais deviné. « Non comprise » pour chacun, la professionnelle tranche.
        for (const [i, c] of cible.cibles.entries()) appliquer(c, `_${i + 1}`, true);
      } else {
        operations.push({ type: 'creer', chemin: chemin(base, T.msg, docId), donnees: sansIndefini({ ...commun, rendezVousId: '', orphelin: true, comprise: false, desinscription: stop || undefined }) });
      }
      if (stop) {
        const existants = await donnees.lireDoc(chemin(base, T.param, 'desinscrits'));
        const numeros = [...new Set([...(Array.isArray(existants?.numeros) ? existants.numeros : []), numero])].slice(-2000);
        if (existants) await donnees.majDoc(chemin(base, T.param, 'desinscrits'), { numeros });
        else await donnees.creerSiAbsent(chemin(base, T.param, 'desinscrits'), { numeros });
      }
      if (operations.length > 20) operations.length = 20;
      try { await donnees.ecrireLot(operations); } catch (e) {
        if (e?.code === 6 || e?.code === 'already-exists' || e?.code === 'ALREADY_EXISTS') return { deja: true, messageId: docId }; // deux appels en même temps : un seul écrit
        throw e;
      }
      return { deja: false, messageId: docId, rattache, desinscription: stop, comprise: operations[0]?.donnees?.comprise ?? false };
    },
  },
});
