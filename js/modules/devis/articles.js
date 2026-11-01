// Bordereau du module Devis (voir docs/cadrage-devis.md, §3 et §8) : les articles (table `devis_articles`) et les réglages du module
// (document `devis_parametres/reglages`). Logique PURE : aucun accès à Firebase, au réseau ni au navigateur, testée avec node --test.
// L'écran, le serveur MCP (outils `lister_articles`, `creer_article`…) et les tests exécutent ces mêmes plans : une règle ne s'écrit qu'ici.
//
// Unités : le prix d'achat est en EUROS (nombre, 2 décimales au plus). Un article ne se supprime jamais : il se désactive.
//
// Décisions prises seul (nuit du 24/10/2026) :
// - Les réglages du module vivent dans la collection `devis_parametres` (document `reglages`), comme le cadrage (§4) le prévoit ; ils sont
//   écrits par l'écran sans passer par le journal des modifications (comme les paramètres du CRM).
// - Marge par défaut : 20 %. Taux de TVA proposés : 20, 10 et 5,5 (au moins un), défaut 20.
// - Le code d'un article est facultatif ; l'unicité se compare sans accents ni casse, parmi les articles ACTIFS seulement.
//   Réactiver un article dont le code est pris par un article actif est refusé avec un message qui dit quoi faire.
// - Plus de 2 décimales dans un prix : refusé (message) plutôt qu'arrondi en silence.
import {
  ecritureCreer, ecritureModifier, MARQUES_CREATION, MARQUES_MODIFICATION, normaliser, normaliserNom, nettoyerEspaces,
} from '../crm/logique.js';
import {
  MODES_MARGE, REGIMES_TVA, TAUX_TVA_DEFAUT, DUREE_VALIDITE_DEFAUT, coefficientDeMarge, emailValide,
  LIMITE_ASSURANCE_TEXTE, LIMITE_COORDONNEES_BANCAIRES, LIMITE_MENTION_EMETTEUR, LIMITE_MENTION_TVA_REDUITE, nettoyerTexteLibre, assuranceDepuisAnciensChamps,
} from './logique.js';
import { TYPE_OUVRAGE, motOuvrage, majuscule, duMot, erreursOuvrage, articlesParId, calculerOuvrage, lireMotOuvrage, validerMotAutre, MOTS_OUVRAGE, MOT_OUVRAGE_AUTRE } from './ouvrages.js';
export { motOuvrage, MOTS_OUVRAGE } from './ouvrages.js';
import {
  FAMILLES_PAR_DEFAUT, erreurFamilleArticle, typeDeFamille, cheminFamille, familleEffective, idsAvecSousFamilles,
} from './familles.js';

// ---------------------------------------------------------------- constantes
export const COLLECTION_ARTICLES = 'devis_articles';
export const COLLECTION_PARAMETRES = 'devis_parametres';
export const ID_REGLAGES = 'reglages';
/** Unités proposées dans le menu (le texte libre reste permis, via « Autre… »). */
export const UNITES_PROPOSEES = ['u', 'm', 'm²', 'm³', 'ml', 'h', 'jour', 'semaine', 'mois', 'forfait', 'lot', 'kg', 't', 'L', 'paire', 'ensemble'];
export const UNITE_DEFAUT = 'u';
/** Noms que l'utilisateur peut donner au bordereau (réglage du module). */
export const NOMS_BORDEREAU = ['Catalogue', 'Bordereau de prix unitaires', 'Grille tarifaire'];
export const NOM_BORDEREAU_DEFAUT = NOMS_BORDEREAU[0];
export const MARGE_DEFAUT = 20;
export const MARGE_DEVIS_DEFAUT = 20;
const MARGE_DEVIS_MAX = 1000;
export const TAUX_TVA_DEFAUT_REGLAGE = TAUX_TVA_DEFAUT[0];
export const LIMITES = { libelle: 200, code: 40, unite: 20, prixMax: 10_000_000, mention: LIMITE_MENTION_EMETTEUR, jours: 3650, reference: 120, marque: 120 };

// ---------------------------------------------------------------- « Mon entreprise » (l'émetteur du document)
// Les clés sont EXACTEMENT celles que document.js lit dans `emetteur` : nom, forme, siret, tva, adresse { ligne1, codePostal, ville }, email, telephone, site,
// registreMetiers, couleur, assuranceTexte (texte libre, 500), coordonneesBancaires (texte libre, 300), mediateur { nom, email, site }. Un champ vide n'est pas enregistré ; sans rien : `{}`.
// Les anciens champs `assurance { garantie, assureur, adresse, zone }` sont gardés tels quels tant qu'`assuranceTexte` est absent (ils se lisent comme un texte, sans écriture en base) ; l'écran les remplace par `assuranceTexte`.
// `paiement { modes }` : les méthodes de paiement acceptées (liste de textes, imprimée sur le devis). `iban` et `delaiJours` (lus par document.js) ne sont pas saisis ici mais jamais perdus s'ils existent.
// Pas de logo ni de CGV ici : ils viendront avec leurs propres écrans.
const TEXTES_ENTREPRISE = [['nom', 'Le nom', 120], ['forme', 'La forme juridique', 60], ['siret', 'Le SIRET', 30], ['tva', 'Le numéro de TVA', 30], ['telephone', 'Le téléphone', 30],
  ['email', 'L’e-mail', 120], ['site', 'Le site web', 200], ['registreMetiers', 'La mention du registre des métiers', 200]];
const TEXTES_ADRESSE = [['ligne1', 'La rue', 200], ['codePostal', 'Le code postal', 12], ['ville', 'La ville', 80]];
const TEXTES_ASSURANCE = [['garantie', 'La garantie', 200], ['assureur', 'L’assureur', 120], ['adresse', 'L’adresse de l’assureur', 200], ['zone', 'La zone de couverture', 120]];
const TEXTES_MEDIATEUR = [['nom', 'Le nom du médiateur', 120], ['email', 'L’e-mail du médiateur', 120], ['site', 'Le site du médiateur', 200]];
/** Méthodes de paiement proposées par l'écran (cases à cocher) ; une autre méthode se saisit en texte libre. */
export const MODES_PAIEMENT = ['Carte bancaire', 'Virement', 'Chèque', 'Espèces', 'Prélèvement'];
const LONGUEUR_MODE = 60;
const COULEUR_HEX = /^#[0-9a-fA-F]{6}$/;
const objetSimple = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const texteAdresse = (v) => (typeof v === 'string' ? v : objetSimple(v) && typeof v.texte === 'string' ? v.texte : null);

/** Lit un groupe de champs texte : `{ valeurs (nettoyées, sans les vides), erreurs }`. `prefixe` : clé d'erreur (« entreprise.assurance »). */
function lireGroupe(source, champs, prefixe) {
  const valeurs = {};
  const erreurs = {};
  const s = objetSimple(source) ? source : {};
  for (const [cle, libelle, max] of champs) {
    const brut = s[cle];
    if (brut === undefined || brut === null) continue;
    const t = nettoyerEspaces(typeof brut === 'string' || typeof brut === 'number' ? brut : '');
    if (t.length > max) erreurs[`${prefixe}.${cle}`] = `${libelle} est trop long (${max} caractères au plus) : raccourcis-le.`;
    else if (t) valeurs[cle] = t;
  }
  return { valeurs, erreurs };
}

/** Le groupe `paiement` : `modes` (textes nettoyés, sans doublon ni vide ; `autre` = une méthode en texte libre ajoutée à la fin), `iban` et `delaiJours` gardés tels quels. `undefined` si rien. */
function lirePaiement(brut, erreurs) {
  if (!objetSimple(brut)) return undefined;
  const modes = [];
  const autres = typeof brut.autre === 'string' ? brut.autre.split(',') : []; // « Autre » peut porter plusieurs anciennes méthodes jointes par une virgule
  for (const m of [...(Array.isArray(brut.modes) ? brut.modes : []), ...autres]) {
    const t = nettoyerEspaces(typeof m === 'string' ? m : '');
    if (!t) continue;
    if (t.length > LONGUEUR_MODE) { erreurs['entreprise.paiement.autre'] = `Une méthode de paiement est trop longue (${LONGUEUR_MODE} caractères au plus) : raccourcis-la.`; continue; }
    if (!modes.includes(t)) modes.push(t);
  }
  const sortie = {};
  if (modes.length) sortie.modes = modes;
  if (typeof brut.iban === 'string' && brut.iban.trim()) sortie.iban = brut.iban.trim();
  if (Number.isInteger(brut.delaiJours) && brut.delaiJours >= 0) sortie.delaiJours = brut.delaiJours;
  return Object.keys(sortie).length ? sortie : undefined;
}

/**
 * Contrôle de « Mon entreprise » : `{ entreprise, erreurs }`. Un champ vide est permis ; une adresse en simple texte est rangée dans `ligne1`.
 * Erreurs : couleur (#rrggbb), e-mails plausibles, longueurs.
 */
export function validerEntreprise(brut) {
  const s = objetSimple(brut) ? brut : {};
  const erreurs = {};
  const sortie = {};
  const racine = lireGroupe(s, TEXTES_ENTREPRISE, 'entreprise');
  Object.assign(erreurs, racine.erreurs);
  Object.assign(sortie, racine.valeurs);
  const texteAdr = texteAdresse(s.adresse);
  const adr = lireGroupe(texteAdr !== null ? { ligne1: texteAdr } : s.adresse, TEXTES_ADRESSE, 'entreprise.adresse');
  Object.assign(erreurs, adr.erreurs);
  if (Object.keys(adr.valeurs).length) sortie.adresse = adr.valeurs;
  // Assurance et coordonnées bancaires : un texte libre multiligne chacun (retours à la ligne gardés). Vide = non enregistré.
  for (const [cle, trop, max] of [['assuranceTexte', 'Le texte d’assurance est trop long', LIMITE_ASSURANCE_TEXTE], ['coordonneesBancaires', 'Les coordonnées bancaires sont trop longues', LIMITE_COORDONNEES_BANCAIRES]]) {
    const t = nettoyerTexteLibre(s[cle]);
    if (t.length > max) erreurs[`entreprise.${cle}`] = `${trop} (${max} caractères au plus) : raccourcis le texte.`;
    else if (t) sortie[cle] = t;
  }
  // Ancien format (quatre champs), jamais perdu : gardé tant que le nouveau texte est absent, et aussi quand l'ancien groupe n'a rien d'imprimable (adresse ou zone seules : le texte reconstruit serait vide).
  if (s.assuranceTexte === undefined || s.assuranceTexte === null || assuranceDepuisAnciensChamps(s.assurance) === '') {
    const ass = lireGroupe(s.assurance, TEXTES_ASSURANCE, 'entreprise.assurance');
    if (Object.keys(ass.valeurs).length) sortie.assurance = ass.valeurs;
  }
  const med = lireGroupe(s.mediateur, TEXTES_MEDIATEUR, 'entreprise.mediateur');
  Object.assign(erreurs, med.erreurs);
  if (Object.keys(med.valeurs).length) sortie.mediateur = med.valeurs;
  for (const [parent, cle, libelle] of [[sortie, 'email', 'l’e-mail de l’entreprise'], [sortie.mediateur, 'email', 'l’e-mail du médiateur']]) {
    if (!parent?.[cle] || emailValide(parent[cle])) continue;
    erreurs[parent === sortie ? 'entreprise.email' : 'entreprise.mediateur.email'] ??= `Vérifie ${libelle} : il doit ressembler à contact@exemple.fr.`;
    delete parent[cle]; // une valeur invalide n'est jamais gardée
  }
  if (sortie.mediateur && !Object.keys(sortie.mediateur).length) delete sortie.mediateur;
  const paiement = lirePaiement(s.paiement, erreurs);
  if (paiement) sortie.paiement = paiement;
  const couleur = typeof s.couleur === 'string' ? s.couleur.trim() : '';
  if (couleur) {
    if (COULEUR_HEX.test(couleur)) sortie.couleur = couleur.toLowerCase();
    else erreurs['entreprise.couleur'] = 'La couleur doit s’écrire # suivi de 6 chiffres ou lettres (exemple : #1f6feb). Choisis-la avec le sélecteur, ou remets la couleur par défaut.';
  }
  return { entreprise: sortie, erreurs };
}
export const MESSAGE_DESACTIVER = 'Un article ne se supprime jamais : il se désactive. Les devis déjà faits ne changent pas, et tu pourras le réactiver quand tu veux.';
/** Ligne de texte libre : ni prix, ni quantité, ni unité obligatoires ; elle compte 0 dans les totaux d'un devis. */
export const TYPE_TEXTE = 'texte';
/** Types d'article (facultatif : un article sans type est « non classé »). Un ouvrage est composé d'autres articles (voir ouvrages.js). */
export const TYPES_ARTICLE = [
  { id: 'fourniture', libelle: 'Fourniture' },
  { id: 'main_oeuvre', libelle: 'Main d’œuvre' },
  { id: TYPE_OUVRAGE, libelle: 'Ouvrage' },
  { id: 'sous_traitance', libelle: 'Sous-traitance' },
  { id: 'materiel', libelle: 'Matériel' },
  { id: 'divers', libelle: 'Divers' },
  { id: TYPE_TEXTE, libelle: 'Texte' },
];
/** Le libellé d'un type ; celui des ouvrages suit le mot du métier réglé (`reglages` absents : « Ouvrage »). */
export const libelleType = (type, reglages) => (type === TYPE_OUVRAGE ? majuscule(motOuvrage(reglages).singulier) : (TYPES_ARTICLE.find((t) => t.id === type)?.libelle ?? ''));
export const FILTRES_ACTIF = [
  { id: 'actifs', libelle: 'Actifs' },
  { id: 'desactives', libelle: 'Désactivés' },
  { id: 'tous', libelle: 'Tous' },
];

const estNombre = (v) => typeof v === 'number' && Number.isFinite(v);
const texte = (v) => nettoyerEspaces(v);

// ---------------------------------------------------------------- nombres saisis par l'humain
/**
 * Nombre saisi (virgule française acceptée, espaces et « € » ignorés) -> nombre, ou null si ce n'est pas un nombre.
 * Une chaîne vide donne null. Pas de séparateur de milliers (« 1 234,50 » marche : les espaces sont retirés).
 */
export function lireNombre(saisie) {
  if (estNombre(saisie)) return saisie;
  if (typeof saisie !== 'string') return null;
  const t = saisie.replace(/[\s  ]/g, '').replace(/(€|eur|euros?)$/i, '').replace('%', '');
  if (!/^[-+]?\d+([.,]\d+)?$/.test(t)) return null;
  const n = Number(t.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/** Prix d'achat en euros, ou `{ erreur }`. Positif ou nul, 2 décimales au plus. */
export function lirePrixAchat(saisie) {
  const n = lireNombre(saisie);
  if (n === null) return { prix: null, erreur: 'Le prix d’achat doit être un nombre en euros (exemple : 12,50).' };
  if (n < 0) return { prix: null, erreur: 'Le prix d’achat ne peut pas être négatif.' };
  if (n > LIMITES.prixMax) return { prix: null, erreur: 'Ce prix d’achat est trop grand : vérifie le nombre de zéros.' };
  if (Math.abs(Math.round(n * 100) - n * 100) > 1e-6) return { prix: null, erreur: 'Le prix d’achat s’écrit avec 2 décimales au plus (exemple : 12,50).' };
  return { prix: Math.round(n * 100) / 100, erreur: null };
}

/** Affichage français d'un prix : 12,5 -> « 12,50 € ». */
export const formaterPrix = (prix) => (estNombre(prix) ? `${prix.toFixed(2).replace('.', ',')} €` : '');
/** Valeur d'un champ de saisie : 12,5 -> « 12,50 ». */
export const prixPourSaisie = (prix) => (estNombre(prix) ? prix.toFixed(2).replace('.', ',') : '');
/** Taux de TVA affiché : 5.5 -> « 5,5 % ». */
export const formaterTaux = (taux) => (estNombre(taux) ? `${String(taux).replace('.', ',')} %` : '');

// ---------------------------------------------------------------- articles
const cleCode = (code) => normaliserNom(code);

/** Article actif qui utilise ce code (hors `sauf` : l'article qu'on est en train de modifier), ou null. */
export function articleDuCode(articles, code, sauf = null) {
  const cle = cleCode(code);
  if (!cle) return null;
  return (articles ?? []).find((a) => a.id !== sauf && a.actif !== false && cleCode(a.code) === cle) ?? null;
}

/** Valeurs d'un article, nettoyées : `{ valeurs, erreurs }` (erreurs : clé du champ -> message qui dit quoi faire). `courant` : l'article modifié (ses champs complètent la saisie). */
export function validerArticle(saisie, { articles = [], courant = null, familles = FAMILLES_PAR_DEFAUT, reglages = {} } = {}) {
  const erreurs = {};
  const mot = motOuvrage(reglages); // le mot du métier (réglages absents : « ouvrage »)
  const base = { ...(courant ?? {}), ...saisie };
  const libelle = texte(base.libelle);
  if (!libelle) erreurs.libelle = 'Le libellé est obligatoire : écris le nom de l’article (exemple : Carrelage 60 x 60).';
  else if (libelle.length > LIMITES.libelle) erreurs.libelle = `Le libellé est trop long (${LIMITES.libelle} caractères au plus).`;
  // Type (facultatif) : absent = non classé. Il se DÉDUIT de la famille choisie (celle de premier niveau) ; un type donné à part doit s'accorder avec la famille.
  const aType = (v) => v !== undefined && v !== null && v !== '';
  const familleVisee = 'familleId' in saisie ? saisie.familleId : courant?.familleId;
  const typeFamille = aType(familleVisee) ? typeDeFamille(familles, familleVisee) : null;
  const familleDonnee = aType(saisie.familleId);
  let typeBrut = base.type;
  if (aType(saisie.type)) {
    if (typeFamille && saisie.type !== typeFamille) {
      erreurs.type = `Le type « ${libelleType(saisie.type, reglages) || String(saisie.type)} » ne va pas avec la famille « ${cheminFamille(familles, familleVisee)} » (type « ${libelleType(typeFamille, reglages)} »). Change la famille : le type s’en déduit.`;
    }
  } else if (familleDonnee && typeFamille) typeBrut = typeFamille; // famille choisie : le type suit
  let type = null;
  if (aType(typeBrut)) {
    if (TYPES_ARTICLE.some((t) => t.id === typeBrut)) type = typeBrut;
    else erreurs.type = `Le type « ${String(typeBrut)} » n’existe pas. Choisis parmi : ${TYPES_ARTICLE.map((t) => libelleType(t.id, reglages)).join(', ')}.`;
  }
  const unite = texte(base.unite) || (courant || type === TYPE_TEXTE ? '' : UNITE_DEFAUT);
  if (!unite && type === TYPE_TEXTE) { /* une ligne de texte n'a pas d'unité */ } else if (!unite) erreurs.unite = 'Choisis une unité (exemple : m², h, forfait).';
  else if (unite.length > LIMITES.unite) erreurs.unite = `L’unité est trop longue (${LIMITES.unite} caractères au plus).`;
  const estOuvrage = type === TYPE_OUVRAGE;
  const estTexte = type === TYPE_TEXTE;
  const brutPrix = base.prixAchat;
  let prixAchat = null;
  const prixVide = brutPrix === undefined || brutPrix === null || (typeof brutPrix === 'string' && !brutPrix.trim());
  if (estOuvrage) {
    // Un ouvrage n'a pas de prix d'achat propre : il se calcule à partir de ses composants.
    if (!prixVide && 'prixAchat' in saisie) erreurs.prixAchat = `${majuscule(mot.un)} ${mot.singulier} n’a pas de prix d’achat : ${mot.le === 'la' ? 'elle se calcule' : 'il se calcule'} à partir de ses composants.`;
  } else if (estTexte && prixVide) { /* une ligne de texte n'a pas de prix */ } else if (prixVide) erreurs.prixAchat = 'Indique le prix d’achat en euros (exemple : 12,50).';
  else {
    const r = lirePrixAchat(brutPrix);
    if (r.erreur) erreurs.prixAchat = r.erreur;
    else prixAchat = r.prix;
  }
  // Composants et prix de vente forcé : seulement pour un ouvrage.
  let composants = null;
  let prixVenteForce = null;
  const aDesComposants = Array.isArray(base.composants) && base.composants.length > 0;
  const aUnForce = base.prixVenteForce !== undefined && base.prixVenteForce !== null && !(typeof base.prixVenteForce === 'string' && !base.prixVenteForce.trim());
  if (estOuvrage) {
    if (aUnForce) {
      const f = lireNombre(base.prixVenteForce);
      if (f === null) erreurs.prixVenteForce = 'Le prix de vente forcé doit être un nombre en euros (exemple : 12,50).';
      else if (f < 0) erreurs.prixVenteForce = 'Le prix de vente forcé ne peut pas être négatif.';
      else if (f > LIMITES.prixMax) erreurs.prixVenteForce = 'Ce prix est trop grand : vérifie le nombre de zéros.';
      else if (Math.abs(Math.round(f * 100) - f * 100) > 1e-6) erreurs.prixVenteForce = 'Le prix de vente forcé s’écrit avec 2 décimales au plus (exemple : 12,50).';
      else prixVenteForce = Math.round(f * 100) / 100;
    }
    const problemes = erreursOuvrage({ id: courant?.id, composants: base.composants, prixVenteForce: prixVenteForce ?? undefined }, articlesParId(articles), reglages);
    if (problemes.length) erreurs.composants = problemes.join(' ');
    else composants = base.composants.map((c) => ({ articleId: c.articleId, quantite: c.quantite }));
  } else {
    if (aDesComposants) erreurs.composants = `Seul un article de type « ${majuscule(mot.singulier)} » peut avoir des composants.`;
    if (aUnForce) erreurs.prixVenteForce = `Seul${mot.le === 'la' ? 'e' : ''} ${mot.un} ${mot.singulier} peut avoir un prix de vente forcé.`;
  }
  // Marge propre à l'article (facultative, en %, dans le mode de marge des réglages) : sinon la marge des réglages s'applique.
  let marge = null;
  if (base.marge !== undefined && base.marge !== null && !(typeof base.marge === 'string' && !base.marge.trim())) {
    const m = lireNombre(base.marge);
    if (m === null || m < 0 || m > 1000) erreurs.marge = 'La marge de l’article est un pourcentage entre 0 et 1000 (exemple : 25), ou vide pour garder la marge des réglages.';
    else marge = m;
  }
  const code = texte(base.code);
  if (code.length > LIMITES.code) erreurs.code = `Le code est trop long (${LIMITES.code} caractères au plus).`;
  else if (code) {
    const pris = articleDuCode(articles, code, courant?.id ?? null);
    if (pris && base.actif !== false) erreurs.code = `Le code « ${code} » est déjà utilisé par l’article actif « ${pris.libelle} ». Choisis un autre code, ou désactive d’abord cet article.`;
  }
  let tauxTva = null;
  if (base.tauxTva !== undefined && base.tauxTva !== null && !(typeof base.tauxTva === 'string' && !base.tauxTva.trim())) {
    const t = lireNombre(base.tauxTva);
    if (t === null || t < 0 || t > 100) erreurs.tauxTva = 'Le taux de TVA doit être un nombre entre 0 et 100 (exemple : 20).';
    else tauxTva = t;
  }
  // Référence et marque du fabricant (facultatives), famille (facultative, une seule).
  const reference = texte(base.reference);
  if (reference.length > LIMITES.reference) erreurs.reference = `La référence est trop longue (${LIMITES.reference} caractères au plus).`;
  const marque = texte(base.marque);
  if (marque.length > LIMITES.marque) erreurs.marque = `La marque est trop longue (${LIMITES.marque} caractères au plus).`;
  const familleId = typeof base.familleId === 'string' ? base.familleId : '';
  const erreurFamille = erreurFamilleArticle(familleId, familles, courant?.familleId ?? null);
  if (erreurFamille) erreurs.familleId = erreurFamille;
  return { valeurs: { libelle, unite, prixAchat, code, tauxTva, type, composants, prixVenteForce, marge, reference, marque, familleId }, erreurs };
}

/** Document d'un article neuf. L'id, la date et l'auteur viennent de `ctx` (déterministe). */
export function nouvelArticle(valeurs, ctx = {}) {
  return {
    code: valeurs.code ?? '',
    libelle: valeurs.libelle,
    unite: valeurs.unite,
    prixAchat: valeurs.prixAchat,
    tauxTva: valeurs.tauxTva ?? null,
    // Les champs du type, des composants et de la marge ne sont écrits que s'ils servent : les articles existants ne changent pas de forme.
    ...(valeurs.type ? { type: valeurs.type } : {}),
    ...(valeurs.composants ? { composants: valeurs.composants } : {}),
    ...(valeurs.prixVenteForce !== null && valeurs.prixVenteForce !== undefined ? { prixVenteForce: valeurs.prixVenteForce } : {}),
    ...(valeurs.marge !== null && valeurs.marge !== undefined ? { marge: valeurs.marge } : {}),
    ...(valeurs.reference ? { reference: valeurs.reference } : {}),
    ...(valeurs.marque ? { marque: valeurs.marque } : {}),
    ...(valeurs.familleId ? { familleId: valeurs.familleId } : {}),
    actif: true,
    proprietaire: ctx.proprietaire ?? ctx.auteur ?? '',
  };
}

/** Création : `{ erreurs, id, ecritures }`. `articles` : le bordereau actuel (pour l'unicité du code). */
export function planCreerArticle(saisie, ctx, { articles = [], familles, reglages = {} } = {}) {
  const { valeurs, erreurs } = validerArticle(saisie, { articles, familles, reglages });
  if (Object.keys(erreurs).length) return { erreurs, id: null, ecritures: [] };
  const id = ctx.nouvelId(COLLECTION_ARTICLES);
  return { erreurs: {}, id, libelle: valeurs.libelle, ecritures: [ecritureCreer(COLLECTION_ARTICLES, id, nouvelArticle(valeurs, ctx), MARQUES_CREATION)] };
}

/** Champs que `planMajArticle` accepte (jamais l'état actif/désactivé : voir planActiverArticle). */
export const CHAMPS_MODIFIABLES = ['libelle', 'unite', 'prixAchat', 'code', 'tauxTva', 'type', 'composants', 'prixVenteForce', 'marge', 'reference', 'marque', 'familleId'];

/** Modification de champs (seuls les champs donnés changent) : `{ erreurs, patch, ecritures }`. */
export function planMajArticle(id, patch, { articles = [], familles, reglages = {} } = {}) {
  const mot = motOuvrage(reglages);
  const courant = (articles ?? []).find((a) => a.id === id);
  if (!courant) return { erreurs: { general: 'Article introuvable : recharge la page.' }, patch: {}, ecritures: [] };
  const donnes = Object.fromEntries(Object.entries(patch ?? {}).filter(([k]) => CHAMPS_MODIFIABLES.includes(k)));
  if (!Object.keys(donnes).length) return { erreurs: {}, patch: {}, ecritures: [] };
  // Le type se déduit de la famille : on ne peut pas l'effacer tant que l'article est rangé dans une famille qui en porte un.
  const familleVisee = 'familleId' in donnes ? donnes.familleId : familleEffective(courant);
  if ('type' in donnes && !donnes.type && familleVisee && typeDeFamille(familles ?? FAMILLES_PAR_DEFAUT, familleVisee)) {
    return { erreurs: { type: 'Le type se déduit de la famille : change la famille de l’article plutôt que son type.' }, patch: {}, ecritures: [] };
  }
  // Si l'article quitte le type « ouvrage », ses composants et son prix forcé s'effacent (ils ne comptent plus dans la validation).
  // Le type peut aussi changer parce que la famille change : il se déduit de la famille de premier niveau (voir validerArticle).
  const typeDeLaFamille = 'familleId' in donnes && donnes.familleId ? typeDeFamille(familles ?? FAMILLES_PAR_DEFAUT, donnes.familleId) : null;
  const typeVise = 'type' in donnes ? (donnes.type || null) : (typeDeLaFamille ?? undefined);
  const touchType = typeVise !== undefined;
  const quitteOuvrage = touchType && typeVise !== TYPE_OUVRAGE;
  const { composants: _c, prixVenteForce: _f, ...sansOuvrage } = courant;
  const { valeurs, erreurs } = validerArticle(donnes, { articles, familles, reglages, courant: { ...(quitteOuvrage ? sansOuvrage : courant), id } });
  // Seules les erreurs des champs touchés bloquent (un ancien article sans prix ne bloque pas la correction de son libellé).
  const bloquantes = Object.fromEntries(Object.entries(erreurs).filter(([k]) => k in donnes || (touchType && (k === 'composants' || k === 'prixVenteForce'))));
  if (Object.keys(bloquantes).length) return { erreurs: bloquantes, patch: {}, ecritures: [] };
  const net = {};
  const pareil = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  for (const k of new Set([...Object.keys(donnes), ...(touchType ? ['type'] : [])])) {
    if (!pareil(courant[k] ?? (['code', 'reference', 'marque', 'familleId'].includes(k) ? '' : null), valeurs[k])) net[k] = valeurs[k];
  }
  // Changer de type garde les champs cohérents : un ouvrage n'a pas de prix d'achat, un autre type n'a ni composants ni prix forcé.
  if (touchType) {
    if (valeurs.type === TYPE_OUVRAGE) {
      const dansUnOuvrage = (articles ?? []).find((a) => a.type === TYPE_OUVRAGE && (a.composants ?? []).some((c) => c.articleId === id));
      if (dansUnOuvrage) return { erreurs: { type: `Cet article est un composant ${duMot(mot)} « ${dansUnOuvrage.libelle} » : ${mot.un} ${mot.singulier} ne peut pas en contenir ${mot.un === 'une' ? 'une autre' : 'un autre'}. Retire-le d’abord de ${mot.cet} ${mot.singulier}.` }, patch: {}, ecritures: [] };
      if (courant.prixAchat !== null && courant.prixAchat !== undefined) net.prixAchat = null;
    } else {
      if (courant.composants) net.composants = null;
      if (courant.prixVenteForce !== null && courant.prixVenteForce !== undefined) net.prixVenteForce = null;
      if (courant.type === TYPE_OUVRAGE && valeurs.type !== TYPE_TEXTE && !('prixAchat' in donnes)) {
        return { erreurs: { prixAchat: `Indique le prix d’achat en euros (exemple : 12,50) : cet article n’est plus ${mot.un} ${mot.singulier}.` }, patch: {}, ecritures: [] };
      }
    }
  }
  return { erreurs: {}, patch: net, ecritures: Object.keys(net).length ? [ecritureModifier(COLLECTION_ARTICLES, id, net, MARQUES_MODIFICATION)] : [] };
}

/** Désactive (actif = false) ou réactive (actif = true) un article. Réactiver est refusé si son code est pris par un article actif. */
export function planActiverArticle(id, actif, { articles = [] } = {}) {
  const courant = (articles ?? []).find((a) => a.id === id);
  if (!courant) return { erreurs: { general: 'Article introuvable : recharge la page.' }, patch: {}, ecritures: [] };
  if ((courant.actif !== false) === actif) return { erreurs: {}, patch: {}, ecritures: [] };
  if (actif && texte(courant.code)) {
    const pris = articleDuCode(articles, courant.code, id);
    if (pris) return { erreurs: { code: `Le code « ${texte(courant.code)} » est maintenant utilisé par l’article actif « ${pris.libelle} ». Change d’abord le code de l’un des deux articles.` }, patch: {}, ecritures: [] };
  }
  return { erreurs: {}, patch: { actif }, ecritures: [ecritureModifier(COLLECTION_ARTICLES, id, { actif }, MARQUES_MODIFICATION)] };
}

/** Pour plus tard : un article « utilisé » par un devis demandera une confirmation de plus. Pour l'instant, aucun devis n'existe : jamais utilisé. */
export const articleUtilise = () => false;

/** Les articles tels qu'on les montre : un ouvrage porte son calcul (prix de vente, déboursé sec, marge) ; `toutes` : tout le Bordereau (les composants y sont cherchés). */
export function avecCalculOuvrage(articles, toutes, reglages) {
  const parId = articlesParId(toutes ?? articles);
  const r = reglagesDevis(reglages);
  return (articles ?? []).map((a) => (a.type === TYPE_OUVRAGE ? { ...a, calcul: calculerOuvrage(a, parId, { marge: r.marge, modeMarge: r.modeMarge, motOuvrage: reglages?.motOuvrage, motOuvrageAutre: reglages?.motOuvrageAutre }) } : a));
}

// ---------------------------------------------------------------- recherche, filtre, tri
/**
 * Articles filtrés (recherche dans le code et le libellé, sans accents ni casse ; `statut` : actifs | desactives | tous), triés par libellé.
 * `familleId` : une famille (sa famille de départ pour un article sans famille) ; un filtre sur une famille de premier niveau inclut ses sous-familles ; 'sans_famille' = aucune.
 */
export function filtrerArticles(articles, { recherche = '', statut = 'actifs', type = '', familleId = '', familles = FAMILLES_PAR_DEFAUT } = {}) {
  const idsFamille = familleId && familleId !== 'sans_famille' ? idsAvecSousFamilles(familles, familleId) : null;
  const mots = normaliser(recherche).split(/\s+/).filter(Boolean);
  const gardes = (articles ?? []).filter((a) => {
    if (statut === 'actifs' && a.actif === false) return false;
    if (statut === 'desactives' && a.actif !== false) return false;
    if (type === 'non_classe' ? !!a.type : (type && a.type !== type)) return false;
    if (familleId === 'sans_famille' ? !!familleEffective(a) : (idsFamille && !idsFamille.includes(familleEffective(a)))) return false;
    if (!mots.length) return true;
    const cible = normaliser(`${a.code ?? ''} ${a.libelle ?? ''} ${a.reference ?? ''} ${a.marque ?? ''}`);
    return mots.every((m) => cible.includes(m));
  });
  return gardes.sort((a, b) => normaliser(a.libelle).localeCompare(normaliser(b.libelle), 'fr') || String(a.id).localeCompare(String(b.id)));
}

// ---------------------------------------------------------------- réglages du module
export const REGLAGES_DEVIS_DEFAUT = Object.freeze({
  nomBordereau: NOM_BORDEREAU_DEFAUT,
  motOuvrage: 'ouvrage', // le mot affiché pour le type « ouvrage » (liste fermée + « autre ») ; l'identifiant technique ne change jamais
  motOuvrageAutre: Object.freeze({}), // { singulier, pluriel, genre } quand le choix est « autre »
  modeMarge: 'majoration',
  marge: MARGE_DEFAUT,
  margeDevis: MARGE_DEVIS_DEFAUT, // marge par défaut des nouveaux devis (distincte de `marge`, la « marge de revente » des articles)
  regimeTva: 'assujetti',
  tauxProposes: [...TAUX_TVA_DEFAUT],
  tauxTvaDefaut: TAUX_TVA_DEFAUT_REGLAGE,
  dureeValiditeJours: DUREE_VALIDITE_DEFAUT,
  etapeDevis: '', // anciens réglages (étape des devis retirée le 28/10/2026, un devis vit à toutes les étapes) : gardés tels quels dans la base, plus modifiables
  etapeAFaire: '', // idem (25/10/2026)
  etapeEnvoye: '',
  etapeAffaireCreee: '', // étape de départ de l'affaire créée à la finalisation d'un devis sans affaire ('' = non réglée : on demande à chaque fois) ; jamais contrôlée ici (le pipeline n'est pas visible), la validité se résout à l'usage
  mentionEmetteur: '',
  mentionTvaReduite: '', // vide = texte standard (MENTION_TVA_REDUITE_DEFAUT), imprimé sur les devis à 5,5 % ou 10 %
  gestionDechets: true, // bloc « Gestion des déchets » des devis (éditeur, aperçu, PDF) ; éteint pour les métiers sans chantier (agence, conseil…)
  entreprise: Object.freeze({}),
});
const CLES_REGLAGES = Object.keys(REGLAGES_DEVIS_DEFAUT);

/** Réglages lus dans la base (document absent ou illisible = valeurs par défaut) : toujours un objet complet et valide. */
export function reglagesDevis(brut) {
  const b = brut && typeof brut === 'object' ? brut : {};
  const d = REGLAGES_DEVIS_DEFAUT;
  const taux = Array.isArray(b.tauxProposes) ? b.tauxProposes.filter((t) => TAUX_TVA_DEFAUT.includes(t)) : [];
  const proposes = taux.length ? TAUX_TVA_DEFAUT.filter((t) => taux.includes(t)) : [...d.tauxProposes];
  return {
    nomBordereau: NOMS_BORDEREAU.includes(b.nomBordereau) ? b.nomBordereau : d.nomBordereau,
    ...lireMotOuvrage(b),
    modeMarge: MODES_MARGE.some((m) => m.id === b.modeMarge) ? b.modeMarge : d.modeMarge,
    marge: estNombre(b.marge) && !(b.modeMarge === 'marge_vente' && b.marge >= 100) ? b.marge : d.marge,
    margeDevis: estNombre(b.margeDevis) && b.margeDevis >= 0 && b.margeDevis <= MARGE_DEVIS_MAX && !(b.modeMarge === 'marge_vente' && b.margeDevis >= 100) ? b.margeDevis : d.margeDevis,
    regimeTva: REGIMES_TVA.some((r) => r.id === b.regimeTva) ? b.regimeTva : d.regimeTva,
    tauxProposes: proposes,
    tauxTvaDefaut: proposes.includes(b.tauxTvaDefaut) ? b.tauxTvaDefaut : proposes[0],
    dureeValiditeJours: Number.isInteger(b.dureeValiditeJours) && b.dureeValiditeJours > 0 ? b.dureeValiditeJours : d.dureeValiditeJours,
    etapeDevis: typeof b.etapeDevis === 'string' ? b.etapeDevis : '',
    etapeAFaire: typeof b.etapeAFaire === 'string' ? b.etapeAFaire : '',
    etapeEnvoye: typeof b.etapeEnvoye === 'string' ? b.etapeEnvoye : '',
    etapeAffaireCreee: typeof b.etapeAffaireCreee === 'string' ? b.etapeAffaireCreee : '',
    mentionEmetteur: typeof b.mentionEmetteur === 'string' ? nettoyerTexteLibre(b.mentionEmetteur) : '',
    mentionTvaReduite: typeof b.mentionTvaReduite === 'string' ? nettoyerTexteLibre(b.mentionTvaReduite) : '',
    gestionDechets: b.gestionDechets !== false, // absent ou bizarre = actif
    entreprise: lireEntreprise(b.entreprise),
  };
}

/** « Mon entreprise » lue dans la base : ce qui est valide est gardé, le reste est ignoré (jamais d'erreur à la lecture). Rend toujours un objet neuf. */
const lireEntreprise = (brut) => validerEntreprise(brut).entreprise;

/** Titre de l'écran du bordereau = le nom choisi dans les réglages. */
export const titreBordereau = (reglages) => reglagesDevis(reglages).nomBordereau;

/**
 * Contrôle des réglages saisis (`saisie` complète ou partielle, complétée par `actuels`) : `{ reglages, erreurs }`.
 */
export function validerReglagesDevis(saisie, { actuels = REGLAGES_DEVIS_DEFAUT } = {}) {
  const erreurs = {};
  const s = { ...reglagesDevis(actuels), ...(saisie ?? {}) };
  if (!NOMS_BORDEREAU.includes(s.nomBordereau)) erreurs.nomBordereau = `Choisis un nom parmi : ${NOMS_BORDEREAU.join(', ')}.`;
  if (!MODES_MARGE.some((m) => m.id === s.modeMarge)) erreurs.modeMarge = 'Choisis le calcul de la marge.';
  const marge = lireNombre(s.marge);
  if (marge === null) erreurs.marge = 'La marge doit être un nombre en pourcentage (exemple : 20).';
  else if (!erreurs.modeMarge) {
    const { erreur } = coefficientDeMarge(marge, s.modeMarge);
    if (erreur) erreurs.marge = `${erreur} Choisis un pourcentage plus petit (exemple : 30), ou le mode « ${MODES_MARGE[0].libelle} ».`;
  }
  const margeDevis = lireNombre(s.margeDevis);
  if (margeDevis === null || margeDevis < 0 || margeDevis > MARGE_DEVIS_MAX) erreurs.margeDevis = `La marge du devis est un pourcentage entre 0 et ${MARGE_DEVIS_MAX} (exemple : 20), ou 0 pour aucune marge.`;
  else if (!erreurs.modeMarge) {
    const { erreur } = coefficientDeMarge(margeDevis, s.modeMarge);
    if (erreur) erreurs.margeDevis = `${erreur} Choisis un pourcentage plus petit (exemple : 30), ou le mode « ${MODES_MARGE[0].libelle} ».`;
  }
  if (!REGIMES_TVA.some((r) => r.id === s.regimeTva)) erreurs.regimeTva = 'Choisis le régime de TVA.';
  const proposes = Array.isArray(s.tauxProposes) ? s.tauxProposes.filter((t) => TAUX_TVA_DEFAUT.includes(t)) : [];
  if (!proposes.length) erreurs.tauxProposes = 'Garde au moins un taux de TVA proposé.';
  const tauxDefaut = lireNombre(s.tauxTvaDefaut);
  if (proposes.length && !proposes.includes(tauxDefaut)) erreurs.tauxTvaDefaut = 'Le taux par défaut doit être l’un des taux proposés.';
  const jours = lireNombre(s.dureeValiditeJours);
  if (jours === null || !Number.isInteger(jours) || jours < 1 || jours > LIMITES.jours) erreurs.dureeValiditeJours = `La durée de validité est un nombre entier de jours, entre 1 et ${LIMITES.jours} (exemple : 90).`;
  const mention = nettoyerTexteLibre(s.mentionEmetteur);
  if (mention.length > LIMITES.mention) erreurs.mentionEmetteur = `Le texte « Attestation et mentions » est trop long (${LIMITES.mention} caractères au plus).`;
  const mentionReduite = nettoyerTexteLibre(s.mentionTvaReduite);
  if (mentionReduite.length > LIMITE_MENTION_TVA_REDUITE) erreurs.mentionTvaReduite = `Le texte « Mention de TVA réduite » est trop long (${LIMITE_MENTION_TVA_REDUITE} caractères au plus).`;
  const motChoisi = MOTS_OUVRAGE.some((m) => m.id === s.motOuvrage) || s.motOuvrage === MOT_OUVRAGE_AUTRE;
  if (!motChoisi) erreurs.motOuvrage = `Choisis un mot parmi : ${[...MOTS_OUVRAGE.map((m) => m.singulier), 'autre'].join(', ')}.`;
  const mot = validerMotAutre(s.motOuvrageAutre);
  if (s.motOuvrage === MOT_OUVRAGE_AUTRE && !mot.autre) Object.assign(erreurs, Object.fromEntries(Object.entries(mot.erreurs).map(([k, v]) => [`motOuvrageAutre.${k}`, v])));
  const ent = validerEntreprise(s.entreprise);
  Object.assign(erreurs, ent.erreurs);
  if (Object.keys(erreurs).length) return { reglages: null, erreurs };
  return {
    reglages: {
      nomBordereau: s.nomBordereau,
      motOuvrage: s.motOuvrage, // recopié : l'enregistrement est un setDoc sans fusion, il effacerait le mot choisi
      motOuvrageAutre: mot.autre ?? {},
      modeMarge: s.modeMarge,
      marge,
      margeDevis,
      regimeTva: s.regimeTva,
      tauxProposes: TAUX_TVA_DEFAUT.filter((t) => proposes.includes(t)),
      tauxTvaDefaut: tauxDefaut,
      dureeValiditeJours: jours,
      etapeDevis: s.etapeDevis || '', // anciens réglages : recopiés tels quels (rien n'est effacé de la base)
      etapeAFaire: s.etapeAFaire || '',
      etapeEnvoye: s.etapeEnvoye || '',
      etapeAffaireCreee: typeof s.etapeAffaireCreee === 'string' ? s.etapeAffaireCreee : '', // recopiée telle quelle (setDoc sans fusion) ; l'étape n'est pas contrôlée ici
      mentionEmetteur: mention,
      mentionTvaReduite: mentionReduite,
      gestionDechets: s.gestionDechets !== false, // recopié : l'enregistrement est un setDoc sans fusion
      entreprise: ent.entreprise,
    },
    erreurs: {},
  };
}

/** Les clés des réglages (pour les tests et l'écran). */
export const CLES_REGLAGES_DEVIS = Object.freeze([...CLES_REGLAGES]);
