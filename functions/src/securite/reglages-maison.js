// Réglages de la maison (chantier 0, 25/11/2026) : ce qui NE se déduit PAS du projet Google (comptes, adresse de n8n, projet lié) vit dans UNE fiche Firestore,
// reglages_maison/maison, écrite seulement avec le SDK d'administration (aucun navigateur ne la lit ni ne l'écrit : firestore.rules). Le code ne connaît plus aucun compte.
// Fiche absente, illisible ou mal formée = REFUS partout (jamais d'ouverture par défaut), avec un message clair dans les journaux du serveur.
// Cache de 60 s (comme le cache des jetons, securite/jetons.js) : changer un compte dans la fiche agit en une minute au plus. Un échec n'est jamais gardé en cache.
//
// Champs de la fiche (tous facultatifs ; une liste absente = vide = personne) :
//  - comptes_autorises       : comptes Google du CRM (fonctions appelables de l'écran) ; même liste que compteAutorise() de firestore.rules ;
//  - comptes_jerome_seul     : la Console, la connexion à la base, la saisie de la clé ClickSend, les réglages du Pilotage (jamais le bot) ;
//  - super_admins            : outils MCP réservés (modifier_reglages_devis) ; un compte ne compte que s'il peut aussi se connecter au serveur ;
//  - comptes_oauth_autorises : comptes qui peuvent connecter un assistant (claude.ai, ChatGPT) au MCP de la maison par l'écran de consentement ;
//  - proprietaire_par_defaut : propriétaire des fiches créées par un jeton « cia_… » (sans e-mail) sur le serveur de Jérôme ; vide = aucun ;
//  - n8n_url                 : adresse de base du n8n de la maison (https://hôte, sans chemin) : veille, copie des workflows, contrôle des webhooks ;
//  - projet_plateforme_lie   : projet Google dont le serveur de Jérôme LIT la base (vue administrateur des automatisations) ; vide = aucune lecture.
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

export const COLLECTION_REGLAGES_MAISON = 'reglages_maison';
export const DOCUMENT_MAISON = 'maison';
export const DUREE_CACHE_MS = 60_000;
export const LISTES_COMPTES = Object.freeze(['comptes_autorises', 'comptes_jerome_seul', 'super_admins', 'comptes_oauth_autorises']);
export const TEXTES = Object.freeze(['proprietaire_par_defaut', 'n8n_url', 'projet_plateforme_lie']);

/** La fiche manque ou ne se lit pas : l'appelant REFUSE. */
export class ReglagesMaisonIndisponibles extends Error {
  constructor(message) { super(message); this.name = 'ReglagesMaisonIndisponibles'; }
}

const EMAIL = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
const PROJET = /^[a-z][a-z0-9-]{4,61}[a-z0-9]$/;

/** Vérifie et normalise la fiche (e-mails en minuscules). Lève ReglagesMaisonIndisponibles si un champ a un type inattendu. */
export function validerReglagesMaison(brut) {
  if (brut === null || typeof brut !== 'object' || Array.isArray(brut)) throw new ReglagesMaisonIndisponibles('fiche reglages_maison/maison absente');
  const sortie = {};
  for (const champ of LISTES_COMPTES) {
    const v = brut[champ] ?? [];
    if (!Array.isArray(v) || v.some((e) => typeof e !== 'string' || !EMAIL.test(e.trim()))) throw new ReglagesMaisonIndisponibles(`champ ${champ} mal formé (liste d'adresses e-mail attendue)`);
    sortie[champ] = Object.freeze(v.map((e) => e.trim().toLowerCase()));
  }
  for (const champ of TEXTES) {
    const v = brut[champ] ?? '';
    if (typeof v !== 'string') throw new ReglagesMaisonIndisponibles(`champ ${champ} mal formé (texte attendu)`);
    sortie[champ] = v.trim();
  }
  if (sortie.proprietaire_par_defaut && !EMAIL.test(sortie.proprietaire_par_defaut)) throw new ReglagesMaisonIndisponibles('champ proprietaire_par_defaut mal formé');
  if (sortie.proprietaire_par_defaut) sortie.proprietaire_par_defaut = sortie.proprietaire_par_defaut.toLowerCase();
  if (sortie.n8n_url) {
    let u;
    try { u = new URL(sortie.n8n_url); } catch { throw new ReglagesMaisonIndisponibles('champ n8n_url mal formé'); }
    if (u.protocol !== 'https:' || u.username || u.password || u.port || u.search || u.hash || (u.pathname !== '/' && u.pathname !== '')) throw new ReglagesMaisonIndisponibles('champ n8n_url mal formé (https://hôte attendu, sans chemin)');
    sortie.n8n_url = `https://${u.hostname}`;
  }
  if (sortie.projet_plateforme_lie && !PROJET.test(sortie.projet_plateforme_lie)) throw new ReglagesMaisonIndisponibles('champ projet_plateforme_lie mal formé');
  return Object.freeze(sortie);
}

/** Lecture de la fiche par le SDK d'administration (projet courant). Rend les données, ou null si la fiche n'existe pas. */
export async function lireFicheFirestore() {
  if (!getApps().length) initializeApp();
  const instantane = await getFirestore().collection(COLLECTION_REGLAGES_MAISON).doc(DOCUMENT_MAISON).get();
  return instantane.exists ? instantane.data() : null;
}

const journalParDefaut = (e) => process.stdout.write(`${JSON.stringify({ severity: 'ERROR', message: `Réglages de la maison illisibles (reglages_maison/maison) : accès refusé. ${e.raison}` })}\n`);

/**
 * Lecteur de la fiche avec un cache court. `lireDocument` : async () => données | null. `journal({ raison })` : ligne du serveur en cas d'échec (jamais de valeur de la fiche).
 * Rend `lire()` : async, la fiche validée, ou lève ReglagesMaisonIndisponibles. Seul un succès est gardé en cache.
 */
export function creerLecteurReglagesMaison({ lireDocument = lireFicheFirestore, maintenant = Date.now, dureeMs = DUREE_CACHE_MS, journal = journalParDefaut } = {}) {
  let cache = null;
  return async function lire() {
    const t = maintenant();
    if (cache && cache.expire > t) return cache.valeur;
    try {
      const valeur = validerReglagesMaison(await lireDocument());
      cache = { valeur, expire: t + dureeMs };
      return valeur;
    } catch (e) {
      cache = null;
      const raison = e instanceof ReglagesMaisonIndisponibles ? e.message : 'lecture impossible';
      journal({ raison });
      throw e instanceof ReglagesMaisonIndisponibles ? e : new ReglagesMaisonIndisponibles(raison);
    }
  };
}

/** Le lecteur du processus (un par instance de fonction). */
let lecteurDuProcessus = creerLecteurReglagesMaison();
export const lireReglagesMaison = () => lecteurDuProcessus();

/**
 * RÉSERVÉ AUX ESSAIS (tests/) : remplace la source de la fiche par `lireDocument` (async () => données | null), sans Firestore. Aucun fichier du serveur ne l'appelle
 * (un test statique le verrouille) : en production, la fiche ne se lit que dans Firestore, avec le SDK d'administration. Sans argument : retour à Firestore.
 */
export function remplacerSourcePourEssais(lireDocument = lireFicheFirestore) {
  lecteurDuProcessus = creerLecteurReglagesMaison(lireDocument === lireFicheFirestore ? {} : { lireDocument, journal: () => {} });
}

/** Liste de comptes de la fiche, sous forme de fonction asynchrone (à passer en `comptes` aux fabriques des fonctions appelables). Fiche illisible : liste vide (refus). */
export const comptesDe = (champ, lire = lireReglagesMaison) => async () => {
  if (!LISTES_COMPTES.includes(champ)) throw new Error(`liste inconnue : ${champ}`);
  try { return (await lire())[champ]; } catch { return []; }
};

/** Les quatre listes, prêtes à injecter. */
export const comptesAutorises = comptesDe('comptes_autorises');
export const comptesJeromeSeul = comptesDe('comptes_jerome_seul');
export const superAdmins = comptesDe('super_admins');
export const comptesOauthAutorises = comptesDe('comptes_oauth_autorises');

/**
 * Résout `comptes` (un tableau, pour les essais, ou une fonction asynchrone qui lit la fiche) en tableau. Une erreur = liste vide (refus).
 * Tous les contrôles d'accès du serveur passent par ici : un seul endroit où « fiche illisible = refus ».
 */
export async function listeDeComptes(comptes) {
  if (Array.isArray(comptes)) return comptes;
  if (typeof comptes !== 'function') return [];
  try {
    const l = await comptes();
    return Array.isArray(l) ? l : [];
  } catch {
    return [];
  }
}

/**
 * Comparaison d'un e-mail avec la liste, telle que chaque contrôle la faisait avant le chantier 0 (comportement inchangé, verrouillé par les tests de chaque fonction) :
 *  - 'exacte'     : l'e-mail tel que Google le donne (fonctions appelables de l'écran : devis, veille, saisie, réseaux sociaux, décisions, pilotage) ;
 *  - 'minuscules' : casse ignorée (connexion OAuth au MCP, Console, connexion à la base) ;
 *  - 'normalisee' : casse et espaces ignorés (super admins, « Jérôme seul », réglages du Pilotage par l'assistant).
 */
export const FORMES_EMAIL = Object.freeze({
  exacte: (e) => e,
  minuscules: (e) => e.toLowerCase(),
  normalisee: (e) => e.trim().toLowerCase(),
});

/** Vrai si `email` (e-mail VÉRIFIÉ de la connexion, jamais une saisie) est dans `comptes`, comparé selon `forme` (voir FORMES_EMAIL). */
export async function emailDans(comptes, email, forme = 'exacte') {
  const mettreEnForme = FORMES_EMAIL[forme];
  if (!mettreEnForme) throw new Error(`forme inconnue : ${forme}`);
  if (typeof email !== 'string' || !email.trim()) return false;
  return (await listeDeComptes(comptes)).includes(mettreEnForme(email));
}

/** Un texte de la fiche (adresse n8n, propriétaire par défaut, projet lié). Lève ReglagesMaisonIndisponibles si la fiche est illisible. */
export async function texteDe(champ, lire = lireReglagesMaison) {
  if (!TEXTES.includes(champ)) throw new Error(`champ inconnu : ${champ}`);
  return (await lire())[champ];
}

/**
 * « Jérôme seul » (Console, connexion à la base, clé ClickSend, réglages du Pilotage, vue administrateur des automatisations) : e-mail VÉRIFIÉ et dans comptes_jerome_seul.
 * Remplace côté serveur js/os/administrateur.js (le serveur ne lit plus aucune liste écrite dans le code). Fiche illisible = faux (refus).
 */
export async function estJeromeSeul(email, emailVerifie, comptes = comptesJeromeSeul) { // emailVerifie sans défaut : chaque appelant passe « email_verified === true »
  return emailVerifie === true && emailDans(comptes, email, 'normalisee');
}
