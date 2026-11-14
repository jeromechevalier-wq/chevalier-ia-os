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
//  - n'envoie qu'à https://rest.clicksend.com, ne suit aucune redirection, s'arrête au bout de 15 secondes par SMS, ne journalise ni clé, ni numéro, ni texte.
// Un SMS dont l'envoi est incertain (réseau coupé, réponse illisible) n'est PAS confirmé : sa réservation de 15 minutes expire puis la porte le reprend (3 reprises au plus, puis abandon).
import { createHash, timingSafeEqual } from 'node:crypto';
import { ACTIONS_RDV } from '../../partage/porte/actions-rdv.js';
import { lancerAction } from '../../partage/porte/actions-veille.js';

export const HOTE_CLICKSEND = 'rest.clicksend.com';
export const URL_ENVOI = `https://${HOTE_CLICKSEND}/v3/sms/send`;
export const SECRET_CLICKSEND = 'CLICKSEND_RDV';
export const ESPACE_JEROME = 'interne';
export const DELAI_SMS_MS = 15_000;
export const BUDGET_TIR_MS = 120_000;
export const DUREE_CACHE_MS = 60_000;
export const MESSAGE_NON_BRANCHE = 'L’envoi des SMS n’est pas encore branché sur cet espace.';
const MOTIF_ESPACE = /^[a-z0-9][a-z0-9_-]{0,39}$/;
const MOTIF_JETON = /^[A-Za-z0-9_-]{24,100}$/;
const MOTIF_EXPEDITEUR = /^(?:[A-Za-z0-9]{1,11}|\+?\d{5,15})$/;
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
 * `fetchImpl` : `fetch` (ou un faux ClickSend dans les essais).
 */
export function creerSmsDirect({ lireSecret, donneesDe, moduleActif = async () => true, espaceRacine = ESPACE_JEROME, fetchImpl = globalThis.fetch, maintenant = Date.now, delaiSmsMs = DELAI_SMS_MS, budgetMs = BUDGET_TIR_MS } = {}) {
  const cache = new Map(); // espace -> { expire, config | null }
  const instant = () => (typeof maintenant === 'function' ? maintenant() : maintenant);

  async function configuration(espace) {
    const vu = cache.get(espace);
    if (vu && vu.expire > instant()) return vu.config;
    let config = null;
    try { config = lireConnexion(await lireSecret(nomDuSecret(espace, espaceRacine))); } catch { config = null; }
    if (config && !(await moduleActif(espace))) config = null;
    if (cache.size > 100) cache.clear();
    cache.set(espace, { expire: instant() + DUREE_CACHE_MS, config });
    return config;
  }

  const contexte = (espace) => { const { base, donnees } = donneesDe(espace); return { base, donnees, auteur: 'sms-direct', maintenant: instant(), services: {} }; };

  /**
   * UN SMS vers ClickSend. Rend { statut: 'ok', idFournisseur } | { statut: 'echec', message } (refus définitif de ce SMS : mauvais numéro, pays fermé…)
   * | { statut: 'arret', raison } (clé refusée, crédit épuisé : on arrête le tir, rien n'est confirmé, le SMS reste réservé puis sera repris)
   * | { statut: 'incertain' } (réseau, 5xx, réponse illisible : rien n'est confirmé).
   */
  async function envoyerUn(config, { numero, texte }) {
    const arret = new AbortController();
    const minuteur = setTimeout(() => arret.abort(), delaiSmsMs);
    let reponse;
    try {
      reponse = await fetchImpl(URL_ENVOI, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Basic ${Buffer.from(`${config.identifiant}:${config.cle}`).toString('base64')}` },
        body: JSON.stringify({ messages: [{ source: 'chevalier-ia-os', to: numero, body: texte, ...(config.expediteur ? { from: config.expediteur } : {}) }] }),
        redirect: 'error',
        signal: arret.signal,
      });
    } catch { return { statut: 'incertain' }; } finally { clearTimeout(minuteur); }
    if (reponse.status === 401 || reponse.status === 403) return { statut: 'arret', raison: 'cle_refusee' };
    if (reponse.status === 429 || reponse.status >= 500) return { statut: 'incertain' };
    let j = null;
    try { j = await reponse.json(); } catch { /* corps illisible */ }
    const m = j?.data?.messages?.[0];
    const statut = String(m?.status ?? '').toUpperCase();
    if (reponse.ok && statut === 'SUCCESS') return { statut: 'ok', idFournisseur: String(m.message_id ?? '').toLowerCase().replace(/[^a-z0-9_-]/g, '_').slice(0, 60) || undefined };
    if (statut === 'INSUFFICIENT_CREDIT' || /insufficient/i.test(String(j?.response_code ?? ''))) return { statut: 'arret', raison: 'credit_epuise' };
    if (statut) return { statut: 'echec', message: `ClickSend : ${statut}`.slice(0, 200) };
    if (reponse.status >= 400 && reponse.status < 500) return { statut: 'echec', message: `ClickSend : refus ${reponse.status}` };
    return { statut: 'incertain' };
  }

  /** Envoie tous les SMS dus de l'espace. Rend { branche, envoyes, echecs, incertains, restants, arret? }. */
  async function tirer(espace) {
    const config = await configuration(espace);
    if (!config) return { branche: false, envoyes: 0, echecs: 0, incertains: 0, restants: 0 };
    const ctx = contexte(espace);
    const { messages = [] } = await lancerAction(ACTIONS_RDV['rdv.aEnvoyer'], {}, ctx);
    const debut = instant();
    const bilan = { branche: true, envoyes: 0, echecs: 0, incertains: 0, restants: 0 };
    for (const [i, m] of messages.entries()) {
      if (bilan.arret || instant() - debut > budgetMs) { bilan.restants = messages.length - i; break; }
      const r = await envoyerUn(config, m);
      if (r.statut === 'arret') { bilan.arret = r.raison; bilan.restants = messages.length - i; break; }
      if (r.statut === 'incertain') { bilan.incertains += 1; continue; }
      try {
        await lancerAction(ACTIONS_RDV['rdv.confirmerEnvoi'], r.statut === 'ok'
          ? { messageId: m.messageId, statut: 'ok', ...(r.idFournisseur ? { idFournisseur: r.idFournisseur } : {}) }
          : { messageId: m.messageId, statut: 'echec', message: r.message }, ctx);
      } catch { /* conflit : la porte reprendra ; le SMS est peut-être parti, jamais renvoyé avant la fin de sa réservation */ }
      if (r.statut === 'ok') bilan.envoyes += 1; else bilan.echecs += 1;
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
    const texte = String(c.message ?? c.body ?? c.text ?? '');
    const id = String(c.message_id ?? '').toLowerCase().replace(/[^a-z0-9_-]/g, '_').slice(0, 60);
    if (numero.length < 5 || numero.length > 30 || !texte.trim() || !id) return { statut: 400 };
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
    /** Même interface que l'ancienne sortie : l'écran demande « tire maintenant » ; le tir passe par `tirer`. */
    async tirerRdv(espace) {
      try { await tirer(espace); } catch { throw new ErreurSortieSms('indisponible', 'L’envoi n’a pas abouti.'); }
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
