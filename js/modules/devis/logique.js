// Logique pure du module Devis (voir docs/cadrage-devis.md) : marge, totaux, TVA, numéro, statuts, validation de finalisation,
// vue client (le JSON pour n8n), textes lisibles, nouvelle version, montant d'affaire.
// Aucun accès à Firebase, au réseau ni au navigateur : testé avec node --test. L'écran, le serveur et l'assistant exécutent ces
// mêmes fonctions, jamais de calcul ailleurs.
//
// Unités : tous les montants stockés ou exposés sont en EUROS (nombres, 2 décimales au plus). Le calcul interne passe par des
// centimes entiers puis reconvertit en euros, pour éviter les erreurs de virgule.
//
// Décisions prises seul (nuit du 24/10/2026) :
// - Le cadrage (§4) écrit `coefficient` pour la marge d'un devis, d'une section ou d'une ligne. Ici le champ stocké s'appelle `marge`
//   (un pourcentage saisi par l'utilisateur, `modeMarge` sur le devis) ; le coefficient n'est JAMAIS stocké, il se calcule
//   (`coefficientDeMarge`). Les docs seront alignés plus tard.
// - Le taux de TVA par défaut est un champ du devis (`tauxTvaDefaut`, copié des réglages à la création) : jamais relu dans les
//   réglages au moment du calcul.
// - Accepter un devis jamais marqué envoyé est refusé (aucune transition libre).
// - Un prix d'achat négatif est refusé à la finalisation (la marge, elle, peut être négative).
// - `numeroDevis`, `dateExpiration` et `transitionPossible` retournent null / false sur une entrée invalide, sans exception.
// - Une ligne sans taux de TVA propre prend `devis.tauxTvaDefaut`, et à défaut le premier taux de TAUX_TVA_DEFAUT.
// - Un devis qui n'a pas de `regimeTva` est traité comme « assujetti ».
import { aujourdhuiParis, ajouterJours } from '../crm/logique.js';

// ---------------------------------------------------------------- constantes
export const MODES_MARGE = [
  { id: 'majoration', libelle: 'Majoration sur le prix d\'achat' },
  { id: 'marge_vente', libelle: 'Marge sur le prix de vente' },
];
// Noms affichés (24/10/2026) : Finalisé = `en_attente_envoi`, Signé = `accepte`. Les identifiants stockés ne changent pas.
// « Expiré » n'est jamais stocké : il se calcule à l'affichage (estExpire), il est listé ici pour avoir un libellé.
export const STATUTS_DEVIS = [
  { id: 'brouillon', libelle: 'Brouillon' },
  { id: 'en_attente_envoi', libelle: 'Finalisé' },
  { id: 'envoye', libelle: 'Envoyé' },
  { id: 'accepte', libelle: 'Signé' },
  { id: 'refuse', libelle: 'Refusé' },
  { id: 'expire', libelle: 'Expiré' },
  { id: 'remplace', libelle: 'Remplacé' },
];
export const TAUX_TVA_DEFAUT = [20, 10, 5.5];
export const REGIMES_TVA = [
  { id: 'franchise', libelle: 'Franchise en base' },
  { id: 'assujetti', libelle: 'Assujetti' },
];
export const MENTION_FRANCHISE = 'TVA non applicable, article 293 B du CGI';
export const MENTION_AUTOLIQUIDATION = 'Autoliquidation de la TVA (article 283-2 nonies du CGI)';
export const MENTION_SIGNATURE = 'Reçu avant l\'exécution des travaux, bon pour accord. Date et signature du client :';
// Attestation de TVA réduite (texte écrit pour ce module, dans l'esprit de l'article 257 du CGI ; voir aussi document.js).
// À faire valider par l'expert-comptable du client avant mise en production.
export const ATTESTATION_TVA_REDUITE = 'Attestation du client (preneur de la prestation) : je certifie que les travaux décrits dans ce devis concernent un local à usage d\'habitation achevé depuis plus de deux ans, qu\'ils n\'ont pas pour effet d\'accroître la surface de plancher de plus de 10 %, et que ce local est affecté à l\'habitation à l\'issue des travaux. Je m\'engage à régler la différence de TVA si ces conditions ne sont pas respectées.';
export const ERREUR_MARGE_100 = 'La marge sur le prix de vente doit être inférieure à 100 %.';
export const DUREE_VALIDITE_DEFAUT = 90;
/** Types de remise (visible du client, contrairement à la marge) : `devis.remise = { type, valeur }` ou null. */
export const TYPES_REMISE = ['pourcentage', 'montant'];
/** Moments de l'acompte et leurs textes imprimés (le moment « libre » prend `texteMoment`). */
export const MOMENTS_ACOMPTE = [
  { id: 'signature', libelle: 'à la signature' },
  { id: 'debut_travaux', libelle: 'au début des travaux' },
  { id: 'mi_travaux', libelle: 'à la moitié des travaux' },
  { id: 'libre', libelle: 'à un moment libre' },
];
/** Types d'un acompte : pourcentage du total TTC, montant HT (converti en TTC) ou montant TTC. `devis.acomptes = [{ type, valeur, moment, texteMoment? }]`. */
export const TYPES_ACOMPTE = [
  { id: 'pourcentage', libelle: '%' },
  { id: 'montantHt', libelle: '€ HT' },
  { id: 'montantTtc', libelle: '€ TTC' },
];
/** Types de déchets du chantier et leurs libellés imprimés. */
export const TYPES_DECHETS = [
  { id: 'inertes', libelle: 'Déchets inertes' },
  { id: 'non_dangereux', libelle: 'Déchets non dangereux et non inertes' },
  { id: 'dangereux', libelle: 'Déchets dangereux' },
  { id: 'specifiques', libelle: 'Déchets spécifiques' },
];
/** Clés qui ne sortent JAMAIS vers le client (voir vueClient). */
export const CLES_INTERDITES_CLIENT = ['prixAchat', 'marge', 'coefficient', 'modeMarge', 'ajustement'];

const idsModes = MODES_MARGE.map((m) => m.id);
const estNombre = (v) => typeof v === 'number' && Number.isFinite(v);
const absent = (v) => v === null || v === undefined;
const estJour = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s)
  && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;

// ---------------------------------------------------------------- argent
/** Arrondi à l'entier le plus proche, le demi vers le haut en valeur absolue (symétrique), robuste aux flottants. */
function arrondiDemi(x) {
  if (!estNombre(x)) return 0;
  const r = Math.round(Number(Math.abs(x).toPrecision(15))) * Math.sign(x);
  return r === 0 ? 0 : r; // jamais -0
}
/** Arrondi au centime (en euros) : 1,005 donne 1,01 ; -1,005 donne -1,01. */
export function arrondiCentime(x) {
  const c = arrondiDemi(x * 100);
  return c === 0 ? 0 : c / 100;
}
/** Euros vers centimes entiers. */
export const versCentimes = (euros) => arrondiDemi(euros * 100);
/** Centimes entiers vers euros. */
export const versEuros = (centimes) => (centimes === 0 ? 0 : centimes / 100);
/** Total d'une ligne : quantité × prix de vente unitaire, arrondi au centime (ligne par ligne). */
export function totalLigne(quantite, prixVenteUnitaire) {
  if (!estNombre(quantite) || !estNombre(prixVenteUnitaire)) return 0;
  return versEuros(arrondiDemi(quantite * versCentimes(prixVenteUnitaire)));
}

// ---------------------------------------------------------------- marge
/** Coefficient d'une marge. Jamais d'exception : `{ coefficient, erreur }`. Une marge négative est acceptée. */
export function coefficientDeMarge(marge, mode) {
  if (!estNombre(marge)) return { coefficient: null, erreur: 'La marge doit être un nombre.' };
  if (mode === 'majoration') return { coefficient: 1 + marge / 100, erreur: null };
  if (mode === 'marge_vente') {
    if (marge >= 100) return { coefficient: null, erreur: ERREUR_MARGE_100 };
    return { coefficient: 1 / (1 - marge / 100), erreur: null };
  }
  return { coefficient: null, erreur: 'Le mode de marge est inconnu.' };
}

/** Prix de vente unitaire = prix d'achat × coefficient, arrondi au centime. Null si la marge est invalide. */
export function prixVenteUnitaire(prixAchat, marge, mode) {
  const { coefficient } = coefficientDeMarge(marge, mode);
  if (coefficient === null || !estNombre(prixAchat)) return null;
  return arrondiCentime(prixAchat * coefficient);
}

/** La marge la plus précise l'emporte : ligne, puis section, puis devis. Absente = on remonte ; 0 est une vraie valeur. */
export function margeEffective({ devis, section, ligne } = {}) {
  return [ligne?.marge, section?.marge, devis?.marge].find((v) => !absent(v)) ?? 0;
}

/** Prix de vente unitaire d'une ligne : le prix figé s'il existe (devis finalisé), sinon calculé. Null si impossible. */
export function prixVenteDeLigne(devis, section, ligne) {
  // Un brouillon se recalcule toujours : un prix figé périmé (restauration, copie) n'est pas honoré.
  if (devis?.statut !== 'brouillon' && estNombre(ligne?.prixVente)) return ligne.prixVente;
  return prixVenteUnitaire(ligne?.prixAchat, margeEffective({ devis, section, ligne }), devis?.modeMarge);
}

// ---------------------------------------------------------------- ajustement global (coefficient interne, jamais montré au client)
/** Coefficient de l'ajustement global du devis : `devis.ajustement.coefficient` ; absent, illisible ou ≤ 0 = 1 (aucun ajustement). */
export function coefficientAjustement(devis) {
  const c = devis?.ajustement?.coefficient;
  return estNombre(c) && c > 0 ? c : 1;
}
/** Un ajustement est-il actif ? (coefficient différent de 1) */
export const ajustementActif = (devis) => coefficientAjustement(devis) !== 1;
/** Prix de vente unitaire ajusté : prix × coefficient, arrondi au centime. Sans ajustement, le prix tel quel. */
export function prixAjuste(prixVente, coefficient) {
  if (!estNombre(prixVente)) return null;
  return coefficient === 1 || !estNombre(coefficient) ? prixVente : arrondiCentime(prixVente * coefficient);
}
/** Copie du devis sans son ajustement (ni les prix ajustés figés) : sert à calculer le total « avant ». */
function sansAjustement(devis) {
  return { ...devis, ajustement: undefined, sections: (devis?.sections ?? []).map((s) => ({ ...s, lignes: (s.lignes ?? []).map(({ prixVenteAjuste: _p, ...l }) => l) })) };
}
/** Prix de vente unitaire AJUSTÉ d'une ligne (celui qui sert aux totaux et au client). Un devis finalisé garde le prix ajusté figé à la finalisation. */
export function prixVenteAjusteDeLigne(devis, section, ligne) {
  const base = prixVenteDeLigne(devis, section, ligne);
  if (base === null) return null;
  if (devis?.statut !== 'brouillon' && estNombre(ligne?.prixVenteAjuste)) return ligne.prixVenteAjuste;
  return prixAjuste(base, coefficientAjustement(devis));
}
/**
 * Les trois valeurs liées de l'ajustement : pourcentage, montant (différence des totaux HT bruts, avant remise) et coefficient.
 * Un devis sans ajustement donne { pourcentage: 0, montant: 0, coefficient: 1 }.
 */
export function valeursAjustement(devis) {
  const coefficient = coefficientAjustement(devis);
  const avant = totauxDevis(sansAjustement(devis)).totalBrutHt;
  const apres = totauxDevis(devis).totalBrutHt;
  return { coefficient, pourcentage: arrondiCentime((coefficient - 1) * 100), montant: arrondiCentime(apres - avant), totalAvant: avant, totalApres: apres };
}
/** Coefficient (4 décimales) d'un pourcentage d'ajustement. { coefficient, erreur } : erreur si le résultat est ≤ 0. */
export function coefficientDepuisPourcentage(pourcentage) {
  if (!estNombre(pourcentage)) return { coefficient: null, erreur: 'Écris un pourcentage (exemple : 10 ou -5,5).' };
  const coefficient = Math.round((1 + pourcentage / 100) * 10000) / 10000;
  return coefficient > 0 ? { coefficient, erreur: null } : { coefficient: null, erreur: 'Le pourcentage doit laisser un prix supérieur à 0 (pas moins de -100 %).' };
}
/** Coefficient (4 décimales) qui ajoute `montant` euros au total HT brut du devis (sans son ajustement actuel). */
export function coefficientDepuisMontant(devis, montant) {
  if (!estNombre(montant)) return { coefficient: null, erreur: 'Écris un montant en euros (exemple : 150 ou -20,50).' };
  const avant = totauxDevis(sansAjustement(devis)).totalBrutHt;
  if (!(avant > 0)) return { coefficient: null, erreur: 'Le devis n’a pas encore de total : ajoute d’abord des lignes avec un prix.' };
  const coefficient = Math.round(((avant + montant) / avant) * 10000) / 10000;
  return coefficient > 0 ? { coefficient, erreur: null } : { coefficient: null, erreur: 'Ce montant ferait tomber le total à 0 € ou moins : choisis un montant plus petit.' };
}
/** Coefficient écrit directement : doit être un nombre > 0 (arrondi à 4 décimales). */
export function coefficientDepuisSaisie(coefficient) {
  if (!estNombre(coefficient)) return { coefficient: null, erreur: 'Écris un coefficient (exemple : 1,10).' };
  if (!(coefficient > 0)) return { coefficient: null, erreur: 'Le coefficient doit être plus grand que 0 (exemple : 1,10).' };
  return { coefficient: Math.round(coefficient * 10000) / 10000, erreur: null };
}

// ---------------------------------------------------------------- affichage du devis (cases du menu « Options »)
/** Valeurs d'un devis qui a un objet `affichage` (les cases non écrites sont décochées). */
export const AFFICHAGE_DEFAUT = Object.freeze({
  afficherMarges: false, afficherReferences: false, cacherDechets: false,
  cacherTotauxSections: false, cacherQuantiteUnite: false, cacherTva: false, cacherElementsOuvrage: false, afficherPrixElementsOuvrage: false, cacherResteAFacturer: false,
  afficherTelephone: false, afficherEmail: true, afficherNumeroTva: false, afficherSiren: false,
});
/** Affichage d'un devis. Un ancien devis (sans `affichage`) garde l'affichage d'avant : le calcul des marges est visible. */
export function affichageDe(devis) {
  const brut = devis?.affichage;
  if (!brut || typeof brut !== 'object') return { ...AFFICHAGE_DEFAUT, afficherMarges: true, afficherEmail: false };
  // Une case jamais écrite dans ce devis prend sa valeur d'origine (e-mail du client affiché, le reste décoché).
  return Object.fromEntries(Object.keys(AFFICHAGE_DEFAUT).map((k) => [k, k in brut ? brut[k] === true : AFFICHAGE_DEFAUT[k]]));
}

/** Mention « vendu à perte » (jamais un blocage). Le prix de vente vient de la ligne figée, ou du 2e paramètre. */
export function estVendueAPerte(ligne, prixVente = ligne?.prixVente) {
  return estNombre(prixVente) && estNombre(ligne?.prixAchat) && prixVente < ligne.prixAchat;
}

// ---------------------------------------------------------------- totaux
const tauxDeLigne = (devis, ligne) => {
  if (estNombre(ligne?.tauxTva)) return ligne.tauxTva;
  if (estNombre(devis?.tauxTvaDefaut)) return devis.tauxTvaDefaut;
  return TAUX_TVA_DEFAUT[0];
};

/**
 * Remise d'un devis en centimes, pour un total HT brut donné. Une remise absente, nulle ou invalide vaut 0
 * (la validation de finalisation, elle, refuse les remises invalides : voir `erreurRemise`).
 */
function remiseEnCentimes(remise, brutC) {
  if (!remise || typeof remise !== 'object' || !estNombre(remise.valeur) || brutC <= 0) return 0;
  if (remise.type === 'pourcentage') return remise.valeur > 0 && remise.valeur < 100 ? arrondiDemi(brutC * remise.valeur / 100) : 0;
  if (remise.type === 'montant') { const c = versCentimes(remise.valeur); return c > 0 && c <= brutC ? c : 0; }
  return 0;
}

/** Message d'erreur si la remise du devis est refusée, sinon null. Absente (null) ou 0 : acceptée. */
function erreurRemise(devis, brutHt) {
  const r = devis.remise;
  if (absent(r)) return null;
  if (typeof r !== 'object' || !TYPES_REMISE.includes(r.type)) return 'La remise doit être un pourcentage ou un montant.';
  if (!estNombre(r.valeur)) return 'La valeur de la remise doit être un nombre.';
  if (r.type === 'pourcentage' && (r.valeur < 0 || r.valeur >= 100)) return 'La remise en pourcentage doit être comprise entre 0 et 100 % (100 % exclu).';
  if (r.type === 'montant' && r.valeur < 0) return 'Le montant de la remise ne peut pas être négatif.';
  if (r.type === 'montant' && versCentimes(r.valeur) > versCentimes(brutHt)) return 'Le montant de la remise ne peut pas dépasser le total HT du devis.';
  return null;
}

// ---- conditions : acompte, primes, retenue de garantie (tous facultatifs ; une valeur invalide compte pour 0 ici, la finalisation la refuse)
const objet = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const texteNonVide = (v) => typeof v === 'string' && v.trim() !== '';

/** Montant français : 3 451,63 € (espaces insécables). Utilisé par les libellés prêts à imprimer et par le document. */
export function montantFr(n) {
  const c = Math.round(Math.abs(Number.isFinite(n) ? n : 0) * 100);
  const entier = String(Math.floor(c / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0');
  return `${n < 0 && c !== 0 ? '-' : ''}${entier},${String(c % 100).padStart(2, '0')}\u00a0€`;
}
/** Pourcentage à deux décimales : 30,00 %. */
const pourcent2 = (n) => `${(Math.round(n * 100) / 100).toFixed(2).replace('.', ',')}\u00a0%`;
/** Date AAAA-MM-JJ vers JJ/MM/AAAA. */
const dateFrDe = (j) => `${j.slice(8, 10)}/${j.slice(5, 7)}/${j.slice(0, 4)}`;

/**
 * Liste des acomptes d'un devis, sans migration : `devis.acomptes` s'il existe (tableau, même vide), sinon l'ancien acompte unique
 * `devis.acompte` converti (`pourcentage` reste `pourcentage`, `montant` devient `montantTtc`) en liste d'un élément, sinon [].
 */
export function listeAcomptes(devis) {
  if (Array.isArray(devis?.acomptes)) return devis.acomptes;
  const a = devis?.acompte;
  if (absent(a)) return [];
  if (!objet(a)) return [a];
  return [{ ...a, type: a.type === 'montant' ? 'montantTtc' : a.type }];
}

/**
 * Un acompte en centimes, avant toute vérification de somme : `c` (arrondi au demi-centime) et `exact` (non arrondi), ou null si l'acompte est illisible.
 * € HT : le montant est converti en TTC en appliquant le rapport Total TTC / Total HT net du devis (la TVA se répartit au prorata), arrondi au centime ;
 * rapport = 1 si le devis est vide (net à 0) ou en franchise de TVA (TTC = HT).
 */
function acompteBrut(a, ttcC, netC) {
  if (!objet(a) || !estNombre(a.valeur) || a.valeur <= 0 || ttcC <= 0) return null;
  let exact;
  if (a.type === 'pourcentage') { if (a.valeur > 100) return null; exact = ttcC * (Math.round(a.valeur * 100) / 100) / 100; }
  else if (a.type === 'montantTtc') exact = versCentimes(a.valeur);
  else if (a.type === 'montantHt') exact = versCentimes(a.valeur) * (netC > 0 ? ttcC / netC : 1);
  else return null;
  const c = a.type === 'montantTtc' ? exact : arrondiDemi(exact);
  return c > 0 || a.type === 'pourcentage' ? { c, exact } : null;
}
/**
 * Acomptes en centimes (null = illisible ou plus grand que le Total TTC), dans l'ordre de la liste.
 * Arrondi : chaque pourcentage est arrondi au demi-centime ; quand le total exact des acomptes tombe sur un nombre entier de centimes
 * (ex. 33,33 % + 33,33 % + 33,34 % = 100 %) ou que les arrondis feraient dépasser le TTC, le DERNIER acompte en % absorbe la différence
 * (même idée que le « plus fort reste » de la remise) : la somme est alors exacte au centime et ne dépasse jamais le TTC.
 */
function acomptesCalcules(liste, ttcC, netC) {
  const bruts = liste.map((a) => acompteBrut(a, ttcC, netC));
  const c = bruts.map((b) => (b && b.c <= ttcC ? b.c : null));
  const valides = c.map((x, i) => (x === null ? -1 : i)).filter((i) => i >= 0);
  const somme = valides.reduce((s, i) => s + c[i], 0);
  const exacte = valides.reduce((s, i) => s + bruts[i].exact, 0);
  const entier = Math.round(exacte);
  const cible = Math.abs(exacte - entier) < 1e-6 ? entier : (somme > ttcC && exacte <= ttcC + 1e-6 ? ttcC : somme);
  const dernierPct = [...valides].reverse().find((i) => liste[i].type === 'pourcentage');
  if (dernierPct !== undefined && cible !== somme && c[dernierPct] + cible - somme >= 0) c[dernierPct] += cible - somme;
  return c;
}
/** Acomptes retenus dans les totaux : { acompte, c } dans l'ordre ; ceux qui feraient dépasser le Total TTC (ou illisibles) sont laissés de côté. */
function acomptesRetenus(liste, ttcC, netC) {
  const calc = acomptesCalcules(liste, ttcC, netC);
  let cumul = 0;
  const sortie = [];
  liste.forEach((acompte, i) => {
    if (calc[i] === null || cumul + calc[i] > ttcC) return;
    cumul += calc[i];
    sortie.push({ acompte, c: calc[i], index: i });
  });
  return sortie;
}
/**
 * Un élément par acompte de la liste (même ordre) : { acompte, montantTtc } ; montantTtc est null quand l'acompte est illisible ou ne tient pas dans le Total TTC.
 * Sert à l'écran (le montant TTC de chaque ligne) : les mêmes montants que les totaux et le PDF.
 */
export function detailAcomptes(devis) {
  const t = totauxDevis(devis);
  const retenus = acomptesRetenus(listeAcomptes(devis), versCentimes(t.ttc), versCentimes(t.ht));
  return listeAcomptes(devis).map((acompte, i) => {
    const r = retenus.find((x) => x.index === i);
    return { acompte, montantTtc: r ? versEuros(r.c) : null };
  });
}
/**
 * Règles des acomptes, UNE seule fois pour le formulaire de l'éditeur et pour la finalisation : [{ index, message }] (un message au plus par acompte).
 * `totaux` = { ttc, ht } (ceux de totauxDevis). Rien d'absent n'est une erreur.
 */
export function erreursAcomptes(acomptes, totaux) {
  const liste = Array.isArray(acomptes) ? acomptes : [];
  const ttcC = versCentimes(totaux?.ttc ?? 0);
  const netC = versCentimes(totaux?.ht ?? 0);
  const calc = acomptesCalcules(liste, ttcC, netC);
  const e = [];
  let cumul = 0;
  let cumulPct = 0;
  liste.forEach((a, index) => {
    const dire = (message) => e.push({ index, message });
    if (!objet(a) || !TYPES_ACOMPTE.some((x) => x.id === a.type)) return dire('Le type de l\'acompte doit être un pourcentage ou un montant (HT ou TTC).');
    if (!estNombre(a.valeur)) return dire('La valeur de l\'acompte doit être un nombre.');
    if (a.type === 'pourcentage' && (a.valeur <= 0 || a.valeur > 100)) return dire('L\'acompte en pourcentage doit être supérieur à 0 et au plus 100 %.');
    if (a.type !== 'pourcentage' && versCentimes(a.valeur) <= 0) return dire('Le montant de l\'acompte doit être supérieur à zéro.');
    if (!MOMENTS_ACOMPTE.some((m) => m.id === a.moment)) return dire('Choisis le moment de l\'acompte (signature, début des travaux, moitié des travaux ou texte libre).');
    if (a.moment === 'libre' && !texteNonVide(a.texteMoment)) return dire('Écris le moment de l\'acompte (texte libre).');
    const brut = acompteBrut(a, ttcC, netC);
    if (a.type !== 'pourcentage' && (!brut || brut.c > ttcC)) return dire('Le montant de l\'acompte ne peut pas dépasser le total TTC du devis.');
    if (a.type === 'pourcentage') {
      cumulPct += Math.round(a.valeur * 100);
      if (cumulPct > 10000) return dire('La somme des acomptes dépasse 100 %.');
    }
    if (calc[index] !== null) {
      cumul += calc[index];
      if (cumul > ttcC) return dire('La somme des acomptes dépasse le total TTC du devis.');
    }
  });
  return e;
}
/** Texte du moment de l'acompte, ou null s'il est inconnu ou si le moment libre n'a pas de texte. */
function momentAcompte(a) {
  if (a?.moment === 'libre') return texteNonVide(a.texteMoment) ? a.texteMoment.trim() : null;
  return MOMENTS_ACOMPTE.find((m) => m.id === a?.moment && m.id !== 'libre')?.libelle ?? null;
}
/** Primes valides : libellé non vide et montant > 0 (un montant nul n'est pas listé). */
function primesValides(devis) {
  if (!Array.isArray(devis?.primes)) return [];
  return devis.primes.filter((p) => objet(p) && texteNonVide(p.libelle) && estNombre(p.montant) && versCentimes(p.montant) > 0)
    .map((p) => ({ libelle: p.libelle.trim(), montant: versEuros(versCentimes(p.montant)) }));
}
/** Retenue de garantie en centimes sur le Total TTC (0 si absente ou invalide). */
function retenueEnCentimes(r, ttcC) {
  if (!objet(r) || !estNombre(r.pourcentage) || r.pourcentage <= 0 || r.pourcentage >= 100 || ttcC <= 0) return 0;
  return arrondiDemi(ttcC * (Math.round(r.pourcentage * 100) / 100) / 100);
}

/**
 * Niveau d'une section : 2 pour une sous-section (`niveau: 2`), rattachée à la section de niveau 1 qui la précède ; 1 sinon. Les anciens devis n'ont pas de `niveau` : tout est de niveau 1.
 * Une sous-section en tête de liste (aucune section avant elle) n'a personne à qui se rattacher : elle compte comme une section de niveau 1.
 */
export const niveauSection = (sections, i) => (i > 0 && sections?.[i]?.niveau === 2 ? 2 : 1);

/** Un saut de page est une ligne spéciale `{ id, type: 'saut' }` : sans prix, sans quantité, sans numéro, hors totaux, TVA et compteurs. */
export const TYPE_SAUT = 'saut';
export const estSaut = (ligne) => ligne?.type === TYPE_SAUT;

/**
 * Numéros d'un devis : un tableau par section, { numero, lignes: [numéro de chaque ligne] }.
 * Section « 1 », sous-section « 1.1 », ligne « 1.1.1 ». Dans une section de niveau 1, les lignes posées avant la première sous-section et les sous-sections
 * partagent le même compteur (ligne 1.1, sous-section 1.2, dont les lignes sont 1.2.1…). Sans sous-section : « 1 » puis « 1.1 », « 1.2 », comme avant.
 */
export function numerosDevis(sections) {
  const liste = Array.isArray(sections) ? sections : [];
  let n1 = 0;
  let enfants = 0;
  let racine = '';
  let prefixe = '';
  let ligneDansSection = 0;
  return liste.map((s, i) => {
    let numero;
    if (niveauSection(liste, i) === 1) { n1 += 1; enfants = 0; racine = String(n1); numero = racine; } else { enfants += 1; numero = `${racine}.${enfants}`; }
    prefixe = numero;
    ligneDansSection = 0;
    return {
      numero,
      lignes: (s?.lignes ?? []).map((l) => {
        if (estSaut(l)) return null; // un saut de page n'a pas de numéro et ne fait pas avancer le compteur
        // Ligne posée directement sous une section de niveau 1 : elle prend le prochain numéro du compteur partagé (1.1, 1.2…).
        if (niveauSection(liste, i) === 1) { enfants += 1; return `${racine}.${enfants}`; }
        ligneDansSection += 1;
        return `${prefixe}.${ligneDansSection}`;
      }),
    };
  });
}

/** Totaux d'un devis, tout en euros, calculés en centimes. Les lignes invalides comptent pour 0 (la validation les signale). */
export function totauxDevis(devis) {
  const franchise = devis?.regimeTva === 'franchise';
  const autoliquidation = devis?.autoliquidation === true;
  const sansTva = franchise || autoliquidation;
  const sections = [];
  const lignes = [];
  const baseParTaux = new Map(); // taux -> centimes HT
  const propresC = []; // centimes des seules lignes de chaque section
  let htC = 0;
  for (const section of devis?.sections ?? []) {
    let sousC = 0;
    for (const ligne of section.lignes ?? []) {
      if (estSaut(ligne)) { lignes.push({ id: ligne.id, prixVenteUnitaire: null, totalHT: 0, venduAPerte: false }); continue; } // hors totaux et hors TVA ; la place reste tenue pour garder l'ordre des lignes
      const pv = prixVenteAjusteDeLigne(devis, section, ligne);
      const totalC = pv === null ? 0 : arrondiDemi((estNombre(ligne.quantite) ? ligne.quantite : 0) * versCentimes(pv));
      sousC += totalC;
      const taux = tauxDeLigne(devis, ligne);
      baseParTaux.set(taux, (baseParTaux.get(taux) ?? 0) + totalC);
      lignes.push({ id: ligne.id, prixVenteUnitaire: pv, totalHT: versEuros(totalC), venduAPerte: estVendueAPerte(ligne, pv ?? undefined) });
    }
    htC += sousC;
    propresC.push(sousC);
    sections.push({ id: section.id, sousTotalHT: versEuros(sousC) });
  }
  // Le sous-total d'une section de niveau 1 compte ses lignes ET celles de ses sous-sections (rien n'est compté deux fois dans le total du devis).
  const toutes = devis?.sections ?? [];
  let parent = -1;
  toutes.forEach((s, i) => {
    if (niveauSection(toutes, i) === 1) { parent = i; return; }
    sections[parent].sousTotalHT = versEuros(versCentimes(sections[parent].sousTotalHT) + propresC[i]);
  });
  // Remise : après la marge et les sous-totaux, sur le total HT, répartie au prorata de chaque base de TVA.
  // Plus fort reste : chaque part est tronquée au centime, puis les centimes restants vont aux plus grands restes
  // (à égalité, au taux le plus élevé) : la somme des bases remisées vaut exactement net HT, sans base qui dépasse son brut.
  const remiseC = remiseEnCentimes(devis?.remise, htC);
  const netC = htC - remiseC;
  const entrees = [...baseParTaux.entries()].sort((a, b) => b[0] - a[0]);
  const exact = entrees.map(([, baseC]) => (remiseC === 0 || htC === 0 ? 0 : remiseC * baseC / htC));
  const parts = exact.map((x) => Math.floor(x + 1e-9));
  let reste = remiseC - parts.reduce((a, b) => a + b, 0);
  const ordre = exact.map((x, k) => k).sort((i, j) => (exact[j] - parts[j]) - (exact[i] - parts[i]) || i - j);
  for (let n = 0; reste > 0 && ordre.length; n += 1, reste -= 1) parts[ordre[n % ordre.length]] += 1;
  const tvaParTaux = sansTva ? [] : entrees
    .map(([taux, baseC], k) => ({ taux, baseHT: versEuros(baseC - parts[k]), montant: versEuros(arrondiDemi((baseC - parts[k]) * taux / 100)) }));
  const tvaC = tvaParTaux.reduce((s, t) => s + versCentimes(t.montant), 0);
  const mentions = [];
  if (franchise) mentions.push(MENTION_FRANCHISE);
  if (autoliquidation) mentions.push(MENTION_AUTOLIQUIDATION);
  // Conditions de paiement : l'acompte et le reste se lisent sur le Total TTC ; primes et retenue se déduisent du Net à payer.
  const ttcC = netC + tvaC;
  const retenus = acomptesRetenus(listeAcomptes(devis), ttcC, netC);
  const acompteC = retenus.length ? retenus.reduce((x, r) => x + r.c, 0) : null;
  const primes = primesValides(devis);
  const primesC = primes.reduce((s, p) => s + versCentimes(p.montant), 0);
  const retenueC = retenueEnCentimes(devis?.retenueGarantie, ttcC);
  return {
    sections, lignes, totalBrutHt: versEuros(htC), remiseHt: versEuros(remiseC), totalHt: versEuros(netC),
    ht: versEuros(netC), tvaParTaux, tva: versEuros(tvaC), ttc: versEuros(ttcC), mentions,
    acompteTtc: acompteC === null ? null : versEuros(acompteC), // somme de tous les acomptes
    acomptesTtc: retenus.map((r) => versEuros(r.c)), // un montant TTC par acompte retenu, dans l'ordre
    resteAFacturerTtc: acompteC === null ? null : versEuros(ttcC - acompteC),
    primes, totalPrimes: versEuros(primesC), retenueGarantieMontant: versEuros(retenueC),
    netAPayer: versEuros(Math.max(0, ttcC - primesC - retenueC)),
  };
}

/** Totaux de ligne rangés par section puis par position (les lignes n'ont pas forcément d'id unique). */
const parPosition = (devis, t) => {
  let k = 0;
  return (devis.sections ?? []).map((s) => (s.lignes ?? []).map(() => t.lignes[k++]));
};

// ---------------------------------------------------------------- dates, numéro, expiration
/** Jour calendaire AAAA-MM-JJ d'une date (Date ou texte ISO). Null si illisible. */
function jourDe(v) {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : aujourdhuiParis(v);
  if (typeof v === 'string' && v.includes('T')) return jourDe(new Date(v));
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) return estJour(v.slice(0, 10)) ? v.slice(0, 10) : null;
  return null;
}

/** Date d'expiration (AAAA-MM-JJ) = jour de création + n jours. Null si la date est illisible. */
export function dateExpiration(creeLeISO, jours = DUREE_VALIDITE_DEFAUT) {
  const jour = jourDe(creeLeISO);
  if (!jour || !estNombre(jours)) return null;
  return ajouterJours(jour, Math.trunc(jours));
}

/** Numéro `DEV-AAAA-MM-JJ-NNN` (3 chiffres au moins). La date est donnée, jamais lue sur l'horloge. */
export function numeroDevis(dateISO, compteur) {
  if (!estJour(dateISO) || !Number.isInteger(compteur) || compteur < 1) return null;
  return `DEV-${dateISO}-${String(compteur).padStart(3, '0')}`;
}

/** Vrai si le devis attend une réponse et que sa date de validité est dépassée (comparaison de textes AAAA-MM-JJ). Ne modifie rien. */
export function estExpire(devis, aujourdhui) {
  if (!['en_attente_envoi', 'envoye'].includes(devis?.statut)) return false;
  return estJour(devis?.expireLe) && estJour(aujourdhui) && devis.expireLe < aujourdhui;
}

// ---------------------------------------------------------------- statuts et transitions
/** Table des actions : statuts de départ permis et statut d'arrivée (null = le statut ne change pas). */
export const TRANSITIONS = {
  finaliser: { de: ['brouillon'], vers: 'en_attente_envoi' },
  marquer_envoye: { de: ['en_attente_envoi'], vers: 'envoye' },
  accepter: { de: ['envoye'], vers: 'accepte' },
  refuser: { de: ['envoye'], vers: 'refuse' },
  remplacer: { de: ['en_attente_envoi', 'envoye'], vers: 'remplace' },
  // Crée un nouveau brouillon ; la version de départ ne change pas de statut ici.
  nouvelle_version: { de: ['en_attente_envoi', 'envoye', 'refuse'], vers: null },
  // L'archive n'est pas un statut : c'est le drapeau `archive`.
  archiver: { de: ['accepte', 'refuse'], vers: null },
};

export function transitionPossible(statut, action) {
  const t = TRANSITIONS[action];
  return Boolean(t) && t.de.includes(statut);
}
/** Statut d'arrivée d'une action (null si l'action ne change pas le statut ou si elle est refusée). */
export function statutApres(statut, action) {
  return transitionPossible(statut, action) ? TRANSITIONS[action].vers : null;
}
/** Un devis accepté ou refusé, pas déjà archivé, peut être archivé. */
export function peutArchiver(devis) {
  return devis?.archive !== true && transitionPossible(devis?.statut, 'archiver');
}

// ---------------------------------------------------------------- validation de finalisation
const EMAIL = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]{2,}$/;
const emailDe = (d) => (typeof d === 'string' ? d : d?.email ?? '').trim();
export const emailValide = (s) => EMAIL.test(String(s ?? '').trim());

/** Messages pour l'acompte, les primes, la retenue de garantie, les déchets, les textes. Rien d'absent n'est une erreur. */
function erreursConditions(devis, t) {
  const e = [];
  const ttcC = versCentimes(t.ttc);
  if (!absent(devis.acomptes) && !Array.isArray(devis.acomptes)) e.push('Les acomptes doivent former une liste.');
  else for (const { index, message } of erreursAcomptes(listeAcomptes(devis), t)) e.push(`Acompte n° ${index + 1} : ${message}`);
  if (!absent(devis.primes)) {
    if (!Array.isArray(devis.primes)) e.push('Les primes doivent former une liste.');
    else {
      for (const p of devis.primes) {
        if (!objet(p) || !texteNonVide(p.libelle)) e.push('Une prime n\'a pas de libellé : écris son nom (par exemple « Prime rénov »).');
        if (!objet(p) || !estNombre(p.montant)) e.push(`Prime « ${objet(p) && p.libelle ? p.libelle : 'sans libellé'} » : le montant doit être un nombre.`);
        else if (p.montant < 0) e.push(`Prime « ${p.libelle || 'sans libellé'} » : le montant ne peut pas être négatif.`);
      }
      const idsPrimes = devis.primes.filter(objet).map((p) => p.id).filter((id) => !absent(id) && id !== '');
      if (new Set(idsPrimes).size !== idsPrimes.length) e.push('Deux primes ont le même identifiant : recharge le devis ou recrée l\'une d\'elles.');
    }
  }
  const r = devis.retenueGarantie;
  if (!absent(r)) {
    if (!objet(r) || !estNombre(r.pourcentage) || r.pourcentage < 0 || r.pourcentage >= 100) e.push('La retenue de garantie doit être un pourcentage compris entre 0 et 100 % (100 % exclu).');
    if (objet(r) && estNombre(r.pourcentage) && r.pourcentage > 0 && !estJour(r.echeance)) e.push('La date de fin de la retenue de garantie est illisible : indique une date valide.');
  }
  const net = ttcC - versCentimes(t.totalPrimes) - versCentimes(t.retenueGarantieMontant);
  if (net < 0) e.push('Les primes et la retenue de garantie dépassent le total TTC : le net à payer serait négatif.');
  const d = devis.dechets;
  if (!absent(d)) {
    if (!objet(d)) e.push('Les informations sur les déchets sont invalides.');
    else {
      if (!absent(d.types) && (!Array.isArray(d.types) || d.types.some((x) => !TYPES_DECHETS.some((y) => y.id === x)))) e.push('Un type de déchets est inconnu.');
      if (!absent(d.pointCollecte) && typeof d.pointCollecte !== 'string') e.push('Le point de collecte des déchets doit être un texte.');
      for (const [cle, nom] of [['volumeMin', 'Le volume minimum de déchets'], ['volumeMax', 'Le volume maximum de déchets'], ['coutTtcParM3', 'Le coût des déchets par m³']]) {
        if (!absent(d[cle]) && (!estNombre(d[cle]) || d[cle] < 0)) e.push(`${nom} doit être un nombre positif ou nul.`);
      }
      if (estNombre(d.volumeMin) && estNombre(d.volumeMax) && d.volumeMin > d.volumeMax) e.push('Le volume minimum de déchets dépasse le volume maximum.');
      if (!absent(d.unite) && d.unite !== 'm3') e.push('L\'unité du volume de déchets doit être le m³.');
    }
  }
  if (!absent(devis.texteLibre) && typeof devis.texteLibre !== 'string') e.push('Le texte libre du devis doit être un texte.');
  if (!absent(devis.notesBasDePage) && typeof devis.notesBasDePage !== 'string') e.push('Les notes de bas de page doivent être un texte.');
  else if (typeof devis.notesBasDePage === 'string' && devis.notesBasDePage.length > 2000) e.push('Les notes de bas de page sont trop longues (2 000 caractères au plus).');
  return e;
}

// ---------------------------------------------------------------- chantier (adresse, dates, durée) et émetteur
/** Unités de durée du chantier : singulier, pluriel (le « mois » ne change pas). */
export const UNITES_DUREE = [
  { id: 'heure', singulier: 'heure', pluriel: 'heures' },
  { id: 'jour', singulier: 'jour', pluriel: 'jours' },
  { id: 'semaine', singulier: 'semaine', pluriel: 'semaines' },
  { id: 'mois', singulier: 'mois', pluriel: 'mois' },
  { id: 'annee', singulier: 'an', pluriel: 'ans' },
];
const deuxDecimalesAuPlus = (v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-9;

/** Durée imprimable : « 1 semaine », « 3 semaines », « 1,5 jour » (pluriel à partir de 2). Null si illisible. */
export function dureeEnTexte(d) {
  const u = objet(d) ? UNITES_DUREE.find((x) => x.id === d.unite) : null;
  if (!u || !estNombre(d.valeur) || d.valeur <= 0) return null;
  return `${nombre(d.valeur)} ${d.valeur >= 2 ? u.pluriel : u.singulier}`;
}

/** Messages pour le bloc `chantier` (facultatif : absent = aucune erreur). Un message par problème. */
export function erreursChantier(chantier) {
  const e = [];
  if (absent(chantier)) return e;
  if (!objet(chantier)) return ['Les informations du chantier sont invalides.'];
  const a = chantier.adresse;
  if (!absent(a)) {
    if (!objet(a)) e.push('L\'adresse du chantier est invalide.');
    else if (!absent(a.codePostal) && a.codePostal !== '' && !/^\d{5}$/.test(String(a.codePostal))) e.push('Le code postal du chantier doit avoir 5 chiffres.');
  }
  const debutOk = absent(chantier.debutTravaux) || chantier.debutTravaux === '' ? null : estJour(chantier.debutTravaux);
  if (debutOk === false) e.push('La date de début des travaux est illisible : indique une date valide.');
  const finOk = absent(chantier.finChantierAu) || chantier.finChantierAu === '' ? null : estJour(chantier.finChantierAu);
  if (finOk === false) e.push('La date de fin de chantier est illisible : indique une date valide.');
  if (debutOk && finOk && chantier.finChantierAu < chantier.debutTravaux) e.push('La fin de chantier ne peut pas être avant le début des travaux.');
  const d = chantier.dureeEstimee;
  if (!absent(d)) {
    if (!objet(d) || !estNombre(d.valeur) || d.valeur <= 0) e.push('La durée estimée du chantier doit être un nombre supérieur à zéro.');
    else if (!deuxDecimalesAuPlus(d.valeur)) e.push('La durée estimée du chantier ne peut pas avoir plus de deux décimales.');
    if (objet(d) && !UNITES_DUREE.some((u) => u.id === d.unite)) e.push('L\'unité de la durée du chantier est inconnue (heure, jour, semaine, mois ou année).');
  }
  return e;
}

/** Texte d'une adresse { ligne1, codePostal, ville } (ou texte simple). */
export function adresseEnTexte(a) {
  if (typeof a === 'string') return a.trim();
  if (!objet(a)) return '';
  if (typeof a.texte === 'string') return a.texte.trim();
  const fin = [a.codePostal, a.ville].filter((x) => texteNonVide(String(x ?? ''))).join(' ');
  return [a.ligne1, fin].filter((x) => texteNonVide(String(x ?? ''))).join('\n');
}

/** Bloc « Chantier » prêt à imprimer : seulement les lignes renseignées et lisibles. Null s'il n'y a rien. */
export function chantierDeVue(chantier) {
  if (!objet(chantier)) return null;
  const adresse = adresseEnTexte(chantier.adresse);
  const debut = estJour(chantier.debutTravaux) ? dateFrDe(chantier.debutTravaux) : '';
  const duree = dureeEnTexte(chantier.dureeEstimee);
  const fin = estJour(chantier.finChantierAu) ? dateFrDe(chantier.finChantierAu) : '';
  const lignes = [];
  if (adresse) lignes.push(adresse);
  if (debut) lignes.push(`Début des travaux : ${debut}`);
  if (duree) lignes.push(`Durée estimée : ${duree}`);
  if (fin) lignes.push(`Fin de chantier au plus tard le ${fin}`);
  if (!lignes.length) return null;
  return { adresse: adresse || null, debutTravaux: debut || null, dureeEstimee: duree, finChantierAu: fin || null, lignes };
}

/**
 * Mentions manquantes dans les réglages de l'entreprise (`emetteur`), pour un bandeau « mentions manquantes » et des champs en rouge.
 * Retourne `{ mentions, champs, nombre }` : `mentions` = messages en français, `champs` = clés en erreur
 * (nom, siret, adresse, email, telephone, assurance, mediateur). L'assurance n'est exigée que pour un métier du bâtiment
 * (option `metierBatiment`, ou `emetteur.metierBatiment`, vrai par défaut).
 */
export function erreursEmetteur(emetteur, { metierBatiment } = {}) {
  const e = objet(emetteur) ? emetteur : {};
  const mentions = [];
  const champs = [];
  const manque = (cle, message) => { champs.push(cle); mentions.push(message); };
  const plein = (v) => texteNonVide(String(v ?? ''));
  if (!plein(e.nom)) manque('nom', 'Le nom de l\'entreprise est manquant.');
  if (!plein(e.siret)) manque('siret', 'Le numéro SIRET est manquant.');
  if (!plein(adresseEnTexte(e.adresse))) manque('adresse', 'L\'adresse de l\'entreprise est manquante.');
  if (!plein(e.email) && !plein(e.telephone)) {
    champs.push('email', 'telephone');
    mentions.push('Indique au moins un e-mail ou un numéro de téléphone pour joindre l\'entreprise.');
  }
  const bati = metierBatiment ?? e.metierBatiment ?? true;
  const a = objet(e.assurance) ? e.assurance : {};
  if (bati && !(plein(a.garantie) && plein(a.assureur))) manque('assurance', 'L\'assurance professionnelle est incomplète : indique la garantie et l\'assureur.');
  const m = objet(e.mediateur) ? e.mediateur : {};
  if (!plein(m.nom) || !(plein(m.email) || plein(m.site))) manque('mediateur', 'Le médiateur de la consommation est incomplet : indique son nom et son e-mail ou son site.');
  return { mentions, champs, nombre: mentions.length };
}

/** Nombre maximum d'adresses e-mail en copie d'un devis (écran et serveur). */
export const MAX_COPIE = 10;

/** Liste de messages (en français, qui disent quoi faire). Vide = on peut finaliser. Aucun accès réseau ni base. */
export function erreursFinalisation(devis) {
  const erreurs = [];
  if (!devis) return ['Le devis est introuvable.'];
  if (devis.statut !== 'brouillon') erreurs.push('Ce devis est déjà finalisé : pour le corriger, crée la version suivante.');
  if (!idsModes.includes(devis.modeMarge)) erreurs.push('Choisis le mode de marge du devis.');
  if (!absent(devis.marge) && !estNombre(devis.marge)) erreurs.push('La marge du devis doit être un nombre.');
  const destinataires = (devis.destinataires ?? []).map(emailDe);
  // Pas d'adresse e-mail obligatoire : on peut imprimer le devis et le remettre en main propre ; l'adresse ne sert qu'à l'envoi par e-mail (à venir).
  if (destinataires.some((e) => e && !emailValide(e))) erreurs.push('Une adresse e-mail de destinataire n\'est pas valide : corrige-la.');
  if ((devis.copie ?? []).map(emailDe).some((e) => e && !emailValide(e))) erreurs.push('Une adresse e-mail en copie n\'est pas valide : corrige-la.');
  if ((devis.copie ?? []).length > MAX_COPIE) erreurs.push(`Il y a trop d'adresses e-mail en copie (${MAX_COPIE} au plus) : retires-en.`);
  // Une adresse ne peut pas être à la fois destinataire et en copie (même règle et mêmes mots que le serveur MCP, coeur/metier.js) : la première trouvée est nommée.
  const destinatairesMin = new Set(destinataires.filter(Boolean).map((e) => e.toLowerCase()));
  const double = (devis.copie ?? []).map(emailDe).find((e) => e && destinatairesMin.has(e.toLowerCase()));
  if (double !== undefined) erreurs.push(`L'adresse « ${double} » est déjà destinataire : elle ne peut pas être aussi en copie.`);
  const ids = (devis.sections ?? []).flatMap((s) => (s.lignes ?? []).filter((l) => !estSaut(l)).map((l) => l.id));
  if (ids.some((id) => absent(id) || id === '') || new Set(ids).size !== ids.length) erreurs.push('Une ligne du devis n\'a pas d\'identifiant unique : recharge le devis ou recrée cette ligne.');
  const lignes = (devis.sections ?? []).flatMap((s) => (s.lignes ?? []).filter((l) => !estSaut(l)).map((l) => ({ s, l })));
  if (lignes.length === 0) erreurs.push('Ajoute au moins une ligne au devis avant de le finaliser.');
  for (const { s, l } of lignes) {
    const nom = `« ${l.libelle || 'sans libellé'} »${s.titre ? ` (section « ${s.titre} »)` : ''}`;
    if (!estNombre(l.quantite) || l.quantite <= 0) erreurs.push(`Ligne ${nom} : indique une quantité supérieure à zéro.`);
    if (!estNombre(l.prixAchat)) erreurs.push(`Ligne ${nom} : indique le prix d'achat.`);
    else if (l.prixAchat < 0) erreurs.push(`Ligne ${nom} : le prix d'achat ne peut pas être négatif.`);
    const marge = margeEffective({ devis, section: s, ligne: l });
    if (!estNombre(marge)) erreurs.push(`Ligne ${nom} : la marge doit être un nombre.`);
    else if (idsModes.includes(devis.modeMarge)) {
      const { erreur } = coefficientDeMarge(marge, devis.modeMarge);
      if (erreur) erreurs.push(`Ligne ${nom} : ${erreur}`);
      else {
        const pv = prixVenteUnitaire(l.prixAchat, marge, devis.modeMarge);
        if (pv !== null && pv < 0) erreurs.push(`Ligne ${nom} : le prix de vente serait négatif, corrige la marge.`);
      }
    }
    if (!absent(l.tauxTva) && (!estNombre(l.tauxTva) || l.tauxTva < 0)) erreurs.push(`Ligne ${nom} : le taux de TVA n'est pas valide.`);
  }
  const erreurDeRemise = erreurRemise(devis, totauxDevis(devis).totalBrutHt);
  if (erreurDeRemise) erreurs.push(erreurDeRemise);
  erreurs.push(...erreursConditions(devis, totauxDevis(devis)));
  erreurs.push(...erreursChantier(devis.chantier));
  return erreurs;
}

// ---------------------------------------------------------------- création, figeage, nouvelle version
/** Document d'un devis neuf (brouillon, version 1). L'id, la date et l'auteur viennent de `ctx` (déterministe). */
export function nouveauDevis(valeurs = {}, ctx = {}, reglages = {}) {
  const id = ctx.nouvelId ? ctx.nouvelId('devis') : ctx.id;
  const creeLe = ctx.maintenant;
  const mode = idsModes.includes(valeurs.modeMarge) ? valeurs.modeMarge : (idsModes.includes(reglages.modeMarge) ? reglages.modeMarge : 'majoration');
  const marge = [valeurs.marge, reglages.marge].find((v) => estNombre(v)) ?? 0;
  const taux = [valeurs.tauxTvaDefaut, reglages.tauxTvaDefaut].find((v) => estNombre(v)) ?? TAUX_TVA_DEFAUT[0];
  const regime = REGIMES_TVA.some((r) => r.id === reglages.regimeTva) ? reglages.regimeTva : 'assujetti';
  const jours = estNombre(valeurs.dureeValiditeJours) ? valeurs.dureeValiditeJours
    : (estNombre(reglages.dureeValiditeJours) ? reglages.dureeValiditeJours : DUREE_VALIDITE_DEFAUT);
  return {
    id,
    racineId: id,
    version: 1,
    numero: null,
    statut: 'brouillon',
    affaireId: valeurs.affaireId || null,
    personneId: valeurs.personneId || null,
    organisationId: valeurs.organisationId || null,
    adresses: valeurs.adresses ?? { commanditaire: null, facturation: null, chantier: null },
    destinataires: valeurs.destinataires ?? [],
    copie: valeurs.copie ?? [],
    modeMarge: mode,
    marge,
    tauxTvaDefaut: taux,
    regimeTva: regime,
    autoliquidation: false,
    affichage: { afficherMarges: false }, // un devis neuf cache le calcul des marges ; un ancien devis sans `affichage` le montre
    sections: [],
    archive: false,
    creePar: ctx.auteur ?? '',
    proprietaire: ctx.proprietaire ?? ctx.auteur ?? '',
    creeLe,
    dureeValiditeJours: jours,
    expireLe: estJour(valeurs.expireLe) ? valeurs.expireLe : dateExpiration(creeLe, jours),
  };
}

/**
 * Fige un brouillon pour la finalisation : copie avec statut, numéro, régime de TVA, prix de vente et taux de chaque ligne, totaux.
 * Retourne `{ devis, erreurs }` : si le devis est invalide, `devis` est null et `erreurs` dit quoi corriger. L'original n'est pas modifié.
 */
export function figerPourFinalisation(devis, { numero, finaliseLe, reglages = {} } = {}) {
  const erreurs = erreursFinalisation(devis);
  if (!numero) erreurs.push('Le numéro du devis est manquant.');
  if (!REGIMES_TVA.some((r) => r.id === reglages.regimeTva)) erreurs.push('Choisis le régime de TVA dans les réglages du module.');
  if (erreurs.length) return { devis: null, erreurs };
  const copie = structuredClone(devis);
  copie.regimeTva = reglages.regimeTva;
  for (const section of copie.sections) {
    for (const ligne of section.lignes ?? []) {
      if (estSaut(ligne)) continue;
      ligne.prixVente = prixVenteDeLigne(copie, section, ligne);
      if (ajustementActif(copie)) ligne.prixVenteAjuste = prixAjuste(ligne.prixVente, coefficientAjustement(copie)); // le prix ajusté est figé lui aussi
      else delete ligne.prixVenteAjuste; // un ancien prix ajusté (copie d'un devis ajusté) ne doit pas survivre
      ligne.tauxTva = tauxDeLigne(copie, ligne);
    }
  }
  copie.statut = 'en_attente_envoi';
  copie.numero = numero;
  copie.finaliseLe = finaliseLe;
  copie.totaux = totauxDevis(copie);
  copie.finalisation = { n8n: 'en_cours' };
  return { devis: copie, erreurs: [] };
}

/** Nouveau brouillon copié d'un devis (même racine, version + 1, même numéro). L'original n'est pas modifié. */
export function nouvelleVersion(devis, { id, creeLe, joursValidite = devis?.dureeValiditeJours ?? DUREE_VALIDITE_DEFAUT } = {}) {
  const copie = structuredClone(devis);
  for (const cle of ['finaliseLe', 'envoyeLe', 'accepteLe', 'refuseLe', 'totaux', 'finalisation', 'envoiN8nCopie', 'raisonRefus', 'dateEmission', 'pdf', 'envois', 'emailPrepare']) delete copie[cle]; // `envois` : l'historique des envois par e-mail reste sur la version envoyée ; `emailPrepare` : le brouillon Gmail préparé était celui de l'ancienne version
  for (const section of copie.sections ?? []) for (const ligne of section.lignes ?? []) { delete ligne.prixVente; delete ligne.prixVenteAjuste; } // recalculés tant que brouillon
  return {
    ...copie,
    id,
    racineId: devis.racineId ?? devis.id,
    version: (devis.version ?? 1) + 1,
    statut: 'brouillon',
    numero: devis.numero ?? null,
    archive: false,
    creeLe,
    expireLe: dateExpiration(creeLe, joursValidite),
  };
}

// ---------------------------------------------------------------- vue client (JSON pour n8n)
const cleInterdite = (cle) => /marge|coefficient|prixachat|ajustement/i.test(cle);
/** Copie profonde sans aucune clé qui parle de marge, de coefficient ou de prix d'achat (ceinture de sécurité). */
function sansCles(valeur) {
  if (Array.isArray(valeur)) return valeur.map(sansCles);
  if (valeur instanceof Date) return valeur.toISOString();
  if (valeur && typeof valeur === 'object') {
    return Object.fromEntries(Object.entries(valeur).filter(([k]) => !cleInterdite(k)).map(([k, v]) => [k, sansCles(v)]));
  }
  return valeur;
}

/** L'attestation de TVA réduite ne s'applique qu'en régime assujetti, hors autoliquidation, avec au moins une ligne à 10 % ou 5,5 %. */
function attestationNecessaire(devis) {
  if (devis.regimeTva === 'franchise' || devis.autoliquidation === true) return false;
  return (devis.sections ?? []).some((s) => (s.lignes ?? []).some((l) => !estSaut(l) && [10, 5.5].includes(tauxDeLigne(devis, l))));
}

/**
 * Phrases d'acompte prêtes à imprimer, une par acompte retenu dont le moment est lisible : [{ libelle, montantTtc, type, valeur, moment }].
 * Un seul ancien acompte s'imprime exactement comme avant. € HT : « Acompte de 500,00 € HT au début des travaux soit 600,00 € TTC » (en franchise, sans HT ni TTC).
 */
function acomptesPhrases(devis, t, franchise) {
  const ttc = franchise ? '' : ' TTC';
  const out = [];
  for (const { acompte: a, c } of acomptesRetenus(listeAcomptes(devis), versCentimes(t.ttc), versCentimes(t.ht))) {
    const moment = momentAcompte(a);
    if (moment === null) continue;
    const montant = montantFr(versEuros(c));
    let libelle;
    if (a.type === 'pourcentage') libelle = `Acompte de ${pourcent2(a.valeur)} ${moment} soit ${montant}${ttc}`;
    else if (a.type === 'montantHt' && !franchise) libelle = `Acompte de ${montantFr(a.valeur)} HT ${moment} soit ${montant} TTC`;
    else libelle = `Acompte de ${montant} ${moment}`;
    out.push({ libelle, montantTtc: versEuros(c), type: a.type, valeur: a.valeur, moment: moment });
  }
  return out;
}

/** Blocs facultatifs de la vue client : acompte, primes, retenue de garantie, déchets, textes. Aucune clé si rien n'est renseigné. */
function conditionsDeVue(devis, t, franchise) {
  const v = {};
  const phrases = acomptesPhrases(devis, t, franchise);
  if (phrases.length) {
    const libelleReste = `Reste à facturer : ${montantFr(t.resteAFacturerTtc)}${franchise ? '' : ' TTC'}`;
    // `acompte` (singulier) = le premier acompte, gardé pour la compatibilité ; `acomptes` = la liste complète.
    v.acompte = { libelle: phrases[0].libelle, montantTtc: phrases[0].montantTtc, resteAFacturerTtc: t.resteAFacturerTtc, libelleReste };
    v.acomptes = phrases.map((p) => ({ libelle: p.libelle, montantTtc: p.montantTtc }));
  }
  if (t.primes.length) v.primes = t.primes.map((p) => ({ libelle: p.libelle, montant: p.montant }));
  if (t.retenueGarantieMontant > 0) {
    const r = devis.retenueGarantie;
    v.retenueGarantie = {
      pourcentage: r.pourcentage, montant: t.retenueGarantieMontant, echeance: estJour(r.echeance) ? r.echeance : null,
      libelle: `Retenue de garantie ${pourcent2(r.pourcentage)}`,
      phrase: estJour(r.echeance) ? `Retenue de garantie de ${pourcent2(r.pourcentage)} due au ${dateFrDe(r.echeance)}` : null,
    };
  }
  const dechets = dechetsDeVue(devis.dechets);
  if (dechets) v.dechets = dechets;
  if (texteNonVide(devis.texteLibre)) v.texteLibre = devis.texteLibre;
  if (texteNonVide(devis.notesBasDePage)) v.notesBasDePage = devis.notesBasDePage;
  return v;
}

/** Bloc « Gestion des déchets » : les données valides et une phrase par donnée renseignée. Null s'il n'y a rien à imprimer. */
function dechetsDeVue(d) {
  if (!objet(d)) return null;
  const types = (Array.isArray(d.types) ? d.types : []).map((x) => TYPES_DECHETS.find((y) => y.id === x)?.libelle).filter(Boolean);
  const point = texteNonVide(d.pointCollecte) ? d.pointCollecte.trim() : '';
  const min = estNombre(d.volumeMin) && d.volumeMin >= 0 ? d.volumeMin : null;
  const max = estNombre(d.volumeMax) && d.volumeMax >= 0 ? d.volumeMax : null;
  const cout = estNombre(d.coutTtcParM3) && d.coutTtcParM3 >= 0 ? d.coutTtcParM3 : null;
  const lignes = [];
  if (types.length) lignes.push(`Type de déchets collectés : ${types.join(', ')}`);
  if (point) lignes.push(`Point de collecte : ${point}`);
  if (min !== null && max !== null) lignes.push(min === max ? `Volume estimé de ${nombre(min)} m³` : `Volume estimé entre ${nombre(min)} et ${nombre(max)} m³`);
  else if (min !== null) lignes.push(`Volume estimé : au moins ${nombre(min)} m³`);
  else if (max !== null) lignes.push(`Volume estimé : au plus ${nombre(max)} m³`);
  if (cout !== null) lignes.push(`Coûts associés de ${montantFr(cout)} TTC par m³`);
  if (!lignes.length) return null;
  return { types, pointCollecte: point || null, volumeMin: min, volumeMax: max, unite: 'm3', coutTtcParM3: cout, lignes };
}

/** Coordonnées du client que l'aperçu peut montrer (cases du menu Options) : seulement les valeurs lisibles. */
function coordonneesClient(c) {
  if (!objet(c)) return {};
  const sortie = {};
  for (const cle of ['telephone', 'email', 'numeroTva', 'siren']) if (texteNonVide(c[cle])) sortie[cle] = String(c[cle]).trim();
  return sortie;
}

/** Éléments d'une ligne d'ouvrage pour le client : libellé, quantité (× quantité de la ligne), unité, prix de vente unitaire ajusté. Jamais de prix d'achat. */
function elementsOuvrage(ligne, coefficient) {
  const liste = ligne?.ouvrage?.composants;
  if (!Array.isArray(liste) || !liste.length) return null;
  const q = estNombre(ligne.quantite) && ligne.quantite > 0 ? ligne.quantite : 1;
  return liste.map((c) => ({
    libelle: c.libelle ?? '', quantite: estNombre(c.quantite) ? Math.round(c.quantite * q * 1000) / 1000 : 0, unite: c.unite ?? '',
    prixUnitaireHT: estNombre(c.prixVenteUnitaire) ? prixAjuste(c.prixVenteUnitaire, coefficient) : null,
  }));
}

/** Ce que le client voit : aucun prix d'achat, aucune marge, aucun coefficient, aucun mode de marge, à aucun niveau. */
export function vueClient(devis, contexte = {}) {
  const t = totauxDevis(devis);
  const sansTva = t.mentions.length > 0 && (devis.regimeTva === 'franchise' || devis.autoliquidation === true);
  const pos = parPosition(devis, t);
  const numeros = numerosDevis(devis.sections);
  const vue = {
    formatVersion: 1,
    espace: contexte.espace ?? null,
    devisId: devis.id,
    version: devis.version,
    numero: devis.numero ?? null,
    dateEmission: (estJour(devis.dateEmission) ? devis.dateEmission : null) ?? jourDe(devis.finaliseLe) ?? contexte.dateEmission ?? null,
    dateValidite: devis.expireLe ?? null,
    destinataires: (devis.destinataires ?? []).map(emailDe).filter(Boolean),
    copie: (devis.copie ?? []).map(emailDe).filter(Boolean),
    adresses: {
      commanditaire: devis.adresses?.commanditaire ?? null,
      facturation: devis.adresses?.facturation ?? null,
      chantier: devis.adresses?.chantier ?? null,
    },
    objet: devis.objet ?? null,
    ...(chantierDeVue(devis.chantier) ? { chantier: chantierDeVue(devis.chantier) } : {}),
    client: { nom: contexte.clientNom ?? null, ...coordonneesClient(contexte.client) },
    sections: (devis.sections ?? []).map((s, i) => ({
      id: s.id,
      ...(s.sautDePageAvant === true ? { sautDePageAvant: true } : {}),
      ...(niveauSection(devis.sections, i) === 2 ? { niveau: 2 } : {}),
      numero: numeros[i].numero, // « 1 », sous-section « 1.1 »
      titre: s.titre ?? '',
      sousTotalHT: t.sections[i].sousTotalHT,
      lignes: (s.lignes ?? []).map((l, j) => (estSaut(l) ? { id: l.id, type: TYPE_SAUT } : {
        id: l.id,
        numero: numeros[i].lignes[j],
        libelle: l.libelle ?? '',
        description: typeof l.description === 'string' ? l.description : '',
        quantite: l.quantite,
        unite: l.unite ?? '',
        prixUnitaireHT: pos[i][j]?.prixVenteUnitaire ?? null, // prix AJUSTÉ (jamais le coefficient)
        totalHT: pos[i][j]?.totalHT ?? 0,
        tauxTva: sansTva ? 0 : tauxDeLigne(devis, l),
        ...(texteNonVide(l.reference ?? l.code) ? { reference: String(l.reference ?? l.code).trim() } : {}),
        ...(elementsOuvrage(l, coefficientAjustement(devis)) ? { elements: elementsOuvrage(l, coefficientAjustement(devis)) } : {}),
      })),
    })),
    totaux: {
      totalBrutHt: t.totalBrutHt, ht: t.ht, tvaParTaux: t.tvaParTaux, tva: t.tva, ttc: t.ttc,
      acompteTtc: t.acompteTtc, acomptesTtc: t.acomptesTtc, resteAFacturerTtc: t.resteAFacturerTtc, totalPrimes: t.totalPrimes,
      retenueGarantieMontant: t.retenueGarantieMontant, netAPayer: t.netAPayer,
    },
    regimeTva: devis.regimeTva ?? 'assujetti',
    autoliquidation: devis.autoliquidation === true,
    mentions: t.mentions,
    ...(t.remiseHt > 0 ? { remise: { libelle: devis.remise.type === 'pourcentage' ? `Remise ${nombre(devis.remise.valeur)} %` : 'Remise', montantHt: t.remiseHt } } : {}),
    ...conditionsDeVue(devis, t, devis.regimeTva === 'franchise'),
    conditions: {
      debutTravaux: devis.debutTravaux ?? null,
      dureeEstimee: devis.dureeEstimee ?? null,
      acompte: acomptesPhrases(devis, t, devis.regimeTva === 'franchise').map((p) => p.libelle).join(' ; ') || null,
      paiement: devis.conditionsPaiement ?? null,
    },
    conditionsPaiement: devis.conditionsPaiement ?? null,
    modesPaiement: (Array.isArray(devis.modesPaiement) ? devis.modesPaiement : []).filter((m) => typeof m === 'string' && m.trim()),
    mentionSignature: MENTION_SIGNATURE,
    attestationTvaReduite: attestationNecessaire(devis) ? ATTESTATION_TVA_REDUITE : null,
    dossierDriveId: contexte.dossierDriveId ?? null,
    cleIdempotence: `${devis.id}:${devis.version}`,
  };
  if (contexte.emetteur) vue.emetteur = contexte.emetteur;
  return sansCles(vue);
}

// ---------------------------------------------------------------- textes lisibles
const euros = (n) => `${(n ?? 0).toFixed(2).replace('.', ',')} €`;
const nombre = (n) => String(Math.round(n * 10000) / 10000).replace('.', ',');
const pct = (n) => `${nombre(n)} %`;

function enTete(devis) {
  const l = [`Devis ${devis.numero ?? 'brouillon'}${devis.version > 1 ? ` (version ${devis.version})` : ''}`];
  if (devis.expireLe) l.push(`Valable jusqu'au ${devis.expireLe}`);
  return l;
}
function pied(t) {
  const l = [''];
  if (t.remiseHt > 0) l.push(`Total HT brut : ${euros(t.totalBrutHt)}`, `Remise : -${euros(t.remiseHt)}`);
  l.push(`Total HT : ${euros(t.ht)}`);
  for (const x of t.tvaParTaux) l.push(`TVA ${pct(x.taux)} sur ${euros(x.baseHT)} : ${euros(x.montant)}`);
  l.push(`Total TTC : ${euros(t.ttc)}`);
  for (const p of t.primes ?? []) l.push(`Prime ${p.libelle} : -${euros(p.montant)}`);
  if (t.retenueGarantieMontant > 0) l.push(`Retenue de garantie : -${euros(t.retenueGarantieMontant)}`);
  if (t.netAPayer !== undefined && t.netAPayer !== t.ttc) l.push(`Net à payer : ${euros(t.netAPayer)}`);
  if (t.acompteTtc != null) {
    for (const m of t.acomptesTtc ?? [t.acompteTtc]) l.push(`Acompte : ${euros(m)}`);
    l.push(`Reste à facturer : ${euros(t.resteAFacturerTtc)}`);
  }
  for (const m of t.mentions) l.push(m);
  return l;
}

/** Texte « tel qu'envoyé » : ce que voit le client, une ligne par article. Jamais de prix d'achat, de marge ni de coefficient. */
export function texteVueClient(devis) {
  const t = totauxDevis(devis);
  const pos = parPosition(devis, t);
  const l = enTete(devis);
  for (const [i, s] of (devis.sections ?? []).entries()) {
    l.push('', s.titre ? `${s.titre}` : 'Prestations');
    for (const [j, x] of (s.lignes ?? []).entries()) {
      if (estSaut(x)) continue;
      const c = pos[i][j];
      l.push(`- ${x.libelle ?? ''} : ${nombre(x.quantite)} ${x.unite ?? ''} x ${euros(c?.prixVenteUnitaire)} = ${euros(c?.totalHT)}`.replace(/ {2,}/g, ' '));
    }
  }
  return [...l, ...pied(t)].join('\n');
}

/** Vue interne : comme le texte client, plus prix d'achat, coefficient, marge et « vendu à perte ». */
export function texteVueInterne(devis) {
  const t = totauxDevis(devis);
  const pos = parPosition(devis, t);
  const l = [...enTete(devis), `Mode de marge : ${MODES_MARGE.find((m) => m.id === devis.modeMarge)?.libelle ?? 'inconnu'}`];
  let achatC = 0;
  for (const [i, s] of (devis.sections ?? []).entries()) {
    l.push('', s.titre ? `${s.titre}` : 'Prestations');
    for (const [j, x] of (s.lignes ?? []).entries()) {
      if (estSaut(x)) continue;
      const c = pos[i][j];
      const marge = margeEffective({ devis, section: s, ligne: x });
      const { coefficient } = coefficientDeMarge(marge, devis.modeMarge);
      if (estNombre(x.prixAchat) && estNombre(x.quantite)) achatC += arrondiDemi(x.quantite * versCentimes(x.prixAchat));
      l.push(`- ${x.libelle ?? ''} : ${nombre(x.quantite)} ${x.unite ?? ''} x ${euros(c?.prixVenteUnitaire)} = ${euros(c?.totalHT)}`.replace(/ {2,}/g, ' ')
        + ` (achat ${euros(x.prixAchat)}, coefficient ${coefficient === null ? '?' : nombre(coefficient)}, marge ${pct(marge)})${c?.venduAPerte ? ' - vendu à perte' : ''}`);
    }
  }
  l.push(...pied(t));
  l.push(`Total des achats : ${euros(versEuros(achatC))}`, `Marge dégagée : ${euros(versEuros(versCentimes(t.ht) - achatC))}`);
  return l.join('\n');
}

// ---------------------------------------------------------------- montant d'affaire
/**
 * Montant de l'affaire : somme HT des devis acceptés (archivés compris) s'il y en a au moins un ;
 * sinon le montant saisi à la main, inchangé (on n'écrase jamais une saisie).
 */
export function montantAffaireDepuisDevis(devisListe, montantSaisi) {
  const acceptes = (devisListe ?? []).filter((d) => d?.statut === 'accepte');
  if (acceptes.length === 0) return montantSaisi;
  const sommeC = acceptes.reduce((s, d) => s + versCentimes(estNombre(d.totaux?.ht) ? d.totaux.ht : totauxDevis(d).ht), 0);
  return versEuros(sommeC);
}
