// Branchement de la couche d'accès à la base (24/11/2026, modules Achats, PR 4) : le SEUL endroit qui relie les réglages (base-reglages*.js), le badge de connexion
// (Firebase Auth) et les deux fichiers qui parlent au réseau (js/os/supabase.js, js/os/actions-metier.js). Ce fichier n'ouvre lui-même aucune connexion réseau
// (verrou : tests/supabase-acces.test.js) et n'écrit aucune adresse : tout vient des réglages saisis dans Réglages > « Connexion à la base ».
//
// Mode émulateurs (tests) : aucun appel réseau réel. Un crochet de test `window.__accesBase` = { fetchImpl?, jeton?, claims? } peut fournir le faux réseau ET un badge simulé
// (mêmes mentions que le vrai : `role` = authenticated, `espace_base` = nom de l'espace). Hors émulateurs, le crochet est ignoré (comme le réglage des émulateurs de js/os/firebase.js).
//
// Qui l'importe : les écrans des modules Achats (état de l'accès, lectures et actions des PR suivantes) et, pour « Tester la connexion », base-reglages-ecran.js (`testerAvec`) seul.
import { auth, MODE_EMULATEURS } from './firebase.js';
import { chargerConnexion } from './base-reglages-donnees.js';
import { lireConnexion, evaluerAcces } from './base-reglages.js';
import { creerClient } from './supabase.js';
import { creerActions } from './actions-metier.js';

const crochet = () => {
  const c = MODE_EMULATEURS ? window.__accesBase : null;
  return c && typeof c === 'object' ? c : null;
};
const reseauSimule = () => {
  const f = crochet()?.fetchImpl;
  return typeof f === 'function' ? f : undefined;
};

/** Badge de la session : { jeton, claims }. `forcer` = true demande un badge neuf au serveur de connexion (après avoir reçu l'accès). Lève une erreur lisible sans session. */
export async function obtenirBadge(forcer = false) {
  const c = crochet();
  if (c) return { jeton: String(c.jeton ?? 'jeton-simule'), claims: { ...(c.claims ?? {}) } };
  const u = auth.currentUser;
  if (!u) throw new Error('Ta session a expiré : reconnecte-toi.');
  const r = await u.getIdTokenResult(Boolean(forcer));
  return { jeton: r.token, claims: r.claims };
}

let chargement = null;
/** Charge les réglages de la connexion (une seule lecture par session ; relancée si elle a échoué). À attendre AVANT tout usage de `clientBase` ou `actionsBase`. */
export function connexionPrete() {
  if (!chargement) chargement = chargerConnexion().catch((e) => { chargement = null; throw e; });
  return chargement;
}

/** Client de la base (lire, appeler, lien de PDF, ticket) : construit à chaque appel, il relit donc toujours les réglages en mémoire. */
export function clientBase() {
  return creerClient({ lireConnexion, obtenirBadge, fetchImpl: reseauSimule(), modeEmulateurs: MODE_EMULATEURS });
}

/** Actions métier (webhooks) : chaque appel prend un ticket neuf à usage unique, jamais le badge. */
export function actionsBase() {
  const client = clientBase();
  return creerActions({ lireConnexion, demanderTicket: (usage) => client.demanderTicket(usage), fetchImpl: reseauSimule(), modeEmulateurs: MODE_EMULATEURS });
}

/**
 * Test de connexion sur les valeurs SAISIES dans le formulaire (pas celles déjà enregistrées) : un client temporaire dont la lecture des réglages rend ces valeurs.
 * Le badge de la session est envoyé à l'adresse saisie : l'écran demande confirmation quand un hôte déjà enregistré change. Lève une erreur lisible en cas d'échec.
 */
export async function testerAvec(connexion) {
  const client = creerClient({ lireConnexion: () => connexion, obtenirBadge, fetchImpl: reseauSimule(), modeEmulateurs: MODE_EMULATEURS });
  await client.tester();
  return { message: 'Ça marche : la base répond et ton accès est bon.' };
}

/** État de l'accès pour l'écran d'un module (`forcer` : bouton « Revérifier » seulement, demande un badge neuf) : 'connecte' | 'non-regle' | 'reconnexion' | 'illisible' (sans appel à la base). */
export function verifierAcces(forcer = false) {
  return evaluerAcces({ charger: connexionPrete, obtenirBadge, forcer });
}
