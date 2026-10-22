// File « À valider » du module Automatisations : états et transitions d'une proposition déposée par un workflow n8n.
// Fichier PUR (ni Firebase ni DOM) : il se teste seul (tests/automatisations-propositions.test.js) et il est copié tel quel dans
// functions/partage/propositions.js (scripts/preparer-fonctions.js) pour que l'écran et le serveur appliquent les mêmes règles.
// La plateforme ne connaît aucun objet métier : une proposition est générique (titre, résumé, liste de champs nom / valeur).
// Aucune fonction ne modifie son entrée : chaque transition renvoie une copie.

export const ETATS = Object.freeze({
  EN_PREPARATION: 'en_preparation', A_VALIDER: 'a_valider', VALIDEE: 'validee', APPLIQUEE: 'appliquee', REFUSEE: 'refusee', ECHEC: 'echec', ABANDONNEE: 'abandonnee',
});
export const ETATS_TERMINAUX = Object.freeze(['abandonnee', 'appliquee', 'refusee']);
// États d'une étape du « Logger » (chaîne de jalons qui s'allument pendant que le workflow tourne).
export const ETATS_ETAPE = Object.freeze(['a_venir', 'en_cours', 'fait', 'echec', 'ignoree']);
export const MAX_ETAPES = 10; // au total : le plan, les étapes hors plan, le workflow A et le workflow B partagent le même tableau
export const DELAI_BLOQUEE_MS = 15 * 60 * 1000; // sans nouvelle étape depuis 15 minutes, une ligne « en préparation » est dite bloquée (calculé, jamais écrit)

const LIBELLES = {
  en_preparation: 'En préparation', abandonnee: 'Abandonnée',
  a_valider: 'À valider', validee: 'Validée', appliquee: 'Appliquée', refusee: 'Refusée', echec: 'En échec',
};
export const libelleEtat = (etat) => LIBELLES[etat] || 'Inconnu';

// Transitions autorisées : de -> liste des états atteignables.
const TRANSITIONS = {
  en_preparation: ['a_valider', 'abandonnee'],
  abandonnee: [],
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

const pasPrete = (p) => {
  if (p.etat === 'en_preparation') return refus('pas_prete', 'Cette proposition est encore en préparation.');
  if (p.etat === 'abandonnee') return refus('abandonnee', 'Ce traitement a été abandonné.');
  return null;
};

/** Fin de vie des étapes : `table` dit où va chaque état (ex. { en_cours: 'fait', a_venir: 'ignoree' }) ; les autres états ne bougent pas. Les étapes changées reçoivent `le`. */
function etapesFinies(etapes, table, maintenant) {
  return (etapes || []).map((e) => (table[e.etat] ? { ...e, etat: table[e.etat], le: new Date(enMs(maintenant)) } : { ...e }));
}

/** a_valider -> validee. `champs` (facultatif) = valeurs corrigées, mises dans champsValides ; champsProposes ne change jamais. */
export function valider(proposition, { par, canal, champs, maintenant = Date.now() } = {}) {
  const attente = pasPrete(proposition);
  if (attente) return attente;
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
  const attente = pasPrete(proposition);
  if (attente) return attente;
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
  suivante.etapes = etapesFinies(suivante.etapes, { a_venir: 'ignoree', en_cours: 'ignoree' }, maintenant); // le workflow B n'aura plus rien à faire
  return { ok: true, proposition: suivante };
}

const interdite = (p, vers) => refus('transition_interdite', `Passage impossible : ${libelleEtat(p.etat)} vers ${libelleEtat(vers)}.`);

/** validee -> appliquee (terminal). */
export function marquerAppliquee(proposition, { executionId, maintenant = Date.now() } = {}) {
  if (!peutPasser(proposition.etat, 'appliquee')) return interdite(proposition, 'appliquee');
  const suivante = copie(proposition);
  suivante.etapes = etapesFinies(suivante.etapes, { en_cours: 'fait', a_venir: 'ignoree' }, maintenant);
  suivante.etat = 'appliquee';
  suivante.executions = { proposer: null, appliquer: null, refuser: null, ...(suivante.executions || {}), appliquer: executionId != null ? executionId : null };
  suivante.derniereErreur = null;
  return { ok: true, proposition: suivante };
}

/** validee -> echec : garde l'erreur (tronquée à 200 caractères) et compte la tentative. */
export function marquerEchec(proposition, { erreur, maintenant = Date.now() } = {}) {
  if (!peutPasser(proposition.etat, 'echec')) return interdite(proposition, 'echec');
  const suivante = copie(proposition);
  suivante.etapes = etapesFinies(suivante.etapes, { en_cours: 'echec' }, maintenant); // les étapes à venir restent : B les reprendra après « relancer »
  suivante.etat = 'echec';
  suivante.tentatives = (Number(suivante.tentatives) || 0) + 1;
  suivante.derniereErreur = String(erreur == null ? 'Erreur inconnue' : erreur).replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, LONGUEUR_ERREUR_MAX);
  return { ok: true, proposition: suivante };
}

/** echec -> validee : le workflow pourra la reprendre ; les tentatives repartent de 0. */
export function relancer(proposition, { maintenant = Date.now() } = {}) {
  const attente = pasPrete(proposition);
  if (attente) return attente;
  if (!peutPasser(proposition.etat, 'validee') || proposition.etat !== 'echec') return interdite(proposition, 'validee');
  const suivante = copie(proposition);
  suivante.etat = 'validee';
  suivante.tentatives = 0;
  suivante.derniereErreur = null;
  suivante.relanceeLe = new Date(enMs(maintenant)); // l'alerte « validée mais pas appliquée » se calcule sur relanceeLe, sinon valideeLe
  return { ok: true, proposition: suivante };
}

const SANS_CONTROLE = /^[^\u0000-\u001f\u007f]*$/;
const MOTIF_CLE_ETAPE = /^[a-z0-9][a-z0-9_-]{0,59}$/; // même forme que le type « etiquette » de la porte (scripts/porte/validation.js)
const MOTIF_ID_PROPOSITION = /^[a-z0-9][a-z0-9_-]{0,99}$/;
export const LONGUEUR_LIBELLE_ETAPE_MAX = 60;
export const LONGUEUR_TYPE_MAX = 40;
export const LONGUEUR_TITRE_MAX = 120;
export const LONGUEUR_RESUME_MAX = 2000;
export const LONGUEUR_NOM_CHAMP_MAX = 40;
export const MAX_CHAMPS_PROPOSES = 40;

/** Texte court obligatoire : 1 à `max` caractères après nettoyage des bords, sans caractère de contrôle. */
const texteCourt = (v, max) => typeof v === 'string' && SANS_CONTROLE.test(v) && v.trim().length >= 1 && v.trim().length <= max;

/** Contrôle d'un plan : 1 à 10 { cle, libelle } aux clés uniques. Rend { ok: true, etapes } (toutes `a_venir`, sans `le`) ou un refus. */
function etapesDuPlan(plan) {
  if (!Array.isArray(plan) || plan.length < 1 || plan.length > MAX_ETAPES) return refus('champs_invalides', `Le plan doit contenir de 1 à ${MAX_ETAPES} étapes.`);
  const vues = new Set();
  const etapes = [];
  for (const e of plan) {
    if (!e || typeof e !== 'object' || typeof e.cle !== 'string' || !MOTIF_CLE_ETAPE.test(e.cle)) return refus('champs_invalides', 'Chaque étape du plan a besoin d\'une clé (minuscules, chiffres, _ et -).');
    if (!texteCourt(e.libelle, LONGUEUR_LIBELLE_ETAPE_MAX)) return refus('champs_invalides', `Le libellé d'une étape tient en ${LONGUEUR_LIBELLE_ETAPE_MAX} caractères, sans caractère interdit.`);
    if (vues.has(e.cle)) return refus('champs_invalides', 'Deux étapes du plan portent la même clé.');
    vues.add(e.cle);
    etapes.push({ cle: e.cle, libelle: e.libelle.trim(), etat: 'a_venir' });
  }
  return { ok: true, etapes };
}

/**
 * Création de la ligne au DÉMARRAGE du workflow A : état `en_preparation`, aucun champ proposé encore. `titre` est facultatif (défaut : le type ; `finaliser` le fixe).
 * `plan` (facultatif) = les jalons annoncés d'avance, tous `a_venir`. Rend { ok: true, proposition } ou un refus `champs_invalides`.
 */
export function demarrer({ id, type, titre, executionId, plan, maintenant = Date.now() } = {}) {
  if (typeof id !== 'string' || !MOTIF_ID_PROPOSITION.test(id)) return refus('champs_invalides', 'L\'identifiant de la proposition est invalide.');
  if (!texteCourt(type, LONGUEUR_TYPE_MAX)) return refus('champs_invalides', `Le type tient en ${LONGUEUR_TYPE_MAX} caractères, sans caractère interdit.`);
  const titreFinal = titre == null ? type : titre;
  if (!texteCourt(titreFinal, LONGUEUR_TITRE_MAX)) return refus('champs_invalides', `Le titre tient en ${LONGUEUR_TITRE_MAX} caractères, sans caractère interdit.`);
  if (enMs(maintenant) == null) return refus('champs_invalides', 'La date est illisible.');
  let etapes = [];
  if (plan != null) {
    const r = etapesDuPlan(plan);
    if (!r.ok) return r;
    etapes = r.etapes;
  }
  return {
    ok: true,
    proposition: {
      id, type: type.trim(), titre: titreFinal.trim(), resume: '', champsProposes: [], champsValides: null, lien: null,
      etat: 'en_preparation', creeLe: new Date(enMs(maintenant)), expireLe: null,
      valideePar: null, valideeLe: null, canal: null, refuseePar: null, refuseeLe: null, raison: null,
      tentatives: 0, derniereErreur: null,
      executions: { proposer: executionId != null ? executionId : null, appliquer: null, refuser: null },
      etapes, source: 'porte',
    },
  };
}

/**
 * Met à jour (par `cle`) ou ajoute une étape. Permis seulement en `en_preparation` (étapes du workflow A) et `validee` (étapes de B).
 * `a_venir` n'entre que par `demarrer`. L'ordre est celui du plan ; une clé hors plan s'ajoute à la fin (10 étapes au total). Une chaîne ne recule pas :
 * `fait` et `ignoree` ne changent plus d'état, `echec` ne peut que passer à `fait` (reprise). Rejouer à l'identique ne change rien (`inchangee: true`).
 */
export function ajouterEtape(proposition, { cle, libelle, etat, maintenant = Date.now() } = {}) {
  if (proposition.etat !== 'en_preparation' && proposition.etat !== 'validee') return refus('transition_interdite', 'Une étape ne s\'écrit que pendant la préparation ou l\'application.');
  if (typeof cle !== 'string' || !MOTIF_CLE_ETAPE.test(cle)) return refus('champs_invalides', 'La clé de l\'étape est invalide.');
  if (!texteCourt(libelle, LONGUEUR_LIBELLE_ETAPE_MAX)) return refus('champs_invalides', `Le libellé d'une étape tient en ${LONGUEUR_LIBELLE_ETAPE_MAX} caractères, sans caractère interdit.`);
  if (!['en_cours', 'fait', 'echec', 'ignoree'].includes(etat)) return refus('champs_invalides', 'L\'état d\'une étape doit être en_cours, fait, echec ou ignoree.');
  if (enMs(maintenant) == null) return refus('champs_invalides', 'La date est illisible.');
  const propre = libelle.trim();
  const suivante = copie(proposition);
  const i = suivante.etapes.findIndex((e) => e.cle === cle);
  if (i < 0) {
    if (suivante.etapes.length >= MAX_ETAPES) return refus('champs_invalides', `Une proposition porte ${MAX_ETAPES} étapes au plus.`);
    suivante.etapes.push({ cle, libelle: propre, etat, le: new Date(enMs(maintenant)) });
    return { ok: true, proposition: suivante };
  }
  const avant = suivante.etapes[i].etat;
  if (avant === etat && suivante.etapes[i].libelle === propre) return { ok: true, proposition: suivante, inchangee: true };
  const permis = avant === 'a_venir' || avant === 'en_cours' || avant === etat || (avant === 'echec' && etat === 'fait');
  if (!permis) return refus('transition_interdite', 'Une étape ne revient pas en arrière.');
  suivante.etapes[i] = { cle, libelle: propre, etat, le: new Date(enMs(maintenant)) };
  return { ok: true, proposition: suivante };
}

/**
 * en_preparation -> a_valider : le workflow A a fini et dépose le contenu à valider. Pose titre, résumé, champs (1 à 40 { nom, valeur }), lien, `expireLe` (+30 jours).
 * Les étapes ne sont pas touchées. `executionId` (facultatif) complète executions.proposer.
 */
export function finaliser(proposition, { titre, resume, champs, lien, executionId, maintenant = Date.now() } = {}) {
  if (proposition.etat !== 'en_preparation') return interdite(proposition, 'a_valider');
  if (!texteCourt(titre, LONGUEUR_TITRE_MAX)) return refus('champs_invalides', `Le titre tient en ${LONGUEUR_TITRE_MAX} caractères, sans caractère interdit.`);
  if (resume != null && (typeof resume !== 'string' || resume.length > LONGUEUR_RESUME_MAX || CARACTERE_DE_CONTROLE.test(resume))) return refus('champs_invalides', `Le résumé tient en ${LONGUEUR_RESUME_MAX} caractères, sans caractère interdit.`);
  if (!Array.isArray(champs) || champs.length < 1 || champs.length > MAX_CHAMPS_PROPOSES) return refus('champs_invalides', `La liste des champs doit contenir de 1 à ${MAX_CHAMPS_PROPOSES} éléments.`);
  const noms = new Set();
  for (const c of champs) {
    if (!c || typeof c !== 'object' || !texteCourt(c.nom, LONGUEUR_NOM_CHAMP_MAX) || typeof c.valeur !== 'string') return refus('champs_invalides', 'Chaque champ doit avoir un nom et une valeur en texte.');
    if (c.valeur.length > LONGUEUR_VALEUR_MAX || CARACTERE_DE_CONTROLE.test(c.valeur)) return refus('champs_invalides', `Une valeur dépasse ${LONGUEUR_VALEUR_MAX} caractères ou contient un caractère interdit.`);
    if (noms.has(c.nom)) return refus('champs_invalides', 'Deux champs portent le même nom.');
    noms.add(c.nom);
  }
  if (lien != null && (typeof lien !== 'string' || lien.length > 2000 || !/^https?:\/\//i.test(lien))) return refus('champs_invalides', 'Le lien doit commencer par http:// ou https://.');
  if (enMs(maintenant) == null) return refus('champs_invalides', 'La date est illisible.');
  const suivante = copie(proposition);
  suivante.etat = 'a_valider';
  suivante.titre = titre.trim();
  suivante.resume = resume != null ? resume : '';
  suivante.champsProposes = copieChamps(champs);
  suivante.lien = lien != null ? lien : null;
  suivante.expireLe = new Date(enMs(maintenant) + DUREE_VALIDITE_MS);
  if (executionId != null) suivante.executions = { ...suivante.executions, proposer: executionId };
  return { ok: true, proposition: suivante };
}

/**
 * en_preparation -> abandonnee (terminal) : le workflow A a échoué avant le dépôt, ou la ligne est restée bloquée. Garde l'erreur (200 caractères).
 * Étapes : en_cours -> echec, a_venir -> ignoree. `par` et `canal` (facultatifs) disent qui a abandonné à la main (écran).
 */
export function abandonner(proposition, { erreur, par, canal, maintenant = Date.now() } = {}) {
  if (!peutPasser(proposition.etat, 'abandonnee')) return interdite(proposition, 'abandonnee');
  const suivante = copie(proposition);
  suivante.etat = 'abandonnee';
  suivante.derniereErreur = String(erreur == null ? 'Erreur inconnue' : erreur).replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, LONGUEUR_ERREUR_MAX);
  suivante.etapes = etapesFinies(suivante.etapes, { en_cours: 'echec', a_venir: 'ignoree' }, maintenant);
  if (par != null) { suivante.abandonneePar = par; suivante.canal = canal != null ? canal : null; }
  return { ok: true, proposition: suivante };
}

/** Vrai si la ligne est « en préparation » sans nouvelle étape depuis plus de 15 minutes (maximum de creeLe et des `le` des étapes). Calculé, jamais écrit. */
export function estBloquee(proposition, maintenant = Date.now()) {
  if (!proposition || proposition.etat !== 'en_preparation') return false;
  const t = enMs(maintenant);
  if (t == null) return false;
  let derniere = enMs(proposition.creeLe) ?? 0;
  for (const e of proposition.etapes || []) derniere = Math.max(derniere, enMs(e.le) ?? 0);
  return t - derniere > DELAI_BLOQUEE_MS;
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
  en_preparation: ['fait', 'en_cours', 'a_venir', 'a_venir', 'a_venir'],
  abandonnee: ['fait', 'echec', 'ignoree', 'ignoree', 'ignoree'],
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
    if (e.cle === 'propose' && proposition.etat === 'en_preparation') detail = 'En préparation';
    if (e.cle === 'propose' && proposition.etat === 'abandonnee') detail = 'Abandonné';
    if (e.cle === 'attente' && perimee) detail = 'Périmée';
    return { cle: e.cle, libelle: e.libelle, etat: etats[i], detail };
  });
}
