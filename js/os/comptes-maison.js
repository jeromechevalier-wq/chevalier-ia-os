// Réglages de la maison vus par l'ÉCRAN (chantier 0, partie navigateur, 26/11/2026). Aucun compte n'est plus écrit dans js/ : ils sont lus dans Firestore.
//  - reglages_maison/public : lu AVANT la connexion, sans aucun e-mail : { mode_crm: true|false } (le CRM de Jérôme existe-t-il dans cette maison ?).
//    Sur la plateforme des clients, ce document est illisible (règles de la plateforme : tout est refusé) : c'est le signe « pas de CRM ici ».
//  - reglages_maison/ecran : lu APRÈS la connexion, par les seuls comptes de la fiche serveur (règle firestore.rules) :
//    { personnes: [{ email, nom, portrait }], comptes_jerome_seul: [e-mails], configuration_crm?: 'neutre' }.
//    modules (27/11/2026, facultatif) : liste d'identifiants de modules allumés dans cette maison (js/os/maison-modules.js) ; ABSENT = comportement d'avant.
//    besoins (26/11/2026, facultatif) : 1 à 3 besoins du client, dessinés en village à l'accueil (js/os/maison-village.js) ; ABSENT = accueil d'avant.
//    configuration_crm (26/11/2026) : 'neutre' = la maison d'un client (étapes, phases, réglages et membres neutres, comme un espace de la plateforme) ;
//    champ ABSENT ou toute autre valeur = la configuration de Jérôme (sa maison n'a pas ce champ : rien ne change chez lui).
// Ce fichier n'importe rien (pas de Firebase) : il se teste seul. Il ne fait que montrer ou cacher : les vraies barrières sont les règles et le serveur.
// Les listes sont gardées en mémoire (remplies à la connexion) pour que les fonctions de l'écran restent synchrones ; vide = personne (jamais d'ouverture par défaut).

const norm = (email) => (typeof email === 'string' ? email.trim().toLowerCase() : '');

let personnes = []; // [{ email, nom, avatar }]
let titulaires = []; // e-mails
let modeCrm = false;
let configurationCrm = ''; // valeur du champ configuration_crm de `ecran` ('' tant que rien n'est lu)
let besoinsBrut; // valeur brute du champ `besoins` de `ecran` (undefined = champ absent) : rangée et vérifiée par js/os/maison-village.js
let modulesBrut; // valeur brute du champ `modules` de `ecran` (undefined = champ absent) : rangée et vérifiée par js/os/maison-modules.js

/** Range en mémoire le document `ecran` (données lues dans Firestore). Les entrées mal formées sont ignorées. */
export function remplirComptesMaison(ecran) {
  const liste = Array.isArray(ecran?.personnes) ? ecran.personnes : [];
  personnes = liste
    .filter((p) => p && typeof p === 'object' && norm(p.email))
    .map((p) => ({ email: norm(p.email), nom: typeof p.nom === 'string' && p.nom.trim() ? p.nom.trim() : norm(p.email), avatar: typeof p.portrait === 'string' ? p.portrait : '' }));
  titulaires = (Array.isArray(ecran?.comptes_jerome_seul) ? ecran.comptes_jerome_seul : []).map(norm).filter(Boolean);
  configurationCrm = typeof ecran?.configuration_crm === 'string' ? ecran.configuration_crm : ''; // valeur exacte : seul 'neutre' change quelque chose
  modulesBrut = Array.isArray(ecran?.modules) ? [...ecran.modules] : ecran?.modules ?? undefined; // copie : rien ne remonte vers le document lu
  besoinsBrut = Array.isArray(ecran?.besoins) ? ecran.besoins.map(copieFiche) : ecran?.besoins ?? undefined;
}

const copieFiche = (b) => (b && typeof b === 'object' && !Array.isArray(b) ? { ...b } : b);

/** Oublie les listes (déconnexion, essais). */
export function viderComptesMaison() {
  personnes = [];
  titulaires = [];
  configurationCrm = '';
  modulesBrut = undefined;
  besoinsBrut = undefined;
}

/** Valeur brute du champ `besoins` de `ecran` (copie ; undefined = champ absent ou null). Lue par js/os/maison-village.js. */
export const besoinsEcranBrut = () => (Array.isArray(besoinsBrut) ? besoinsBrut.map(copieFiche) : besoinsBrut);

/** Valeur brute du champ `modules` de `ecran` (copie d'une liste ; undefined = champ absent ou null). Lue par js/os/maison-modules.js. */
export const modulesEcranBrut = () => (Array.isArray(modulesBrut) ? [...modulesBrut] : modulesBrut);

/** Vrai si `ecran` demande la configuration neutre (configuration_crm: 'neutre'). Champ absent ou autre valeur : faux (configuration de Jérôme, inchangée). */
export const configurationNeutre = () => configurationCrm === 'neutre';

/** Les personnes de la maison (copies) : [{ email, nom, avatar }]. */
export const personnesMaison = () => personnes.map((p) => ({ ...p }));

/** La personne de cet e-mail, ou null. */
export function personneMaison(email) {
  const e = norm(email);
  const p = e ? personnes.find((x) => x.email === e) : null;
  return p ? { ...p } : null;
}

/** Vrai si l'e-mail est dans comptes_jerome_seul (Console, connexion à la base, vue administrateur des automatisations). Liste vide = faux. */
export const estCompteTitulaire = (email) => {
  const e = norm(email);
  return !!e && titulaires.includes(e);
};

/** Le CRM de la maison est-il ouvert (document `public` lu, mode_crm vrai) ? Faux tant que rien n'est lu. */
export const crmOuvert = () => modeCrm;
export function definirModeCrm(valeur) { modeCrm = valeur === true; }

// ---------------------------------------------------------------- lectures (Firestore injecté par l'appelant : js/os/auth.js)

export const ATTENTES_LECTURE_REGLAGES = Object.freeze([400, 1200, 2500]);
export const MESSAGE_PUBLIC_ABSENT = 'Réglages de la maison absents (reglages_maison/public). Le site ne peut pas démarrer : préviens l’administrateur.';
export const MESSAGE_ECRAN_ABSENT = 'Réglages de la maison absents (reglages_maison/ecran). Connexion impossible : préviens l’administrateur.';
export const MESSAGE_PANNE_REGLAGES = 'Chargement impossible pour le moment. Vérifie ta connexion internet, puis recharge la page.';

const pauseParDefaut = (ms) => new Promise((r) => setTimeout(r, ms));
const refus = (e) => e?.code === 'permission-denied';

/** Lecture avec reprises : `lire()` rend les données du document, ou null s'il n'existe pas. Rend { etat: 'ok', donnees } | { etat: 'refus' } | { etat: 'absent' } | { etat: 'erreur' }. */
async function lireAvecReprises({ lire, attentes = ATTENTES_LECTURE_REGLAGES, pause = pauseParDefaut, journal = (...a) => console.warn(...a), nom }) {
  for (let essai = 0; ; essai++) {
    try {
      const donnees = await lire();
      return donnees ? { etat: 'ok', donnees } : { etat: 'absent' };
    } catch (e) {
      journal(`Lecture de reglages_maison/${nom} impossible :`, e?.code || 'inconnu', `(essai ${essai + 1})`); // jamais d'e-mail ni de jeton : le code d'erreur seul
      if (refus(e)) return { etat: 'refus' };
      if (essai >= attentes.length) return { etat: 'erreur' };
      await pause(attentes[essai]);
    }
  }
}

/**
 * Démarrage, avant toute connexion : lit `public`. Rend
 *  { etat: 'crm' }        : document lu, mode_crm vrai → le CRM démarre ;
 *  { etat: 'plateforme' } : lecture refusée (plateforme des clients) ou mode_crm faux → page « Espace indisponible », comme avant ;
 *  { etat: 'absent' }     : lecture permise mais document absent → message clair, jamais la page de la plateforme ;
 *  { etat: 'erreur' }     : panne persistante → message et « Recharger ».
 */
export async function lirePublic(options) {
  const lu = await lireAvecReprises({ ...options, nom: 'public' });
  definirModeCrm(lu.etat === 'ok' && lu.donnees.mode_crm === true);
  if (lu.etat === 'ok') return { etat: crmOuvert() ? 'crm' : 'plateforme' };
  if (lu.etat === 'refus') return { etat: 'plateforme' };
  return { etat: lu.etat };
}

/**
 * Après la connexion (CRM) : `user` = compte Firebase. Lit `ecran` et rend
 *  { etat: 'ok', compte: { email, uid, nom, avatar } } : e-mail vérifié, compte de la fiche, présent dans `personnes` ;
 *  { etat: 'refus' }  : e-mail non vérifié, lecture refusée par les règles (compte inconnu) ou absent de `personnes` → l'appelant déconnecte ;
 *  { etat: 'absent' } : document absent → message clair, sans déconnecter ;
 *  { etat: 'erreur' } : panne persistante → message, sans déconnecter (jamais de déconnexion pour une panne).
 */
export async function lireEcran({ user, ...options }) {
  if (!user || !user.email || user.emailVerified !== true) return { etat: 'refus' };
  const lu = await lireAvecReprises({ ...options, nom: 'ecran' });
  if (lu.etat !== 'ok') return { etat: lu.etat };
  remplirComptesMaison(lu.donnees);
  const p = personneMaison(user.email);
  return p ? { etat: 'ok', compte: { email: p.email, uid: user.uid, nom: p.nom, avatar: p.avatar } } : { etat: 'refus' };
}
