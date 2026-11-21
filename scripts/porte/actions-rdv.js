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
export const REESSAI_APRES_ECHEC_MS = 10 * 60_000; // après un échec, le SMS n'est pas redemandé avant 10 minutes : trois clics rapides ne brûlent jamais les trois essais (3 échecs = au moins 20 minutes)
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
  const enAttenteDeReessai = existant.etatEnvoi === 'echec' && enMs(existant.reessaiApres) > maintenantMs; // échec récent : pas avant le délai (un clic répété ne brûle pas les essais)
  const libre = existant.etatEnvoi === 'a_envoyer' || (existant.etatEnvoi === 'echec' && !enAttenteDeReessai) || expiree;
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

// ───────────────────────────── Alerte de solde ClickSend bas (module Rendez-vous, 15/11/2026) ─────────────────────────────

/** Une alerte de solde : message d'alerte sans rendez-vous. Écrit seulement par `alerterSoldeBas` (jamais par l'écran : la porte HTTP n'expose pas cette fonction). */
const estAlerteSoldeBas = (m) => m?.typeMessage === 'alerte' && m?.sousType === 'solde-bas' && !m?.rendezVousId && typeof m?.numero === 'string' && m.numero !== '';
const MOTIF_ID_SOLDE = /^solde_c(\d+)_s\d+_/;
/** Numéro d'alerte ACTIF : même définition que `alerterSoldeBas` (un numéro sans « actif » écrit compte comme actif). */
const numerosAlerteActifs = (reglages) => (Array.isArray(reglages?.numerosAlerte) ? reglages.numerosAlerte : []).filter((n) => n && n.actif !== false && typeof n.numero === 'string' && n.numero).map((n) => n.numero);
/**
 * Une alerte de solde née de `alerterSoldeBas` (identifiant `solde_c<cycle>_s…` ET échéance identique à l'identifiant) : un document forgé sans ces marques n'est jamais envoyé.
 * Rend { forme: false } (pas une de nos alertes), ou { forme: true, partir, abandonner } : `abandonner` = le numéro n'est plus un numéro d'alerte actif, il a répondu STOP, ou la recharge a ouvert un
 * nouveau cycle (une alerte « solde bas » de l'ancien cycle serait fausse : on ne l'envoie jamais) ; `partir` = on peut l'envoyer maintenant (dans la plage d'envoi).
 */
function jugerAlerteSolde(m, reglages, desinscrits, maintenantMs) {
  const cycle = MOTIF_ID_SOLDE.exec(String(m?.id ?? ''));
  if (!estAlerteSoldeBas(m) || !cycle || m.echeance !== m.id) return { forme: false };
  const courant = Number.isInteger(reglages?.soldeAlerte?.cycle) ? reglages.soldeAlerte.cycle : 0;
  const abandonner = Number(cycle[1]) !== courant || !numerosAlerteActifs(reglages).includes(m.numero) || desinscrits.includes(m.numero);
  const plage = { ...R.PARAMETRES_DEFAUT.plage, ...(reglages?.plage || {}) };
  return { forme: true, abandonner, partir: !abandonner && R.prochaineOuverture(maintenantMs, plage) === maintenantMs };
}

/**
 * Le solde ClickSend vient d'être lu (`solde`, en euros) : crée au plus UN SMS d'alerte par numéro d'alerte actif et par franchissement de seuil. Appelée seulement par coeur/sms-direct.js (tir planifié) :
 * volontairement HORS de ACTIONS_RDV, donc hors de la porte HTTP (un porteur de clé ne peut pas déclencher d'alerte avec un solde de son choix).
 * L'état (réglages > `soldeAlerte` : { cycle, seuils, partis? } ; `partis` = les seuils gardés par une recharge partielle dont un SMS est réellement parti, effacé à la recharge complète) garde les seuils déjà alertés dans le cycle courant :
 *  - plusieurs seuils franchis d'un coup = UN SMS (le plus bas) et tous marqués ; un seuil déjà alerté ne repart pas tant que le solde n'est pas remonté ;
 *  - solde remonté au-dessus du seuil le plus haut (recharge) = état remis à zéro, nouveau cycle ; recharge PARTIELLE (le solde reste sous le seuil le plus haut) = les seuils que le solde ne franchit plus sont oubliés (nouveau cycle), les autres gardent leur alerte ; solde illisible = rien ; solde à 0 ou négatif = alerte ;
 *  - aucun numéro d'alerte actif = rien n'est créé NI marqué (l'alerte partira quand un numéro sera actif) ; réglages absents = rien (pas de numéro non plus) ;
 *  - les seuils modifiés après une alerte ne changent pas l'état : il garde les valeurs alertées ;
 *  - verrou : l'identifiant du message (`solde_c<cycle>_s<seuil en centimes>_<numéro>`, créé seulement s'il n'existe pas) ; l'état n'est écrit que s'il CHANGE.
 * Rend { statut: 'aucune' | 'alerte' | 'recharge', crees } (`crees` : messages réellement créés ; ils partent par rdv.aEnvoyer, comme les autres).
 */
export async function alerterSoldeBas(ctx, { solde, lien = '' } = {}) {
  const { base, donnees } = ctx;
  if (typeof solde !== 'number' || !Number.isFinite(solde)) return { statut: 'aucune', crees: 0 };
  const maintenantMs = instant(ctx.maintenant);
  const chReglages = chemin(base, T.param, 'reglages');
  let creesTotal = 0; // cumul des essais éventuels (3 au plus) : un message créé au premier essai part quand même
  const fin = (statut) => ({ statut: creesTotal ? 'alerte' : statut, crees: creesTotal });
  for (let essai = 0; essai < 3; essai += 1) {
    const reglages = await donnees.lireDoc(chReglages);
    if (!reglages) return fin('aucune');
    const seuils = R.seuilsSoldeDe(reglages);
    const etat = reglages.soldeAlerte && typeof reglages.soldeAlerte === 'object' ? reglages.soldeAlerte : {};
    const cycle = Number.isInteger(etat.cycle) && etat.cycle >= 0 ? etat.cycle : 0;
    const alertesEtat = Array.isArray(etat.seuils) ? etat.seuils.filter((n) => typeof n === 'number' && Number.isFinite(n)) : [];
    // Recharge partielle : un seuil déjà alerté que le solde ne franchit plus (solde >= seuil) est oublié, il pourra alerter à nouveau si le solde rebaisse. Un seuil encore franchi garde son alerte (pas de doublon).
    const dejaAlertes = alertesEtat.filter((d) => solde < d);
    const remonte = dejaAlertes.length < alertesEtat.length;
    const partisEtatCourant = Array.isArray(etat.partis) ? etat.partis.filter((n) => typeof n === 'number' && Number.isFinite(n)) : [];
    const franchis = seuils.filter((s) => solde < s);
    const ecrire = async (soldeAlerte) => {
      const r = await donnees.majDoc(chReglages, { soldeAlerte }, { lastUpdateTime: reglages.updateTime });
      return !(r === false || PRECONDITION(r)); // un autre appel a écrit entre-temps : on relit (3 essais au plus : si le 3e écrit seulement le nouveau cycle, le SMS est créé au tir suivant) ; les messages sont idempotents
    };
    // Un seuil oublié ouvre un nouveau cycle : l'état est écrit AVANT de créer le moindre message (un `rdv.aEnvoyer` en même temps ne voit alors jamais une alerte neuve d'un cycle non enregistré), puis relu.
    // Les anciens seuils ne sont gardés (« déjà alertés ») que si une alerte de l'ancien cycle est réellement PARTIE ; sinon l'ancienne alerte, jamais envoyée, serait abandonnée et rien ne repartirait : tout est oublié et le passage suivant crée UNE alerte au solde courant.
    if (remonte) {
      const numerosCycle = (Array.isArray(reglages.numerosAlerte) ? reglages.numerosAlerte : []).filter((n) => n && typeof n.numero === 'string' && n.numero);
      // Un seuil gardé doit être COUVERT par un SMS réellement parti : listé dans `etat.partis`, ou un message du cycle courant « envoye » (ou « reserve » : envoi en cours, compté parti pour éviter un doublon)
      // dont le seuil est inférieur ou égal (un SMS « seuil 5 » couvre aussi 10). Un ancien état sans `partis` retombe sur la lecture des messages.
      const partisEtat = Array.isArray(etat.partis) ? etat.partis.filter((n) => typeof n === 'number' && Number.isFinite(n)) : [];
      const partis = [];
      for (const d of dejaAlertes) {
        let couvert = partisEtat.some((x) => Math.abs(x - d) < 0.005);
        for (const sm of alertesEtat.filter((x) => x <= d + 0.005)) for (const n of numerosCycle) {
          if (couvert) break;
          couvert = ['envoye', 'reserve'].includes((await donnees.lireDoc(chemin(base, T.msg, docIdMessage(`solde_c${cycle}_s${Math.round(sm * 100)}_${n.id ?? n.numero}`))))?.etatEnvoi);
        }
        if (couvert) partis.push(d);
      }
      const ecrit = await ecrire(partis.length ? { cycle: cycle + 1, seuils: partis, partis } : { cycle: cycle + 1, seuils: [] });
      if (ecrit && !franchis.length) return fin('recharge');
      if (ecrit && !franchis.some((s) => !partis.some((d) => Math.abs(d - s) < 0.005))) return fin('recharge'); // remontée partielle sans nouveau franchissement : aucun SMS
      continue; // relecture : le cycle enregistré est celui des nouveaux messages
    }
    if (!franchis.length) return fin('aucune');
    const nouveaux = franchis.filter((s) => !dejaAlertes.some((d) => Math.abs(d - s) < 0.005));
    if (!nouveaux.length) return fin('aucune');
    const numeros = (Array.isArray(reglages.numerosAlerte) ? reglages.numerosAlerte : []).filter((n) => n && n.actif !== false && typeof n.numero === 'string' && n.numero);
    if (!numeros.length) return fin('aucune');
    const seuil = Math.min(...nouveaux); // un seul SMS : le plus bas franchi
    const sms = R.texteAlerte('solde-bas', { solde, seuil, lien }, reglages);
    let marquer = false;
    for (const n of numeros) {
      const id = docIdMessage(`solde_c${cycle}_s${Math.round(seuil * 100)}_${n.id ?? n.numero}`);
      const cree = await donnees.creerSiAbsent(chemin(base, T.msg, id), sansIndefini({
        rendezVousId: '', participantId: '', sens: 'sortant', numero: n.numero, texte: sms.texte, caracteres: sms.caracteres, segments: sms.segments,
        typeMessage: 'alerte', sousType: 'solde-bas', echeance: id, etatEnvoi: 'a_envoyer', essais: 0, creeLe: new Date(maintenantMs),
      }));
      if (cree) { creesTotal += 1; marquer = true; } else if (['a_envoyer', 'reserve', 'echec', 'envoye'].includes((await donnees.lireDoc(chemin(base, T.msg, id)))?.etatEnvoi)) marquer = true; // état perdu : seuil déjà alerté (message en attente ou parti), on le re-marque ; un message abandonné ne marque rien
    }
    if (!marquer) return fin('aucune'); // aucun message créé ni trouvé en attente : rien n'est marqué (l'alerte ne devient jamais muette)
    const tous = [...dejaAlertes, ...franchis.filter((s) => !dejaAlertes.some((d) => Math.abs(d - s) < 0.005))];
    if (await ecrire(partisEtatCourant.length ? { cycle, seuils: tous, partis: partisEtatCourant } : { cycle, seuils: tous })) return { statut: 'alerte', crees: creesTotal };
  }
  return fin('aucune');
}

/**
 * Passe un SMS encore EN ATTENTE à un nouvel état (« bloque », « abandonne ») sans jamais écraser un envoi en cours ou fait. `m` vient d'une LISTE (le vrai adaptateur n'y met pas `updateTime`) :
 * on relit le message juste avant d'écrire et on écrit avec CET `updateTime` ; il doit être « a_envoyer », « echec » ou « reserve » périmé (envoi planté entre réservation et confirmation).
 * Rend vrai si l'écriture a eu lieu.
 */
async function figerSiEnAttente(ctx, m, patch, maintenantMs) {
  const ch = chemin(ctx.base, T.msg, m.id);
  const cur = await ctx.donnees.lireDoc(ch);
  if (!cur) return false;
  const enAttente = cur.etatEnvoi === 'a_envoyer' || cur.etatEnvoi === 'echec' || (cur.etatEnvoi === 'reserve' && enMs(cur.reserveJusqua) <= maintenantMs);
  if (!enAttente) return false;
  const r = await ctx.donnees.majDoc(ch, patch, { lastUpdateTime: cur.updateTime });
  return !(r === false || PRECONDITION(r));
}

/**
 * Trace des SMS que « STOP » a empêchés de partir. `smsDus` ne dit pas ce qu'il saute : on le rappelle sans liste de désinscrits, et les SMS dus en plus pour une personne dont le numéro est dans la liste
 * sont les bloqués. Chacun laisse UN message d'état `stop_<échéance>` (créé une seule fois : le tir tourne toutes les 15 minutes) : `etatEnvoi: 'bloque'`, SANS `echeance` (le calendrier ne le voit
 * pas : le vrai SMS peut repartir après « Réautoriser »), SANS texte ni numéro. Il n'entre jamais dans les SMS à envoyer ni dans leur nombre.
 */
async function tracerBloques(ctx, { rdv, participants, desinscrits, dus, dusSansStop, existants, maintenantMs }) {
  const dejaDus = new Set(dus.map((d) => d.idEcheance));
  const parId = new Map(participants.map((p) => [p.id, p]));
  const ids = new Set(existants.map((m) => m.id));
  for (const du of dusSansStop) {
    if (dejaDus.has(du.idEcheance) || !du.participantId || du.typeMessage === 'alerte') continue;
    const p = parId.get(du.participantId);
    if (!p || !desinscrits.includes(p.telephone)) continue;
    const docId = docIdMessage(`stop_${du.idEcheance}`);
    if (ids.has(docId)) continue;
    await ctx.donnees.creerSiAbsent(chemin(ctx.base, T.msg, docId), sansIndefini({
      rendezVousId: rdv.id, participantId: p.id, tour: du.tour, sens: 'sortant', typeMessage: du.typeMessage, sousType: du.sousType || undefined, etatEnvoi: 'bloque', creeLe: new Date(maintenantMs),
    }));
  }
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
        const tous = await ctx.donnees.listerPar(chemin(ctx.base, T.msg), 'rendezVousId', rdv.id, { limite: 1000 });
        const messages = tous.filter((m) => (m.etatEnvoi === 'envoye' || m.etatEnvoi === 'abandonne') && m.sens !== 'entrant');
        const entrees = { rdv, participants, parametres, messages, maintenant: maintenantMs, lien: ctx.lienRdv?.(rdv.id) ?? '' }; // `lienRdv` : l'adresse du rendez-vous, construite par le serveur (jamais de secret dedans)
        const dus = R.smsDus({ ...entrees, desinscrits });
        if (desinscrits.length) await tracerBloques(ctx, { rdv, participants, desinscrits, dus, dusSansStop: R.smsDus({ ...entrees, desinscrits: [] }), existants: tous, maintenantMs });
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
          if (m.sens === 'entrant') continue;
          // Alerte de solde (aucun rendez-vous), créée par `alerterSoldeBas` : part vers le numéro d'alerte écrit dans le message (jamais détourné vers le numéro de test), seulement dans la plage d'envoi.
          const alerte = m.manuel === true ? { forme: false } : jugerAlerteSolde(m, parametres, desinscrits, maintenantMs);
          if (alerte.forme && alerte.abandonner) {
            if (m.etatEnvoi !== 'reserve') await figerSiEnAttente(ctx, m, { etatEnvoi: 'abandonne', reserveJusqua: null, envoyeLe: new Date(maintenantMs), erreur: 'Alerte de solde abandonnée (recharge, numéro retiré ou STOP)' }, maintenantMs);
            continue;
          }
          if (alerte.forme && !alerte.partir) continue; // hors plage d'envoi : elle attend l'ouverture
          const soldeBas = alerte.forme;
          if (m.manuel !== true && !soldeBas) continue;
          const rdv = m.rendezVousId ? await ctx.donnees.lireDoc(chemin(ctx.base, T.rdv, m.rendezVousId)) : null;
          if (!rdv && !soldeBas) continue; // rendez-vous introuvable : on n'envoie rien (jamais un SMS « test » vers un vrai numéro)
          const numero = soldeBas ? m.numero : R.numeroCible(m.numero, { test: rdv.test === true || m.test === true }, parametres);
          if (!numero) continue;
          if (desinscrits.includes(m.numero)) {
            // SMS à la main (ou renvoi) encore en attente alors que le numéro a répondu STOP : il passe « bloque » (jamais envoyé, même après « Réautoriser »). Un SMS « reserve » encore valide (envoi en cours) n'est pas touché ;
            // un « reserve » périmé (plantage) est bloqué aussi ; un message devenu « envoye » entre la liste et l'écriture reste « envoye » (figerSiEnAttente relit).
            if (m.manuel === true) await figerSiEnAttente(ctx, m, { etatEnvoi: 'bloque', reserveJusqua: null, bloqueLe: new Date(maintenantMs) }, maintenantMs);
            continue;
          }
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
      if (m.etatEnvoi === 'bloque' && d.statut !== 'ok') return { messageId: d.messageId, statut: 'echec', deja: true }; // un SMS bloqué (STOP) ne redevient jamais « echec » par un échec rejoué
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
      await donnees.majDoc(ch, { etatEnvoi: abandon ? 'abandonne' : 'echec', essais, reserveJusqua: null, ...(abandon ? { envoyeLe: new Date(maintenantMs) } : { reessaiApres: new Date(maintenantMs + REESSAI_APRES_ECHEC_MS) }), ...(d.message ? { erreur: d.message } : {}) });
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
