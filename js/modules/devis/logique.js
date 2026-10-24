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
export const STATUTS_DEVIS = [
  { id: 'brouillon', libelle: 'Brouillon' },
  { id: 'en_attente_envoi', libelle: 'En attente d\'envoi' },
  { id: 'envoye', libelle: 'Envoyé' },
  { id: 'accepte', libelle: 'Accepté' },
  { id: 'refuse', libelle: 'Refusé' },
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
/** Clés qui ne sortent JAMAIS vers le client (voir vueClient). */
export const CLES_INTERDITES_CLIENT = ['prixAchat', 'marge', 'coefficient', 'modeMarge'];

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

/** Totaux d'un devis, tout en euros, calculés en centimes. Les lignes invalides comptent pour 0 (la validation les signale). */
export function totauxDevis(devis) {
  const franchise = devis?.regimeTva === 'franchise';
  const autoliquidation = devis?.autoliquidation === true;
  const sansTva = franchise || autoliquidation;
  const sections = [];
  const lignes = [];
  const baseParTaux = new Map(); // taux -> centimes HT
  let htC = 0;
  for (const section of devis?.sections ?? []) {
    let sousC = 0;
    for (const ligne of section.lignes ?? []) {
      const pv = prixVenteDeLigne(devis, section, ligne);
      const totalC = pv === null ? 0 : arrondiDemi((estNombre(ligne.quantite) ? ligne.quantite : 0) * versCentimes(pv));
      sousC += totalC;
      const taux = tauxDeLigne(devis, ligne);
      baseParTaux.set(taux, (baseParTaux.get(taux) ?? 0) + totalC);
      lignes.push({ id: ligne.id, prixVenteUnitaire: pv, totalHT: versEuros(totalC), venduAPerte: estVendueAPerte(ligne, pv ?? undefined) });
    }
    htC += sousC;
    sections.push({ id: section.id, sousTotalHT: versEuros(sousC) });
  }
  // Remise : après la marge et les sous-totaux, sur le total HT, répartie au prorata de chaque base de TVA.
  // Chaque part est arrondie au centime ; l'écart d'arrondi va sur la plus grande base : la somme des bases remisées vaut exactement net HT.
  const remiseC = remiseEnCentimes(devis?.remise, htC);
  const netC = htC - remiseC;
  const entrees = [...baseParTaux.entries()].sort((a, b) => b[0] - a[0]);
  const parts = entrees.map(([, baseC]) => (remiseC === 0 ? 0 : arrondiDemi(remiseC * baseC / htC)));
  if (remiseC !== 0 && entrees.length) {
    let plus = 0;
    entrees.forEach(([, baseC], k) => { if (baseC > entrees[plus][1]) plus = k; });
    parts[plus] += remiseC - parts.reduce((a, b) => a + b, 0);
  }
  const tvaParTaux = sansTva ? [] : entrees
    .map(([taux, baseC], k) => ({ taux, baseHT: versEuros(baseC - parts[k]), montant: versEuros(arrondiDemi((baseC - parts[k]) * taux / 100)) }));
  const tvaC = tvaParTaux.reduce((s, t) => s + versCentimes(t.montant), 0);
  const mentions = [];
  if (franchise) mentions.push(MENTION_FRANCHISE);
  if (autoliquidation) mentions.push(MENTION_AUTOLIQUIDATION);
  return {
    sections, lignes, totalBrutHt: versEuros(htC), remiseHt: versEuros(remiseC), totalHt: versEuros(netC),
    ht: versEuros(netC), tvaParTaux, tva: versEuros(tvaC), ttc: versEuros(netC + tvaC), mentions,
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

/** Liste de messages (en français, qui disent quoi faire). Vide = on peut finaliser. Aucun accès réseau ni base. */
export function erreursFinalisation(devis) {
  const erreurs = [];
  if (!devis) return ['Le devis est introuvable.'];
  if (devis.statut !== 'brouillon') erreurs.push('Ce devis est déjà finalisé : pour le corriger, crée la version suivante.');
  if (!idsModes.includes(devis.modeMarge)) erreurs.push('Choisis le mode de marge du devis.');
  if (!absent(devis.marge) && !estNombre(devis.marge)) erreurs.push('La marge du devis doit être un nombre.');
  const destinataires = (devis.destinataires ?? []).map(emailDe);
  if (!destinataires.some(emailValide)) erreurs.push('Ajoute au moins un destinataire avec une adresse e-mail valide (une adresse en copie ne suffit pas).');
  else if (destinataires.some((e) => e && !emailValide(e))) erreurs.push('Une adresse e-mail de destinataire n\'est pas valide : corrige-la.');
  const ids = (devis.sections ?? []).flatMap((s) => (s.lignes ?? []).map((l) => l.id));
  if (ids.some((id) => absent(id) || id === '') || new Set(ids).size !== ids.length) erreurs.push('Une ligne du devis n\'a pas d\'identifiant unique : recharge le devis ou recrée cette ligne.');
  const lignes = (devis.sections ?? []).flatMap((s) => (s.lignes ?? []).map((l) => ({ s, l })));
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
      ligne.prixVente = prixVenteDeLigne(copie, section, ligne);
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
  for (const cle of ['finaliseLe', 'envoyeLe', 'accepteLe', 'refuseLe', 'totaux', 'finalisation', 'envoiN8nCopie', 'raisonRefus']) delete copie[cle];
  for (const section of copie.sections ?? []) for (const ligne of section.lignes ?? []) delete ligne.prixVente; // recalculé tant que brouillon
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
const cleInterdite = (cle) => /marge|coefficient|prixachat/i.test(cle);
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
  return (devis.sections ?? []).some((s) => (s.lignes ?? []).some((l) => [10, 5.5].includes(tauxDeLigne(devis, l))));
}

/** Ce que le client voit : aucun prix d'achat, aucune marge, aucun coefficient, aucun mode de marge, à aucun niveau. */
export function vueClient(devis, contexte = {}) {
  const t = totauxDevis(devis);
  const sansTva = t.mentions.length > 0 && (devis.regimeTva === 'franchise' || devis.autoliquidation === true);
  const pos = parPosition(devis, t);
  const vue = {
    formatVersion: 1,
    espace: contexte.espace ?? null,
    devisId: devis.id,
    version: devis.version,
    numero: devis.numero ?? null,
    dateEmission: jourDe(devis.finaliseLe) ?? contexte.dateEmission ?? null,
    dateValidite: devis.expireLe ?? null,
    destinataires: (devis.destinataires ?? []).map(emailDe).filter(Boolean),
    copie: (devis.copie ?? []).map(emailDe).filter(Boolean),
    adresses: {
      commanditaire: devis.adresses?.commanditaire ?? null,
      facturation: devis.adresses?.facturation ?? null,
      chantier: devis.adresses?.chantier ?? null,
    },
    objet: devis.objet ?? null,
    client: { nom: contexte.clientNom ?? null },
    sections: (devis.sections ?? []).map((s, i) => ({
      id: s.id,
      numero: String(i + 1), // une seule profondeur de section en v1
      titre: s.titre ?? '',
      sousTotalHT: t.sections[i].sousTotalHT,
      lignes: (s.lignes ?? []).map((l, j) => ({
        id: l.id,
        numero: `${i + 1}.${j + 1}`,
        libelle: l.libelle ?? '',
        description: typeof l.description === 'string' ? l.description : '',
        quantite: l.quantite,
        unite: l.unite ?? '',
        prixUnitaireHT: pos[i][j]?.prixVenteUnitaire ?? null,
        totalHT: pos[i][j]?.totalHT ?? 0,
        tauxTva: sansTva ? 0 : tauxDeLigne(devis, l),
      })),
    })),
    totaux: { totalBrutHt: t.totalBrutHt, ht: t.ht, tvaParTaux: t.tvaParTaux, tva: t.tva, ttc: t.ttc },
    regimeTva: devis.regimeTva ?? 'assujetti',
    autoliquidation: devis.autoliquidation === true,
    mentions: t.mentions,
    ...(t.remiseHt > 0 ? { remise: { libelle: devis.remise.type === 'pourcentage' ? `Remise ${nombre(devis.remise.valeur)} %` : 'Remise', montantHt: t.remiseHt } } : {}),
    conditions: {
      debutTravaux: devis.debutTravaux ?? null,
      dureeEstimee: devis.dureeEstimee ?? null,
      acompte: devis.acompte ?? null,
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
