// Actions métier : LE SEUL fichier de js/ qui appelle n8n (verrou : tests/supabase-acces.test.js).
// Chaque appel utilise un TICKET NEUF à usage unique (60 s) demandé à la base, envoyé en « Authorization: Bearer <ticket> » : jamais le badge Firebase, jamais un ticket réutilisé.
// Tout vient de l'extérieur : lireConnexion() (adresses des webhooks), demanderTicket(usage), fetchImpl (faux réseau des tests).
import { adresseHttps } from './supabase.js';

/** Erreur renvoyée par le serveur ; `code` vaut par exemple « doublon_deja_acceptee » ou « chantier_termine ». */
export class ErreurAction extends Error {
  constructor(message, code = null) { super(message); this.name = 'ErreurAction'; this.code = code; }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Facture déjà connue d'un refus « doublon » (409) : son identifiant et sa date d'ajout, seulement s'ils ont la bonne forme, et `dejaConnue` (doublon reconnu par fournisseur et numéro, pas par empreinte). Jamais un autre champ du corps. */
export function factureDejaConnue(corps) {
  const c = corps && typeof corps === 'object' ? corps : {};
  const factureId = typeof c.facture_id === 'string' && UUID.test(c.facture_id) ? c.facture_id : null;
  const creeLe = typeof c.cree_le === 'string' && !Number.isNaN(Date.parse(c.cree_le)) ? c.cree_le : null;
  return { factureId, creeLe, dejaConnue: c.deja_connue === true };
}

export const USAGES = ['validation', 'actions', 'suggestions', 'ajoutFacture'];

export const MESSAGE_REFUS_SERVEUR = 'Le serveur a refusé l’opération. Réessaie, ou préviens le support.';
export const MESSAGE_REPONSE_INATTENDUE = 'Réponse inattendue du serveur : l’opération n’est peut-être pas faite. Réessaie, ou préviens le support.';

/** Message en français simple pour une réponse d'erreur du serveur : le champ `erreur` est affiché tel quel pour une erreur 4xx (409 compris). */
export function messageServeur(statut, corps) {
  const c = corps && typeof corps === 'object' ? corps : {};
  if (c.code === 'deja_traitee') return 'Cette facture a déjà été traitée.';
  if (typeof c.erreur === 'string' && c.erreur && statut < 500) return c.erreur;
  return 'Une erreur est survenue, réessaie dans un instant.';
}

/** Refus métier après lequel on relit les listes de chantiers et d'agences (un autre utilisateur a pu fermer un chantier ou désactiver une agence). */
export const CODES_A_RECHARGER = new Set([
  'chantier_obligatoire', 'chantier_introuvable', 'chantier_termine', 'chantier_suspendu', 'chantier_archive',
  'agence_obligatoire', 'agence_introuvable', 'agence_inactive',
]);

/** @param {{ lireConnexion: () => object, demanderTicket: (usage: string) => Promise<string>, fetchImpl?: Function, modeEmulateurs?: boolean }} dep */
export function creerActions({ lireConnexion, demanderTicket, fetchImpl, modeEmulateurs = false }) {
  if (typeof lireConnexion !== 'function' || typeof demanderTicket !== 'function') throw new Error('creerActions : lireConnexion et demanderTicket sont obligatoires.');
  const reseau = fetchImpl || (modeEmulateurs ? null : (...a) => globalThis.fetch(...a));

  function adresse(usage) {
    if (!USAGES.includes(usage)) throw new ErreurAction('Usage de webhook inconnu.', 'usage');
    const c = lireConnexion(); // lève « Connexion à la base non réglée »
    const brute = c && c.webhooks && c.webhooks[usage];
    if (!brute) throw new ErreurAction(`L’adresse du service « ${usage} » n’est pas réglée (Réglages > Connexion à la base).`, 'config');
    try { return adresseHttps(brute, `L’adresse du service « ${usage} »`).toString(); } catch (e) { throw new ErreurAction(e.message, 'config'); }
  }

  /** Ticket neuf ; toute erreur de la demande (plafond par minute, reconnexion…) sort en ErreurAction, avec son code et son détail. */
  async function ticketNeuf(usage) {
    try { return await demanderTicket(usage); } catch (e) {
      if (e instanceof ErreurAction) throw e;
      const a = new ErreurAction(e && e.message ? e.message : 'Ticket impossible à obtenir, réessaie.', (e && e.code) || 'ticket');
      a.detail = (e && e.detail) || null;
      throw a;
    }
  }

  async function envoyer(url, ticket, corps) {
    try {
      // Un FormData (envoi d'un fichier) part tel quel et SANS Content-Type : le navigateur pose lui-même le type avec sa frontière. Tout autre corps part en JSON.
      const multipart = typeof FormData !== 'undefined' && corps instanceof FormData;
      const entetes = multipart ? { Authorization: `Bearer ${ticket}` } : { 'Content-Type': 'application/json', Authorization: `Bearer ${ticket}` };
      return await reseau(url, { method: 'POST', redirect: 'error', headers: entetes, body: multipart ? corps : JSON.stringify(corps) });
    } catch { throw new ErreurAction('Connexion impossible, réessaie.', 'reseau'); }
  }

  /** Envoie un corps JSON au webhook de cet usage. Lève ErreurAction (message français) si le serveur refuse. */
  async function appelerWebhook(usage, corpsEnvoye) {
    const url = adresse(usage);
    if (!reseau) throw new ErreurAction('Mode test : aucun appel réseau réel.', 'mode_test');
    let rep = await envoyer(url, await ticketNeuf(usage), corpsEnvoye);
    // Un 401 : le ticket a pu expirer ou être déjà pris. UN seul nouvel essai avec un ticket NEUF, puis l'erreur.
    if (rep.status === 401) rep = await envoyer(url, await ticketNeuf(usage), corpsEnvoye);
    const corps = await rep.json().catch(() => ({}));
    if (rep.status === 401) throw new ErreurAction(MESSAGE_REFUS_SERVEUR, 'refus_serveur');
    if (!rep.ok) {
      const err = new ErreurAction(messageServeur(rep.status, corps), (corps && corps.code) ?? null);
      // Doublon (409) : l'erreur porte la facture déjà connue (identifiant et date d'ajout), pour que l'écran propose de l'ouvrir.
      if (err.code === 'doublon') Object.assign(err, factureDejaConnue(corps));
      throw err;
    }
    // Un 200 sans « ok: true » n'est pas un succès (mauvaise adresse de webhook, workflow arrêté ou ancien) : on ne le prend jamais pour tel.
    if (!corps || corps.ok !== true) throw new ErreurAction(MESSAGE_REPONSE_INATTENDUE, 'reponse_inattendue');
    return corps;
  }

  /** Webhook « actions métier » : `action` + ses champs (archiver, créer un chantier, rapprocher un article…). */
  const appelerActionMetier = (action, champs = {}) => appelerWebhook('actions', { ...champs, action });
  /** Décision sur une facture : le corps est fabriqué par le module (jamais l'identité de la personne : elle vient du ticket). */
  const validerFacture = (corps) => appelerWebhook('validation', corps);
  const demanderSuggestions = () => appelerWebhook('suggestions', {});
  const ajouterFacture = (corps) => appelerWebhook('ajoutFacture', corps);

  return { appelerWebhook, appelerActionMetier, validerFacture, demanderSuggestions, ajouterFacture };
}

