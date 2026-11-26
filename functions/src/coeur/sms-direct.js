// Envoi DIRECT des SMS du module Rendez-vous par l'API de ClickSend (décision de Jérôme du 14/11/2026 : plus de n8n pour ce module).
// SEUL fichier du dépôt qui parle à ClickSend (un test le borne : tests/sms-direct.test.js). Même code chez Jérôme et chez les clients.
//
// Ce que fait ce fichier :
//  - lit la connexion de l'espace dans Secret Manager, À L'EXÉCUTION (jamais dans le dépôt, jamais dans une page, jamais dans Firestore) :
//    secret CLICKSEND_RDV chez Jérôme, CLICKSEND_RDV_<client> chez un client, contenu JSON { identifiant, cle, jeton, expediteur? } ;
//  - « tirer » : demande à la porte (actions rdv.aEnvoyer / rdv.confirmerEnvoi, appelées directement dans le serveur, sans réseau) les SMS dus,
//    les envoie un par un à ClickSend, puis confirme chaque envoi. La plateforme décide de tout (qui, quoi, quand) ; ce fichier ne fait qu'envoyer ;
//  - « recevoir » : une réponse par SMS (webhook de ClickSend) est transmise à la porte (rdv.enregistrerReponse). ClickSend ne signe pas ses envois :
//    la seule protection est le `jeton` secret dans l'adresse (comparé en temps constant ; adresse ou jeton faux = même 404, sans rien dire).
//  - « lireSolde » : le solde du compte (GET /v3/account, aucun SMS) pour le bilan des Réglages (cache de 60 s) et, dans les deux tirs PLANIFIÉS seulement (`avecSolde`), pour les alertes « solde bas »
//    (scripts/porte/actions-rdv.js, alerterSoldeBas : seuils, idempotence, état dans les réglages) ; la page de recharge n'est qu'un texte du SMS, jamais appelée ;
//  - n'envoie qu'à https://rest.clicksend.com, ne suit aucune redirection, s'arrête au bout de 15 secondes par SMS, ne journalise ni clé, ni numéro, ni texte.
// Un SMS dont l'envoi est incertain (réseau coupé, réponse illisible) n'est PAS confirmé : sa réservation de 15 minutes expire puis la porte le reprend (3 reprises au plus, puis abandon).
import { createHash, timingSafeEqual } from 'node:crypto';
import { ACTIONS_RDV, alerterSoldeBas } from '../../partage/porte/actions-rdv.js';
import { lienEcranRdv } from './liens.js';
import { lancerAction } from '../../partage/porte/actions-veille.js';

export const HOTE_CLICKSEND = 'rest.clicksend.com';
export const URL_ENVOI = `https://${HOTE_CLICKSEND}/v3/sms/send`;
export const SECRET_CLICKSEND = 'CLICKSEND_RDV';
export const ESPACE_JEROME = 'interne';
export const DELAI_SMS_MS = 15_000;
export const BUDGET_TIR_MS = 45_000; // « tire maintenant » : l'écran attend (le navigateur abandonne à 70 s) ; le filet planifié passe un budget plus long
export const ESSAIS_CONFIRMATION = 3;
export const PAUSE_APRES_PRESENTATION_MS = 10_000; // entre les SMS de présentation (« confiance ») et les autres : le participant lit la présentation avant les créneaux
export const PAUSE_CONFIRMATION_MS = 300; // entre deux essais de confirmation (une panne de la base dure rarement moins)
// Problèmes de COMPTE (jamais la faute d'un SMS) : le tir s'arrête et les SMS sont libérés sans compter d'essai (rien n'est abandonné pour un réglage à corriger). Tout AUTRE refus de ClickSend (numéro refusé, pays fermé,
// statut inconnu, 4xx) est un échec de CE SMS seulement : compté (3 = abandon + alerte à la professionnelle), avec un délai de 10 minutes entre deux essais (côté porte) ; il ne bloque jamais les autres.
export const STATUTS_COMPTE = Object.freeze(['INVALID_SENDER_ID', 'ACCOUNT_NOT_ACTIVATED', 'MISSING_CREDENTIALS', 'INVALID_CREDENTIALS', 'THROTTLED', 'USAGE_LIMIT_EXCEEDED', 'INSUFFICIENT_CREDIT']);
export const STATUTS_PANNE = Object.freeze(['INTERNAL_ERROR', 'SOMETHING_IS_WRONG']); // panne de ClickSend : le SMS est peut-être parti (douteux, jamais compté comme refus)
export const STATUTS_ACCEPTES = Object.freeze(['SUCCESS', 'QUEUED', 'SCHEDULED']); // accepté par ClickSend
export const DUREE_CACHE_MS = 60_000;
export const DELAI_SOLDE_MS = 5_000; // temps réservé à la lecture du solde, dans le budget d'un tir planifié
// Page de recharge du compte ClickSend, écrite dans les alertes de solde bas (valeur de `{lien}`). Un lien AFFICHÉ dans un SMS, jamais appelé : il ne passe dans aucun `fetch` (un test le verrouille).
// Adresse à faire vérifier par Jérôme : elle n'est confirmée ni par la doc du dépôt ni par celle de ClickSend.
export const LIEN_RECHARGE_CLICKSEND = 'https://dashboard.clicksend.com/portal/billing#add-credit';
export const ARRETS_AVEC_SOLDE = Object.freeze(['credit_epuise', 'budget_depasse']); // le solde n'est lu qu'après un tir sans arrêt ou arrêté par le crédit (ou le temps) : tout autre arrêt (clé, compte, service, limitation) dit que ClickSend ne répond pas comme il faut
export const MESSAGE_NON_BRANCHE = 'L’envoi des SMS n’est pas encore branché sur cet espace.';
const MOTIF_ESPACE = /^[a-z0-9][a-z0-9_-]{0,39}$/;
export const MOTIF_JETON = /^[A-Za-z0-9_-]{24,100}$/;
export const MOTIF_EXPEDITEUR = /^(?:[A-Za-z0-9]{1,11}|\+?\d{5,15})$/;
const SANS_CONTROLE = /[\u0000-\u001f\u007f]/;

/** genre : non_branche | indisponible */
export class ErreurSortieSms extends Error {
  constructor(genre, message) {
    super(message);
    this.name = 'ErreurSortieSms';
    this.genre = genre;
  }
}

/** Nom du secret pour un espace : sans suffixe chez Jérôme, « _<client> » chez un client. */
export function nomDuSecret(espace, espaceRacine = ESPACE_JEROME) {
  if (typeof espace !== 'string' || !MOTIF_ESPACE.test(espace)) throw new ErreurSortieSms('non_branche', MESSAGE_NON_BRANCHE);
  return espace === espaceRacine ? SECRET_CLICKSEND : `${SECRET_CLICKSEND}_${espace}`;
}

/**
 * Vérifie une clé auprès de ClickSend AVANT de l'enregistrer (GET /v3/account, aucun SMS, aucun frais). Rend { ok: true } | { ok: false, raison: 'refusee' | 'indisponible' }.
 * Même règles que l'envoi : adresse fixe, aucune redirection, délai borné, rien n'est journalisé.
 */
export async function verifierConnexion({ identifiant, cle, fetchImpl = globalThis.fetch, delaiMs = 10_000 }) {
  const arret = new AbortController();
  const minuteur = setTimeout(() => arret.abort(), delaiMs);
  try {
    const r = await fetchImpl(`https://${HOTE_CLICKSEND}/v3/account`, {
      method: 'GET',
      headers: { Authorization: `Basic ${Buffer.from(`${identifiant}:${cle}`).toString('base64')}` },
      redirect: 'error',
      signal: arret.signal,
    });
    if (r.status === 401 || r.status === 403) return { ok: false, raison: 'refusee' };
    return r.ok ? { ok: true } : { ok: false, raison: 'indisponible' };
  } catch { return { ok: false, raison: 'indisponible' }; } finally { clearTimeout(minuteur); }
}

const EST_EURO = /^(?:EUR|EUROS?|€)$/i;
/** Un montant lu dans la réponse de ClickSend (texte « 4.998000 » ou nombre) ; null si absent ou illisible. */
function lireMontant(v) {
  const n = typeof v === 'number' ? v : (typeof v === 'string' && /^\s*-?\d+(?:\.\d+)?\s*$/.test(v) ? Number(v) : NaN);
  return Number.isFinite(n) && Math.abs(n) < 1e9 ? n : null;
}
/**
 * Lit le solde du compte (GET /v3/account, aucun SMS, aucun frais). Rend { ok, solde: <nombre> | null, devise } ; `ok: false` si ClickSend refuse ou ne répond pas.
 * TOLÉRANT : montant absent ou illisible = solde null (jamais une erreur) ; devise lisible et autre que l'euro = solde null (« indisponible », aucune alerte) ;
 * devise absente ou illisible = on suppose l'euro (décision du 15/11/2026 : mieux vaut alerter que se taire). Mêmes règles que `verifierConnexion` : adresse fixe, aucune redirection, délai borné, rien n'est journalisé, aucun secret dans le résultat.
 */
export async function lireSolde({ identifiant, cle, fetchImpl = globalThis.fetch, delaiMs = 10_000 }) {
  const arret = new AbortController();
  const minuteur = setTimeout(() => arret.abort(), delaiMs);
  try {
    const r = await fetchImpl(`https://${HOTE_CLICKSEND}/v3/account`, {
      method: 'GET',
      headers: { Authorization: `Basic ${Buffer.from(`${identifiant}:${cle}`).toString('base64')}` },
      redirect: 'error',
      signal: arret.signal,
    });
    if (!r.ok) return { ok: false, solde: null, devise: '' };
    let j = null;
    try { j = await r.json(); } catch { /* corps illisible */ }
    const brut = j?.data?._currency;
    const code = typeof brut === 'string' ? brut : (brut && typeof brut === 'object' ? (brut.currency_name_short ?? brut.currency_prefix_d ?? '') : '');
    const devise = typeof code === 'string' ? code.trim().toUpperCase().slice(0, 10) : '';
    const solde = lireMontant(j?.data?.balance);
    return { ok: true, solde: devise && !EST_EURO.test(devise) ? null : solde, devise };
  } catch { return { ok: false, solde: null, devise: '' }; } finally { clearTimeout(minuteur); }
}

/** Le contenu du secret, contrôlé ; sinon null (on ne dit jamais pourquoi, ni ce qu'il contenait). */
export function lireConnexion(texte) {
  let j;
  try { j = JSON.parse(String(texte ?? '')); } catch { return null; }
  if (!j || typeof j !== 'object') return null;
  const { identifiant, cle, jeton, expediteur } = j;
  const ok = (v, max) => typeof v === 'string' && v.trim() && v.length <= max && !SANS_CONTROLE.test(v);
  if (!ok(identifiant, 200) || !ok(cle, 200) || typeof jeton !== 'string' || !MOTIF_JETON.test(jeton)) return null;
  if (expediteur !== undefined && expediteur !== '' && !(typeof expediteur === 'string' && MOTIF_EXPEDITEUR.test(expediteur))) return null;
  return { identifiant: identifiant.trim(), cle: cle.trim(), jeton, ...(expediteur ? { expediteur } : {}) };
}

const empreinte = (t) => createHash('sha256').update(String(t)).digest();
/** Comparaison en temps constant (les deux textes sont d'abord réduits à une empreinte de même longueur). */
export const memeJeton = (a, b) => timingSafeEqual(empreinte(a), empreinte(b));

/** Unix (secondes) ou texte de date -> ISO ; undefined si illisible. */
function enISO(v) {
  const n = Number(v);
  const d = Number.isFinite(n) && String(v).trim() !== '' ? new Date(n < 1e11 ? n * 1000 : n) : new Date(String(v ?? ''));
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

/**
 * Options : `lireSecret(nom)` (promesse du texte, lève si absent) ; `donneesDe(espace)` -> { base, donnees } (accès Firestore de la porte : base '' chez Jérôme,
 * `clients/<client>` chez un client) ; `espaceRacine` : l'espace qui porte le secret sans suffixe (« interne » chez Jérôme, `null` sur la plateforme clients : un client nommé « interne » garde son suffixe) ; `moduleActif(espace)` (vrai par défaut : chez un client, le module « rdv » doit être allumé sur sa fiche) ;
 * `baseLien` : adresse de l'appli (https), ou une fonction qui la rend (calculée à l'appel : le projet n'est connu qu'à l'exécution), pour le lien du rendez-vous dans les alertes ; vide : pas de lien ;
 * `fetchImpl` : `fetch` (ou un faux ClickSend dans les essais).
 */
export function creerSmsDirect({ lireSecret, donneesDe, moduleActif = async () => true, espaceRacine = ESPACE_JEROME, baseLien = '', fetchImpl = globalThis.fetch, maintenant = Date.now, delaiSmsMs = DELAI_SMS_MS, budgetMs = BUDGET_TIR_MS, pauseConfirmationMs = PAUSE_CONFIRMATION_MS, pausePresentationMs = PAUSE_APRES_PRESENTATION_MS, attendre = (ms) => new Promise((fin) => setTimeout(fin, ms)) } = {}) {
  const cache = new Map(); // espace -> { expire, config | null }
  const instant = () => (typeof maintenant === 'function' ? maintenant() : maintenant);

  async function configuration(espace) {
    // Le module est vérifié AVANT de toucher à Secret Manager et sans cache : un nom d'espace inventé (adresse des réponses, appel anonyme) ne coûte jamais un appel au secret ni ne chasse les vrais espaces du cache.
    if (!(await moduleActif(espace))) return null;
    const vu = cache.get(espace);
    if (vu && vu.expire > instant()) return vu.config;
    let config = null;
    try { config = lireConnexion(await lireSecret(nomDuSecret(espace, espaceRacine))); } catch { config = null; }
    if (cache.size > 100) cache.clear();
    cache.set(espace, { expire: instant() + DUREE_CACHE_MS, config });
    return config;
  }

  const contexte = (espace) => { const { base, donnees } = donneesDe(espace); const client = espace === espaceRacine ? '' : espace; return { base, donnees, auteur: 'sms-direct', maintenant: instant, services: {}, lienRdv: (id) => lienEcranRdv({ baseLien: typeof baseLien === 'function' ? baseLien() : baseLien, client }, id) }; }; // `maintenant` : la fonction (l'heure de chaque écriture est celle de l'écriture, pas celle du début du tir)

  /**
   * UN SMS vers ClickSend. Rend :
   *  { statut: 'ok', idFournisseur }      : accepté ;
   *  { statut: 'echec', message }         : refus de CE SMS (mauvais numéro, pays fermé, statut inconnu, 4xx) : compté, repris après 10 minutes, 3 échecs = abandon ;
   *  { statut: 'arret', raison, parti? }  : problème de COMPTE ou de service (clé refusée, crédit épuisé, limitation, expéditeur non enregistré, ClickSend en panne) : on arrête le tir. `parti: true`
   *                                         (500 ou 504, ou INTERNAL_ERROR : la passerelle a peut-être expiré APRÈS avoir accepté) : CE SMS reste réservé et compte comme douteux ; 502 et 503 : rien n'est parti ;
   *  { statut: 'incertain' }              : on ne sait pas si le SMS est parti (réseau coupé, délai dépassé, réponse 200 illisible) : rien n'est confirmé NI libéré, la réservation de 15 minutes
   *                                         expire puis la porte le reprend en comptant un essai (3 au plus, puis abandon).
   */
  async function envoyerUn(config, { numero, texte }) {
    const arret = new AbortController();
    const minuteur = setTimeout(() => arret.abort(), delaiSmsMs);
    let reponse;
    let j = null;
    try {
      reponse = await fetchImpl(URL_ENVOI, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Basic ${Buffer.from(`${config.identifiant}:${config.cle}`).toString('base64')}` },
        body: JSON.stringify({ messages: [{ source: 'chevalier-ia-os', to: numero, body: texte, ...(config.expediteur ? { from: config.expediteur } : {}) }] }),
        redirect: 'error',
        signal: arret.signal,
      });
      try { j = await reponse.json(); } catch { /* corps illisible ou trop lent (le même délai couvre la lecture) */ }
    } catch { return { statut: 'incertain' }; } finally { clearTimeout(minuteur); }
    if (reponse.status === 408) return { statut: 'incertain' };
    if (reponse.status === 401 || reponse.status === 403) return { statut: 'arret', raison: 'cle_refusee' };
    if (reponse.status === 429) return { statut: 'arret', raison: 'trop_de_requetes' };
    if (reponse.status === 502 || reponse.status === 503) return { statut: 'arret', raison: 'clicksend_indisponible' };
    if (reponse.status >= 500) return { statut: 'arret', raison: 'clicksend_indisponible', parti: true };
    const m = j?.data?.messages?.[0];
    const statut = String(m?.status ?? '').toUpperCase();
    if (reponse.ok && STATUTS_ACCEPTES.includes(statut)) return { statut: 'ok', idFournisseur: String(m.message_id ?? '').toLowerCase().replace(/[^a-z0-9_-]/g, '_').slice(0, 60) || undefined };
    if (STATUTS_PANNE.includes(statut)) return { statut: 'arret', raison: 'clicksend_indisponible', parti: true };
    if (statut === 'INSUFFICIENT_CREDIT' || /insufficient/i.test(String(j?.response_code ?? ''))) return { statut: 'arret', raison: 'credit_epuise' };
    if (STATUTS_COMPTE.includes(statut)) return { statut: 'arret', raison: `compte_${statut.toLowerCase()}` };
    if (statut) return { statut: 'echec', message: `ClickSend : ${statut.replace(/[^A-Z0-9_]/g, '').slice(0, 40)}` };
    if (reponse.status >= 400) return { statut: 'echec', message: `ClickSend : refus ${reponse.status}` };
    return { statut: 'incertain' };
  }

  /** `confirmerEnvoi` est rejouable : on l'essaie 3 fois de suite (un SMS parti dont la confirmation se perd serait renvoyé 15 minutes plus tard : double SMS réel). Vrai si confirmé. */
  async function confirmer(ctx, parametres) {
    for (let k = 0; k < ESSAIS_CONFIRMATION; k += 1) {
      try { await lancerAction(ACTIONS_RDV['rdv.confirmerEnvoi'], parametres, ctx); return true; } catch { /* nouvel essai, après une courte pause */ }
      if (pauseConfirmationMs > 0 && k < ESSAIS_CONFIRMATION - 1) await new Promise((fin) => setTimeout(fin, pauseConfirmationMs));
    }
    return false;
  }
  const liberer = async (ctx, messageId) => { try { await lancerAction(ACTIONS_RDV['rdv.libererEnvoi'], { messageId }, ctx); } catch { /* il expirera seul : un essai de plus, jamais un SMS perdu */ } };

  // Solde du compte : cache de 60 s par espace (« Actualiser » et les tirs ne martèlent jamais ClickSend). Rend { branche, solde: <nombre> | null, devise }.
  const cacheSolde = new Map(); // espace -> { expire, promesse }
  async function lireSoldeEspace(espace, { delaiMs = 10_000 } = {}) {
    const config = await configuration(espace);
    if (!config) return { branche: false, solde: null, devise: '' };
    const vu = cacheSolde.get(espace);
    if (vu && vu.expire > instant()) return vu.promesse;
    const entree = { expire: instant() + DUREE_CACHE_MS };
    // Seules les lectures RÉUSSIES restent en cache : « Actualiser » juste après une panne passagère relit vraiment ; des appels en même temps partagent la lecture en cours.
    entree.promesse = lireSolde({ identifiant: config.identifiant, cle: config.cle, fetchImpl, delaiMs }).then((r) => {
      if (!r.ok && cacheSolde.get(espace) === entree) cacheSolde.delete(espace);
      return { branche: true, solde: r.ok ? r.solde : null, devise: r.ok ? r.devise : '' };
    });
    if (cacheSolde.size > 100) cacheSolde.clear();
    cacheSolde.set(espace, entree);
    return entree.promesse;
  }

  /**
   * Envoie tous les SMS dus de l'espace, dans la limite de `budgetMs` (compté depuis le tout début : lecture de la connexion et des SMS dus comprise ; jamais plus que ce que la fonction appelante peut durer).
   * Rend { branche, envoyes, echecs, incertains, restants, arret?, alertesSolde? } (aucune donnée sensible : ni clé, ni numéro, ni texte, ni solde).
   * Chaque SMS est traité SEUL : un refus propre à un SMS (échec compté, repris au plus tôt 10 minutes plus tard par la porte) ne bloque jamais les autres ; seuls les problèmes de COMPTE arrêtent le tir.
   * `avecSolde` : SEULEMENT les deux filets planifiés le passent (jamais « tire maintenant », où l'écran attend) : après les SMS, le solde est lu et, s'il franchit un seuil, l'alerte part dans ce même tir.
   */
  async function tirer(espace, { budgetMs: budget = budgetMs, avecSolde = false } = {}) {
    const debut = instant();
    const bilan = { branche: false, envoyes: 0, echecs: 0, incertains: 0, restants: 0 };
    const config = await configuration(espace);
    if (!config) return bilan;
    bilan.branche = true;
    const ctx = contexte(espace);
    const arreter = async (raison, aLiberer) => {
      bilan.arret = raison;
      bilan.restants += aLiberer.length;
      await Promise.all(aLiberer.map((x) => liberer(ctx, x.messageId)));
    };
    /** Envoie une liste de SMS réservés ; vrai si le tir doit s'arrêter. */
    async function envoyerListe(messages) {
      for (const [i, m] of messages.entries()) {
        // On n'ouvre pas un envoi qui pourrait dépasser le budget (un SMS peut durer `delaiSmsMs`) : les SMS restants sont libérés sans compter d'essai.
        if (instant() - debut + delaiSmsMs > budget) { await arreter('budget_depasse', messages.slice(i)); return true; }
        const r = await envoyerUn(config, m);
        if (r.statut === 'arret') {
          if (r.parti) bilan.incertains += 1; // ce SMS est peut-être parti : il reste réservé (essai compté à l'expiration), jamais libéré
          await arreter(r.raison, messages.slice(r.parti ? i + 1 : i));
          return true;
        }
        if (r.statut === 'incertain') { bilan.incertains += 1; continue; }
        const confirme = await confirmer(ctx, r.statut === 'ok'
          ? { messageId: m.messageId, statut: 'ok', ...(r.idFournisseur ? { idFournisseur: r.idFournisseur } : {}) }
          : { messageId: m.messageId, statut: 'echec', message: r.message });
        if (!confirme) { bilan.incertains += 1; continue; } // parti (ou refusé) mais non noté : la réservation expire, la porte reprendra (comptée comme un essai)
        if (r.statut === 'ok') bilan.envoyes += 1; else bilan.echecs += 1;
      }
      return false;
    }
    const { messages = [] } = await lancerAction(ACTIONS_RDV['rdv.aEnvoyer'], {}, ctx);
    // Les SMS de présentation (« confiance », tous les participants) partent AVANT les autres, puis une pause : le participant reçoit la présentation avant les créneaux. L'ordre reste stable dans chaque groupe.
    const premiers = messages.filter((m) => m.typeMessage === 'confiance');
    const reste = premiers.length ? messages.filter((m) => m.typeMessage !== 'confiance') : [];
    if (!premiers.length) await envoyerListe(messages);
    else if (await envoyerListe(premiers)) await arreter(bilan.arret, reste); // arrêt (compte, budget) : les autres sont libérés, jamais laissés « réservés »
    else if (reste.length) {
      const pause = bilan.envoyes + bilan.incertains > 0 ? pausePresentationMs : 0; // une présentation acceptée OU peut-être partie (incertaine) : on laisse le temps de la lire
      if (instant() - debut + pause + delaiSmsMs > budget) await arreter('budget_depasse', reste); // la pause ne fait jamais dépasser le budget : les autres partent au tir suivant
      else {
        try { if (pause > 0) await attendre(pause); } catch { await arreter('attente_interrompue', reste); return bilan; } // une attente qui plante ne laisse jamais un SMS « réservé »
        await envoyerListe(reste);
      }
    }
    // Solde ClickSend : lu APRÈS les SMS, seulement si le tir n'a pas buté sur un problème de clé ou de service et s'il reste du temps (la lecture dure au plus DELAI_SOLDE_MS). Une panne ici ne fait jamais échouer le tir.
    if (avecSolde && (!bilan.arret || ARRETS_AVEC_SOLDE.includes(bilan.arret)) && instant() - debut + DELAI_SOLDE_MS <= budget) {
      try {
        const s = await lireSoldeEspace(espace, { delaiMs: DELAI_SOLDE_MS }); // le délai de la lecture ne dépasse jamais le temps réservé dans le budget
        const r = typeof s.solde === 'number' ? await alerterSoldeBas(ctx, { solde: s.solde, lien: LIEN_RECHARGE_CLICKSEND }) : null;
        if (r?.crees > 0) {
          bilan.alertesSolde = r.crees; // seulement quand une alerte est créée : le bilan des tirs sans alerte garde sa forme
          // L'alerte part dans CE tir si le tir est allé au bout et s'il reste du temps ; après un arrêt (crédit épuisé…) ou faute de temps, elle part au tir suivant (elle est déjà créée, jamais perdue).
          if (!bilan.arret && instant() - debut + delaiSmsMs <= budget) {
            const { messages: alertes = [] } = await lancerAction(ACTIONS_RDV['rdv.aEnvoyer'], {}, ctx);
            await envoyerListe(alertes);
          }
        }
      } catch { /* le solde est un plus : la prochaine lecture reprendra */ }
    }
    return bilan;
  }

  /**
   * Réponse reçue de ClickSend. `jeton` vient de l'adresse. Rend { statut: 200 | 400 | 404 } ; une panne inattendue LÈVE (la fonction répondra 500 : ClickSend pourra réessayer).
   * Corps accepté : { from, message (ou body), message_id, timestamp } (JSON ou formulaire).
   */
  async function recevoir({ espace, jeton, corps }) {
    const config = await configuration(espace).catch(() => null);
    if (!config || typeof jeton !== 'string' || !memeJeton(jeton, config.jeton)) return { statut: 404 };
    const c = corps && typeof corps === 'object' ? corps : {};
    const numero = String(c.from ?? '').trim();
    const texte = String(c.message ?? c.body ?? c.text ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ''); // les caractères de contrôle (sauf retour à la ligne et tabulation) sont retirés : un SMS étrange n'est pas perdu
    if (numero.length < 5 || numero.length > 30 || !texte.trim()) return { statut: 400 };
    // Identifiant du message : celui de ClickSend, nettoyé (il doit commencer par une lettre ou un chiffre) ; à défaut, une empreinte (numéro + horodatage + texte) : un message sans identifiant n'est pas perdu.
    const brut = String(c.message_id ?? '').toLowerCase().replace(/[^a-z0-9_-]/g, '_').replace(/^[_-]+/, '').slice(0, 58);
    const id = brut ? `m${brut}` : `h${createHash('sha256').update(`${numero}|${c.timestamp ?? ''}|${texte}`).digest('hex').slice(0, 40)}`;
    let recuLe = enISO(c.timestamp);
    if (recuLe && (Date.parse(recuLe) < Date.UTC(2000, 0, 1) || Date.parse(recuLe) > instant() + 86_400_000)) recuLe = undefined; // date absurde : on laisse la porte prendre l'heure d'arrivée
    try {
      await lancerAction(ACTIONS_RDV['rdv.enregistrerReponse'], { numero, texte: texte.slice(0, 1000), idFournisseur: id, ...(recuLe ? { recuLe } : {}) }, contexte(espace));
    } catch (e) {
      if (e?.name === 'ErreurValidation' || e?.name === 'ErreurAction') return { statut: 400 }; // message inutilisable : inutile que ClickSend le renvoie
      throw e;
    }
    return { statut: 200 };
  }

  return {
    tirer,
    recevoir,
    /** Vrai si la connexion de l'espace existe et est utilisable (et, chez un client, si le module est allumé). Ne rend jamais la clé. */
    async brancheRdv(espace) { return (await configuration(espace)) !== null; },
    /** Solde du compte ClickSend de l'espace : { branche, solde: <nombre> | null, devise }. Cache de 60 s ; ne rend jamais la clé. Réservé aux appelants que la fonction d'appel a contrôlés (jamais le tir « maintenant »). */
    lireSolde: lireSoldeEspace,
    /** L'écran demande « tire maintenant » ; le tir passe par `tirer` (budget court) et le bilan remonte jusqu'à l'écran. */
    async tirerRdv(espace) {
      try { return await tirer(espace); } catch { throw new ErreurSortieSms('indisponible', 'L’envoi n’a pas abouti.'); }
    },
  };
}

/**
 * Le traitement HTTP de l'adresse des réponses, le même chez Jérôme et chez les clients. Chemin attendu : « /<jeton> » chez Jérôme (`espaceFixe` = 'interne'),
 * « /<client>/<jeton> » sur la plateforme. Tout ce qui n'est pas un POST à la bonne forme de chemin, et tout jeton faux : 404 identique, sans corps.
 * Une panne inattendue répond 500 (ClickSend pourra réessayer) et ne journalise que le nom de l'erreur.
 */
export function creerGestionnaireReponses({ sms, espaceFixe = null, journal = () => {} }) {
  return async function gestionnaire(req, res) {
    const morceaux = String(req.path ?? '').split('/').filter(Boolean);
    if (req.method !== 'POST' || morceaux.length !== (espaceFixe ? 1 : 2)) { res.status(404).end(); return; }
    const [espace, jeton] = espaceFixe ? [espaceFixe, morceaux[0]] : morceaux;
    try {
      const { statut } = await sms.recevoir({ espace, jeton, corps: req.body });
      res.status(statut).end();
    } catch (e) {
      journal({ action: 'reponse', statut: 'erreur', code: String(e?.name ?? 'inconnue').slice(0, 30) });
      res.status(500).end();
    }
  };
}
