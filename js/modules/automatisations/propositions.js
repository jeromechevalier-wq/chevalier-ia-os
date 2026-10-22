// File « À valider » du module Automatisations : états et transitions d'une proposition déposée par un workflow n8n.
// Fichier PUR (ni Firebase ni DOM) : il se teste seul (tests/automatisations-propositions.test.js) et il est copié tel quel dans
// functions/partage/propositions.js (scripts/preparer-fonctions.js) pour que l'écran et le serveur appliquent les mêmes règles.
// La plateforme ne connaît aucun objet métier : une proposition est générique (titre, résumé, liste de champs nom / valeur).
// Aucune fonction ne modifie son entrée : chaque transition renvoie une copie.

export const ETATS = Object.freeze({
  A_VALIDER: 'a_valider', VALIDEE: 'validee', APPLIQUEE: 'appliquee', REFUSEE: 'refusee', ECHEC: 'echec',
});
export const ETATS_TERMINAUX = Object.freeze(['appliquee', 'refusee']);

const LIBELLES = {
  a_valider: 'À valider', validee: 'Validée', appliquee: 'Appliquée', refusee: 'Refusée', echec: 'En échec',
};
export const libelleEtat = (etat) => LIBELLES[etat] || 'Inconnu';

// Transitions autorisées : de -> liste des états atteignables.
const TRANSITIONS = {
  a_valider: ['validee', 'refusee'],
  validee: ['appliquee', 'echec'],
  echec: ['validee'],
  appliquee: [],
  refusee: [],
};
export const peutPasser = (de, vers) => Array.isArray(TRANSITIONS[de]) && TRANSITIONS[de].includes(vers);

export const CANAUX = Object.freeze(['interface', 'mcp']);
export const LONGUEUR_VALEUR_MAX = 500;
export const LONGUEUR_RAISON_MAX = 200;
export const LONGUEUR_ERREUR_MAX = 200;
export const DUREE_VALIDITE_MS = 30 * 24 * 60 * 60 * 1000; // une proposition non décidée devient périmée au bout de 30 jours

// Tout caractère de contrôle est refusé, sauf la tabulation et les retours à la ligne (une valeur peut tenir sur plusieurs lignes).
const CARACTERE_DE_CONTROLE = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;

// Copie superficielle : les sous-objets plats sont recopiés, les horodatages (Date, Timestamp Firestore) restent tels quels.
const copie = (p) => ({ ...p, champsProposes: (p.champsProposes || []).map((c) => ({ ...c })), champsValides: p.champsValides ? p.champsValides.map((c) => ({ ...c })) : p.champsValides, executions: { ...(p.executions || {}) }, etapes: (p.etapes || []).map((e) => ({ ...e })) });
const copieChamps = (liste) => liste.map((c) => ({ ...c }));
const refus = (code, message) => ({ ok: false, code, message });

/** Horodatage (nombre, Date ou objet Firestore) -> millisecondes, ou null. Tous les horodatages d'une proposition sont écrits en `Date` (donc en Timestamp Firestore) ; le serveur et l'écran les lisent avec cette fonction. */
export function enMs(v) {
  if (v == null) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (v instanceof Date) return v.getTime();
  if (typeof v.toMillis === 'function') return v.toMillis();
  return null;
}

const HEURE = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'Europe/Paris' });
const heure = (ms) => HEURE.format(new Date(ms)).replace(/[  \s]/g, '').replace('h', ':');

/** Une proposition est périmée quand maintenant > expireLe. */
export function estPerimee(proposition, maintenant) {
  const fin = enMs(proposition && proposition.expireLe);
  const t = enMs(maintenant);
  if (fin == null || t == null) return false;
  return t > fin;
}

/** Même texte pour tous les cas de course : « Déjà décidée par <e-mail> à HH:MM. ». */
function dejaDecidee(p) {
  const refusee = p.etat === 'refusee' || (p.refuseePar && !p.valideePar);
  const par = refusee ? p.refuseePar : p.valideePar;
  const quand = enMs(refusee ? p.refuseeLe : p.valideeLe);
  const qui = par ? ` par ${par}` : '';
  const a = quand != null ? ` à ${heure(quand)}` : '';
  return refus('deja_decidee', `Déjà décidée${qui}${a}.`);
}

const texteOk = (v) => typeof v === 'string' && v.trim() !== '';
function controleDecideur(par, canal, maintenant) {
  if (!texteOk(par)) return refus('champs_invalides', 'Le compte qui décide est obligatoire.');
  if (!CANAUX.includes(canal)) return refus('champs_invalides', 'Le canal doit être « interface » ou « mcp ».');
  if (enMs(maintenant) == null) return refus('champs_invalides', 'La date de la décision est illisible.');
  return null;
}

/** Les champs donnés doivent reprendre exactement les noms de champsProposes (même nombre, mêmes noms, une seule fois chacun). */
function controleChamps(proposes, champs) {
  if (!Array.isArray(champs)) return refus('champs_invalides', 'La liste des champs est invalide.');
  const attendus = (proposes || []).map((c) => c.nom);
  if (champs.length !== attendus.length) return refus('champs_invalides', 'Les champs doivent reprendre exactement ceux de la proposition.');
  const vus = new Set();
  for (const c of champs) {
    if (!c || typeof c !== 'object' || typeof c.nom !== 'string' || typeof c.valeur !== 'string') return refus('champs_invalides', 'Chaque champ doit avoir un nom et une valeur en texte.');
    if (!attendus.includes(c.nom) || vus.has(c.nom)) return refus('champs_invalides', 'Les champs doivent reprendre exactement ceux de la proposition.');
    if (c.valeur.length > LONGUEUR_VALEUR_MAX) return refus('champs_invalides', `Une valeur dépasse ${LONGUEUR_VALEUR_MAX} caractères.`);
    if (CARACTERE_DE_CONTROLE.test(c.valeur)) return refus('champs_invalides', 'Une valeur contient un caractère interdit.');
    vus.add(c.nom);
  }
  return null;
}

/** a_valider -> validee. `champs` (facultatif) = valeurs corrigées, mises dans champsValides ; champsProposes ne change jamais. */
export function valider(proposition, { par, canal, champs, maintenant = Date.now() } = {}) {
  if (proposition.etat !== 'a_valider') return dejaDecidee(proposition);
  if (estPerimee(proposition, maintenant)) return refus('perimee', 'Cette proposition est périmée : elle ne peut plus être validée.');
  const erreurDecideur = controleDecideur(par, canal, maintenant);
  if (erreurDecideur) return erreurDecideur;
  const proposes = proposition.champsProposes || [];
  if (champs != null) {
    const erreur = controleChamps(proposes, champs);
    if (erreur) return erreur;
  }
  const suivante = copie(proposition);
  suivante.champsValides = copieChamps(champs != null ? champs : proposes);
  suivante.etat = 'validee';
  suivante.valideePar = par;
  suivante.valideeLe = new Date(enMs(maintenant));
  suivante.canal = canal;
  return { ok: true, proposition: suivante };
}

/** a_valider -> refusee. Reste possible quand la proposition est périmée. */
export function refuser(proposition, { par, canal, raison, maintenant = Date.now() } = {}) {
  if (proposition.etat !== 'a_valider') return dejaDecidee(proposition);
  const erreurDecideur = controleDecideur(par, canal, maintenant);
  if (erreurDecideur) return erreurDecideur;
  if (raison != null && (typeof raison !== 'string' || raison.length > LONGUEUR_RAISON_MAX || CARACTERE_DE_CONTROLE.test(raison))) {
    return refus('champs_invalides', `La raison est invalide (${LONGUEUR_RAISON_MAX} caractères au plus, sans caractère interdit).`);
  }
  const suivante = copie(proposition);
  suivante.etat = 'refusee';
  suivante.refuseePar = par;
  suivante.refuseeLe = new Date(enMs(maintenant));
  suivante.canal = canal;
  suivante.raison = raison != null && raison.trim() !== '' ? raison.trim() : null;
  return { ok: true, proposition: suivante };
}

const interdite = (p, vers) => refus('transition_interdite', `Passage impossible : ${libelleEtat(p.etat)} vers ${libelleEtat(vers)}.`);

/** validee -> appliquee (terminal). */
export function marquerAppliquee(proposition, { executionId } = {}) {
  if (!peutPasser(proposition.etat, 'appliquee')) return interdite(proposition, 'appliquee');
  const suivante = copie(proposition);
  suivante.etat = 'appliquee';
  suivante.executions = { proposer: null, appliquer: null, refuser: null, ...(suivante.executions || {}), appliquer: executionId != null ? executionId : null };
  suivante.derniereErreur = null;
  return { ok: true, proposition: suivante };
}

/** validee -> echec : garde l'erreur (tronquée à 200 caractères) et compte la tentative. */
export function marquerEchec(proposition, { erreur } = {}) {
  if (!peutPasser(proposition.etat, 'echec')) return interdite(proposition, 'echec');
  const suivante = copie(proposition);
  suivante.etat = 'echec';
  suivante.tentatives = (Number(suivante.tentatives) || 0) + 1;
  suivante.derniereErreur = String(erreur == null ? 'Erreur inconnue' : erreur).replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, LONGUEUR_ERREUR_MAX);
  return { ok: true, proposition: suivante };
}

/** echec -> validee : le workflow pourra la reprendre ; les tentatives repartent de 0. */
export function relancer(proposition, { maintenant = Date.now() } = {}) {
  if (!peutPasser(proposition.etat, 'validee') || proposition.etat !== 'echec') return interdite(proposition, 'validee');
  const suivante = copie(proposition);
  suivante.etat = 'validee';
  suivante.tentatives = 0;
  suivante.derniereErreur = null;
  suivante.relanceeLe = new Date(enMs(maintenant)); // l'alerte « validée mais pas appliquée » se calcule sur relanceeLe, sinon valideeLe
  return { ok: true, proposition: suivante };
}

export const ETAPES_FRISE = Object.freeze([
  { cle: 'recu', libelle: 'Reçu' },
  { cle: 'propose', libelle: 'Proposé' },
  { cle: 'attente', libelle: 'En attente de validation' },
  { cle: 'decision', libelle: 'Validé ou Refusé' },
  { cle: 'application', libelle: 'Appliqué ou En échec' },
]);

// État de chacune des 5 étapes, selon l'état de la proposition.
const FRISE = {
  a_valider: ['fait', 'fait', 'en_cours', 'a_venir', 'a_venir'],
  validee: ['fait', 'fait', 'fait', 'fait', 'en_cours'],
  appliquee: ['fait', 'fait', 'fait', 'fait', 'fait'],
  refusee: ['fait', 'fait', 'fait', 'fait', 'ignoree'],
  echec: ['fait', 'fait', 'fait', 'fait', 'echec'],
};

/** La frise de suivi : liste fixe de 5 étapes { cle, libelle, etat, detail }. `maintenant` sert à signaler une proposition périmée. */
export function frise(proposition, maintenant) {
  const etats = FRISE[proposition.etat] || FRISE.a_valider;
  const perimee = proposition.etat === 'a_valider' && estPerimee(proposition, maintenant);
  return ETAPES_FRISE.map((e, i) => {
    let detail = null;
    if (e.cle === 'decision' && proposition.etat !== 'a_valider') detail = proposition.etat === 'refusee' ? 'Refusé' : 'Validé';
    if (e.cle === 'application') detail = proposition.etat === 'echec' ? 'En échec' : proposition.etat === 'appliquee' ? 'Appliqué' : null;
    if (e.cle === 'attente' && perimee) detail = 'Périmée';
    return { cle: e.cle, libelle: e.libelle, etat: etats[i], detail };
  });
}
