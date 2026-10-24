// Éditeur de devis : fonctions PURES (aucun accès à Firebase, au réseau ni au navigateur), testées avec node --test (tests/devis-editeur.test.js).
// L'écran (editeur-ecran.js) les appelle ; aucun calcul de prix ni de total n'est refait ici : logique.js reste la seule source (marge, totaux, finalisation).
//
// Modèle : le devis stocke des `sections`, chacune avec ses `lignes`. L'écran montre une liste à plat d'ÉLÉMENTS, plus simple à déplacer :
//   { genre: 'section', id, titre, marge?, sautDePageAvant? }  ou  { genre: 'ligne', id, type?, libelle, quantite, unite, prixAchat, marge?, tauxTva?, … }
// Une ligne qui précède toute section va dans une première section sans titre (id `sec-debut`), qui ne s'affiche pas (une première section d'un autre identifiant, même sans titre, s'affiche).
//
// Décisions prises seul (24/10/2026) :
// - Le prix de vente d'une ligne se saisit, mais le modèle stocke un prix d'achat et une marge : modifier le prix de vente règle la MARGE PROPRE de la ligne
//   (la ligne ne suit alors plus la marge du devis). Sans prix d'achat connu (ligne libre), le prix saisi devient le prix d'achat avec une marge de 0 %.
// - Une ligne « Texte » est une ligne de type `texte` (quantité 1, prix 0) : elle compte 0 dans les totaux et passe la finalisation. Le gabarit imprimé la montre
//   encore avec un prix à 0,00 € : à traiter dans document.js (hors de ce lot).
// - Le saut de page est un réglage de section (`sautDePageAvant`, déjà lu par vueClient), pas un élément à part.
// - Une section se déplace, se duplique et se supprime avec ses lignes (le groupe jusqu'à la section suivante).
// - Trois niveaux (24/10/2026) : section (1), sous-section (1.1, `niveau: 2` dans `sections`), ligne (1.1.1). Une section de niveau 1 emporte ses sous-sections ; une sous-section
//   ne change jamais de section de niveau 1 en se déplaçant (elle reste entre ses sœurs). Un devis sans `niveau` se comporte exactement comme avant.
import {
  coefficientDeMarge, prixVenteUnitaire, prixVenteDeLigne, totauxDevis, versCentimes, erreursChantier, numerosDevis,
  coefficientDepuisPourcentage, coefficientDepuisMontant, coefficientDepuisSaisie,
} from './logique.js';
import { descriptionOuvrage, figerOuvragePourLigne, articlesParId, TYPE_OUVRAGE } from './ouvrages.js';
import { TYPE_TEXTE, lireNombre } from './articles.js';

export const ID_SECTION_DEBUT = 'sec-debut';
export const TYPE_LIGNE_LIBRE = 'libre';
/** Champs du devis que l'éditeur enregistre (jamais numéro, statut, version, totaux… : ils sont protégés). */
export const CHAMPS_ENREGISTRES = Object.freeze([
  'affaireId', 'organisationId', 'personneId', 'adresses', 'chantier', 'destinataires', 'objet', 'sections', 'remise', 'marge', 'modeMarge',
  'tauxTvaDefaut', 'acompte', 'texteLibre', 'notesBasDePage', 'expireLe', 'dateEmission', 'ajustement', 'affichage', 'autoliquidation',
]);
export const AVERTISSEMENTS = Object.freeze({
  aucuneLigne: 'Ce devis n’a encore aucune ligne.',
  totalZero: 'Le total du devis est à 0 €.',
  sansQuantite: 'Une ligne n’a pas de quantité : elle compte pour 0 €.',
});

const estNombre = (v) => typeof v === 'number' && Number.isFinite(v);
const copie = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
const estSection = (e) => e?.genre === 'section';

// ---------------------------------------------------------------- à plat <-> sections
/** Sections du devis -> éléments à plat. La première section sans titre n'est pas montrée (ses lignes viennent en tête). */
export function aplatir(sections) {
  const sortie = [];
  (Array.isArray(sections) ? sections : []).forEach((s, i) => {
    const { lignes, ...entete } = s ?? {};
    const sansTitre = i === 0 && entete.id === ID_SECTION_DEBUT && !String(entete.titre ?? '').trim() && !entete.sautDePageAvant && !estNombre(entete.marge);
    if (!sansTitre) sortie.push({ ...copie(entete), genre: 'section', titre: String(entete.titre ?? '') });
    for (const l of Array.isArray(lignes) ? lignes : []) sortie.push({ ...copie(l), genre: 'ligne' });
  });
  return sortie;
}

/** Éléments à plat -> sections du devis (l'inverse d'`aplatir`). */
export function assembler(elements) {
  const sections = [];
  let courante = null;
  for (const e of Array.isArray(elements) ? elements : []) {
    if (estSection(e)) {
      const { genre: _g, ...reste } = e;
      courante = { ...copie(reste), lignes: [] };
      sections.push(courante);
    } else {
      if (!courante) { courante = { id: ID_SECTION_DEBUT, titre: '', lignes: [] }; sections.push(courante); }
      const { genre: _g, ...ligne } = e;
      courante.lignes.push(copie(ligne));
    }
  }
  return sections;
}

const niveauDe = (e) => (e?.niveau === 2 ? 2 : 1);
const groupe = (elements, i) => {
  // indices [i, fin[ : la section et ses lignes jusqu'à la section suivante de même niveau ou de niveau supérieur (une section de niveau 1 emporte ses sous-sections) ; une ligne seule = elle-même
  if (!estSection(elements[i])) return [i, i + 1];
  const niveau = niveauDe(elements[i]);
  let fin = i + 1;
  while (fin < elements.length && !(estSection(elements[fin]) && niveauDe(elements[fin]) <= niveau)) fin += 1;
  return [i, fin];
};
const indexDe = (elements, id) => elements.findIndex((e) => e.id === id);

// ---------------------------------------------------------------- création des éléments
export const sectionNeuve = (id, titre = '') => ({ genre: 'section', id, titre });
export const sousSectionNeuve = (id, titre = '') => ({ genre: 'section', id, titre, niveau: 2 });
export const ligneLibre = (id) => ({ genre: 'ligne', id, type: TYPE_LIGNE_LIBRE, libelle: '', quantite: 1, unite: 'u', prixAchat: 0, marge: 0 });
export const ligneTexte = (id) => ({ genre: 'ligne', id, type: TYPE_TEXTE, libelle: '', quantite: 1, unite: '', prixAchat: 0, marge: 0 });

/** Marge (en %) qui donne ce prix de vente à partir de ce prix d'achat, dans ce mode. Null si impossible ou si l'arrondi ne retombe pas sur le prix. */
export function margePourPrixVente(prixAchat, prixVente, mode) {
  if (!estNombre(prixAchat) || !estNombre(prixVente) || prixAchat <= 0 || prixVente < 0) return null;
  let marge = null;
  if (mode === 'majoration') marge = (prixVente / prixAchat - 1) * 100;
  else if (mode === 'marge_vente') marge = prixVente > 0 ? (1 - prixAchat / prixVente) * 100 : null;
  if (marge === null || !Number.isFinite(marge) || coefficientDeMarge(marge, mode).erreur) return null;
  return versCentimes(prixVenteUnitaire(prixAchat, marge, mode)) === versCentimes(prixVente) ? marge : null;
}

const sansCout = (ligne) => ligne?.type === TYPE_LIGNE_LIBRE || !(estNombre(ligne?.prixAchat) && ligne.prixAchat > 0);

/** Peut-on régler ce prix de vente ? Faux seulement pour une ligne dont le coût est connu et dont la marge serait impossible (ex. 0 € en marge sur le prix de vente) : la saisie est alors `invalide`, rien n'est effacé. */
export function prixVenteReglable(ligne, prixVente, modeMarge) {
  if (!estNombre(prixVente) || prixVente < 0) return false;
  return sansCout(ligne) || margePourPrixVente(ligne.prixAchat, prixVente, modeMarge) !== null;
}

/**
 * Règle le prix de vente d'une ligne (voir « Décisions ») : renvoie la ligne modifiée. Ligne libre ou sans coût connu : le prix saisi devient le prix d'achat, marge 0.
 * Ligne du Bordereau : la marge propre est réglée ; si c'est impossible (`prixVenteReglable` faux), la ligne est rendue telle quelle.
 */
export function avecPrixVente(ligne, prixVente, modeMarge) {
  if (!prixVenteReglable(ligne, prixVente, modeMarge)) return ligne;
  if (sansCout(ligne)) return { ...ligne, prixAchat: Math.round(prixVente * 100) / 100, marge: 0 };
  return { ...ligne, marge: margePourPrixVente(ligne.prixAchat, prixVente, modeMarge) };
}

/** Description d'une ligne d'ouvrage selon sa quantité (composition figée). Texte vide pour une autre ligne. */
export function descriptionDeLigne(ligne) {
  if (!ligne?.ouvrage?.composants?.length) return typeof ligne?.description === 'string' ? ligne.description : '';
  return descriptionOuvrage({ composants: ligne.ouvrage.composants }, {}, ligne.quantite);
}

/**
 * Ligne de devis copiée d'un article du Bordereau (libellé, unité, prix d'achat, TVA, code, famille : plus rien ne change si l'article change ensuite).
 * Un ouvrage est figé avec sa composition. `devis` : { marge, modeMarge } pour calculer le prix des composants. `articles` : tout le Bordereau.
 */
export function ligneDepuisArticle(article, { id, articles = [], devis = {} } = {}) {
  const base = {
    genre: 'ligne', id, articleId: article.id, type: article.type ?? null, libelle: article.libelle ?? '', unite: article.unite ?? '', quantite: 1,
  };
  if (article.code) base.code = article.code;
  if (article.familleId) base.familleId = article.familleId;
  if (article.reference) base.reference = article.reference;
  if (article.marque) base.marque = article.marque;
  if (estNombre(article.tauxTva)) base.tauxTva = article.tauxTva;
  if (article.type === TYPE_TEXTE) return { ...base, quantite: 1, unite: '', prixAchat: 0, marge: 0 };
  if (article.type === TYPE_OUVRAGE) {
    const fige = figerOuvragePourLigne(article, articlesParId(articles), { marge: devis.marge, modeMarge: devis.modeMarge });
    const ligne = { ...base, ouvrage: { composants: fige.composants, prixVenteHT: fige.prixVenteHT, deboursSecHT: fige.deboursSecHT } };
    const reglee = avecPrixVente({ ...ligne, prixAchat: fige.deboursSecHT }, fige.prixVenteHT, devis.modeMarge);
    return { ...reglee, description: descriptionDeLigne(reglee) };
  }
  const ligne = { ...base, prixAchat: estNombre(article.prixAchat) ? article.prixAchat : 0 };
  if (estNombre(article.marge)) ligne.marge = article.marge;
  return ligne;
}

// ---------------------------------------------------------------- opérations sur la liste (chacune rend une NOUVELLE liste de sections)
const surElements = (sections, f) => assembler(f(aplatir(sections)));

/**
 * Ajoute un élément au bout, ou juste au-dessous de l'élément `apres` (au début de sa section si c'est une section).
 * Une sous-section n'a de sens que sous une section : s'il n'y en a aucune avant le point d'insertion, une section de niveau 1 (`idSection`) est ajoutée juste avant.
 */
export function ajouterElement(sections, element, apres = null, idSection = null) {
  return surElements(sections, (els) => {
    const i = apres ? indexDe(els, apres) : -1;
    const place = i === -1 ? els.length : i + 1;
    const avant = els.slice(0, place);
    const nouveaux = [element];
    if (estSection(element) && element.niveau === 2 && !avant.some(estSection)) nouveaux.unshift(sectionNeuve(idSection ?? `${element.id}-s`));
    return [...avant, ...nouveaux, ...els.slice(place)];
  });
}

/**
 * Ajoute un élément juste AU-DESSUS de l'élément `avantId` (menu « Insérer au-dessus »). Même règle que `ajouterElement` pour une sous-section sans section avant elle.
 * Si `avantId` est introuvable, l'élément va au bout.
 */
export function ajouterAvant(sections, element, avantId, idSection = null) {
  return surElements(sections, (els) => {
    const i = indexDe(els, avantId);
    const place = i === -1 ? els.length : i;
    const avant = els.slice(0, place);
    const nouveaux = [element];
    if (estSection(element) && element.niveau === 2 && !avant.some(estSection)) nouveaux.unshift(sectionNeuve(idSection ?? `${element.id}-s`));
    return [...avant, ...nouveaux, ...els.slice(place)];
  });
}

/**
 * Ajoute plusieurs éléments à la FIN de la section `idSection` (ses propres lignes, avant la section suivante, sous-sections comprises) ;
 * sans section (ou identifiant inconnu), à la fin du devis. Sert à la Bibliothèque.
 */
export function ajouterFinDeSection(sections, elements, idSection = null) {
  return surElements(sections, (els) => {
    const i = idSection ? indexDe(els, idSection) : -1;
    if (i === -1 || !estSection(els[i])) return [...els, ...elements];
    let fin = i + 1;
    while (fin < els.length && !estSection(els[fin])) fin += 1;
    return [...els.slice(0, fin), ...elements, ...els.slice(fin)];
  });
}

/** Section qui contient l'élément `id` (lui-même si c'est une section) ; la dernière section du devis si `id` est absent ; null s'il n'y a aucune section. */
export function sectionDe(sections, id = null) {
  const els = aplatir(sections);
  const i = id ? indexDe(els, id) : els.length - 1;
  for (let k = i === -1 ? els.length - 1 : i; k >= 0; k -= 1) if (estSection(els[k])) return els[k].id;
  return null;
}

/**
 * Change les éléments d'une ligne d'ouvrage (menu « Configurer les éléments de l'ouvrage ») : recalcule la composition figée, le prix et la description.
 * `ouvrage` : { composants: [{ articleId, quantite }], prixVenteForce? }. La ligne garde son identifiant, sa quantité, sa TVA et son libellé.
 */
export function ligneAvecComposants(ligne, ouvrage, { articles = [], devis = {} } = {}) {
  const fige = figerOuvragePourLigne(ouvrage, articlesParId(articles), { marge: devis.marge, modeMarge: devis.modeMarge });
  const base = { ...ligne, ouvrage: { composants: fige.composants, prixVenteHT: fige.prixVenteHT, deboursSecHT: fige.deboursSecHT } };
  const reglee = avecPrixVente({ ...base, prixAchat: fige.deboursSecHT }, fige.prixVenteHT, devis.modeMarge);
  return { ...reglee, description: descriptionDeLigne(reglee) };
}

/**
 * Ajustement global saisi dans l'un des trois champs liés : `champ` = 'pourcentage' | 'montant' | 'coefficient', `texte` = ce qui est écrit.
 * Rend { coefficient, erreur } : en cas d'erreur (texte illisible, coefficient ≤ 0), rien n'est enregistré.
 */
export function ajustementDepuisSaisie(devis, champ, texte) {
  const n = lireNombre(texte);
  if (champ === 'pourcentage') return coefficientDepuisPourcentage(n);
  if (champ === 'montant') return coefficientDepuisMontant(devis, n);
  return coefficientDepuisSaisie(n);
}
/** Valeur à enregistrer pour un coefficient : aucun ajustement quand il vaut 1. */
export const ajustementAEnregistrer = (coefficient) => (coefficient === 1 ? null : { coefficient });

/** Monte (-1) ou descend (+1) un élément d'un cran ; une section emporte ses lignes (et ses sous-sections). Aux bornes : rien ne change. */
export function deplacerElement(sections, id, sens) {
  return surElements(sections, (els) => {
    const i = indexDe(els, id);
    if (i === -1 || (sens !== -1 && sens !== 1)) return els;
    const [d, f] = groupe(els, i);
    const niveau = niveauDe(els[d]);
    if (sens === -1) {
      if (d === 0) return els;
      // la ligne passe au-dessus de l'élément précédent ; une section passe au-dessus de la section précédente de son niveau (groupe entier)
      let cible = d - 1;
      if (estSection(els[d])) {
        while (cible > 0 && !(estSection(els[cible]) && niveauDe(els[cible]) <= niveau)) cible -= 1;
        if (!estSection(els[cible])) return els; // des lignes libres en tête : une section ne passe jamais au-dessus (elle les absorberait)
        if (niveau === 2 && niveauDe(els[cible]) === 1) return els; // une sous-section ne passe jamais au-dessus de sa section
      }
      return [...els.slice(0, cible), ...els.slice(d, f), ...els.slice(cible, d), ...els.slice(f)];
    }
    if (f >= els.length) return els;
    // une ligne descend d'un cran (sous l'en-tête de section suivant, elle entre dans cette section) ; une section passe sous la section suivante de son niveau
    if (estSection(els[d]) && niveau === 2 && !(estSection(els[f]) && niveauDe(els[f]) === 2)) return els; // dernière sous-section : elle reste dans sa section
    const [d2, f2] = estSection(els[d]) ? groupe(els, f) : [f, f + 1];
    return [...els.slice(0, d), ...els.slice(d2, f2), ...els.slice(d, f), ...els.slice(f2)];
  });
}

/** Peut-on monter / descendre cet élément ? (pour griser les flèches) */
export function deplacementsPossibles(sections, id) {
  const els = aplatir(sections);
  const i = indexDe(els, id);
  if (i === -1) return { monter: false, descendre: false };
  const apres = deplacerElement(sections, id, 1);
  const avant = deplacerElement(sections, id, -1);
  // On compare à la version normalisée : un devis écrit à la main (sans `titre` ou `lignes`) ne doit pas griser à tort les flèches.
  const reference = JSON.stringify(assembler(aplatir(sections)));
  const meme = (autre) => JSON.stringify(autre) === reference;
  return { monter: !meme(avant), descendre: !meme(apres) };
}

/** Duplique un élément juste au-dessous (une section : avec ses lignes). `nouvelId()` donne un identifiant neuf à chaque appel. Rend { sections, ids }. */
export function dupliquerElement(sections, id, nouvelId) {
  const ids = [];
  const resultat = surElements(sections, (els) => {
    const i = indexDe(els, id);
    if (i === -1) return els;
    const [d, f] = groupe(els, i);
    const copies = els.slice(d, f).map((e) => { const n = nouvelId(); ids.push(n); return { ...copie(e), id: n }; });
    return [...els.slice(0, f), ...copies, ...els.slice(f)];
  });
  return { sections: resultat, ids };
}

/** Supprime un élément (une section : avec ses lignes). */
export function supprimerElement(sections, id) {
  return surElements(sections, (els) => {
    const i = indexDe(els, id);
    if (i === -1) return els;
    const [d, f] = groupe(els, i);
    return [...els.slice(0, d), ...els.slice(f)];
  });
}

/** Nombre de lignes qu'emporterait la suppression de cet élément (1 pour une ligne ; les lignes d'une section). */
export function lignesEmportees(sections, id) {
  const els = aplatir(sections);
  const i = indexDe(els, id);
  if (i === -1) return 0;
  const [d, f] = groupe(els, i);
  return els.slice(d, f).filter((e) => !estSection(e)).length;
}

/** Remplace des champs d'un élément (ligne ou section) ; le reste est conservé. */
export function majElement(sections, id, patch) {
  return sections.map((s) => {
    if (s.id === id) return { ...s, ...patch };
    return { ...s, lignes: (s.lignes ?? []).map((l) => (l.id === id ? { ...l, ...patch } : l)) };
  });
}

/** Une ligne par son identifiant, avec sa section. */
export function trouverLigne(sections, id) {
  for (const section of sections ?? []) {
    const ligne = (section.lignes ?? []).find((l) => l.id === id);
    if (ligne) return { section, ligne };
  }
  return null;
}

// ---------------------------------------------------------------- numérotation affichée (la même que celle du document : 1, 1.1, 1.1.1, 1.2, 2…)
/** { [id]: « 2 » ou « 2.3 » } : le numéro de section est sa position (la première section sans titre compte aussi), comme dans vueClient. */
export function numerotation(sections) {
  const n = {};
  const numeros = numerosDevis(sections);
  (sections ?? []).forEach((s, i) => {
    n[s.id] = numeros[i].numero;
    (s.lignes ?? []).forEach((l, j) => { n[l.id] = numeros[i].lignes[j]; });
  });
  return n;
}

// ---------------------------------------------------------------- avertissements (jamais bloquants), champs obligatoires, enregistrement
const lignesDe = (devis) => (devis?.sections ?? []).flatMap((s) => s.lignes ?? []);

/** Les trois avertissements possibles, dans l'ordre : aucune ligne, total à zéro, ligne sans quantité. Liste vide = rien à signaler. */
export function avertissements(devis) {
  const lignes = lignesDe(devis);
  const sortie = [];
  if (!lignes.length) sortie.push({ code: 'aucuneLigne', message: AVERTISSEMENTS.aucuneLigne });
  else {
    let total = 0;
    try { total = totauxDevis(devis).totalHt; } catch { total = 0; }
    if (total === 0) sortie.push({ code: 'totalZero', message: AVERTISSEMENTS.totalZero });
  }
  if (lignes.some((l) => l.type !== TYPE_TEXTE && !(estNombre(l.quantite) && l.quantite > 0))) sortie.push({ code: 'sansQuantite', message: AVERTISSEMENTS.sansQuantite });
  return sortie;
}

/** Champs obligatoires manquants pour enregistrer : clés `affaire` (obligatoire) et `client`. */
export function champsManquants(devis) {
  const m = [];
  if (!devis?.affaireId) m.push('affaire');
  return m;
}

/** Messages de saisie du bloc chantier (dates, durée, code postal) : ceux de logique.js. */
export const erreursDuChantier = (devis) => erreursChantier(devis?.chantier);

/** Les champs que l'éditeur écrit, sans valeur `undefined` (Firestore les refuse), comme copie indépendante. */
export function champsAEnregistrer(devis) {
  const sortie = {};
  for (const cle of CHAMPS_ENREGISTRES) {
    if (devis?.[cle] !== undefined) sortie[cle] = copie(devis[cle]);
  }
  return sortie;
}

/** Y a-t-il des changements entre ce qui est enregistré et ce qui est à l'écran ? (comparaison des seuls champs enregistrés) */
export function aDesChangements(enregistre, courant) {
  return JSON.stringify(champsAEnregistrer(enregistre)) !== JSON.stringify(champsAEnregistrer(courant));
}

/** Faut-il demander avant de quitter ? Oui s'il y a des changements non enregistrés, ou un enregistrement en cours. */
export function sortieAConfirmer({ enregistre, courant, enCours = false, lectureSeule = false } = {}) {
  if (lectureSeule) return false;
  return Boolean(enCours) || aDesChangements(enregistre, courant);
}

/** Libellé de l'indicateur d'enregistrement. `etat` : 'enregistre' | 'attente' | 'enCours' | 'erreur'. */
export function libelleEnregistrement(etat) {
  return { enregistre: 'Enregistré', attente: 'Modifications non enregistrées', enCours: 'Enregistrement…', erreur: 'Échec de l’enregistrement' }[etat] ?? '';
}

// ---------------------------------------------------------------- client, adresse, destinataires
const nettoie = (t) => String(t ?? '').replace(/[ \t]+/g, ' ').trim();

/** E-mails d'une fiche (personne ou organisation), sans doublon. */
export function emailsDeFiche(fiche) {
  const liste = [];
  for (const e of Array.isArray(fiche?.emails) ? fiche.emails : []) liste.push(typeof e === 'string' ? e : e?.valeur);
  if (typeof fiche?.email === 'string') liste.push(fiche.email);
  const vus = new Set();
  return liste.map(nettoie).filter((x) => x && !vus.has(x.toLowerCase()) && vus.add(x.toLowerCase()));
}

/** { texte } d'une adresse, ou null. */
export const adresseTexteSimple = (texte) => (nettoie(texte).length ? { texte: String(texte).trim() } : null);

/** Texte d'une adresse du devis (objet { texte } ou texte simple). */
export const texteDeAdresse = (a) => (typeof a === 'string' ? a.trim() : String(a?.texte ?? '').trim());

/**
 * Valeurs d'un nouveau brouillon pour une affaire et un client : identifiants, adresses (client par défaut), destinataire (premier e-mail du client).
 * `client` : { type: 'organisation' | 'personne', fiche, adresse (texte) } ou null.
 */
export function valeursDeCreation(affaire, client) {
  const adresse = adresseTexteSimple(client?.adresse);
  return {
    affaireId: affaire.id,
    organisationId: client?.type === 'organisation' ? client.fiche.id : null,
    personneId: client?.type === 'personne' ? client.fiche.id : null,
    adresses: { commanditaire: adresse, facturation: adresse, chantier: adresse },
    destinataires: client ? emailsDeFiche(client.fiche).slice(0, 1) : [],
  };
}

/** Bloc `chantier` mis à jour : l'adresse (texte), sans toucher aux dates déjà saisies. */
export function chantierAvecAdresse(chantier, texte) {
  const base = chantier && typeof chantier === 'object' ? { ...chantier } : {};
  const a = adresseTexteSimple(texte);
  if (a) base.adresse = a; else delete base.adresse;
  return base;
}

/** Nombre saisi pour la durée / une quantité : null si illisible. */
export const lireSaisie = (s) => lireNombre(s);

// ---------------------------------------------------------------- duplication d'un devis
/** Valeurs du brouillon qui copie un devis : tout le contenu sauf numéro, statut, version, totaux (nouveaux identifiants de section et de ligne). */
export function copieDeDevis(source, nouvelId) {
  const els = aplatir(source.sections).map((e) => ({ ...copie(e), id: nouvelId() }));
  const sections = assembler(els).map((s) => ({ ...s, lignes: s.lignes.map((l) => { const { prixVente: _p, prixVenteAjuste: _a, ...reste } = l; return reste; }) }));
  const patch = champsAEnregistrer({ ...source, sections });
  delete patch.expireLe;
  delete patch.dateEmission;
  return patch;
}

/** Lecture seule : tout devis qui n'est pas un brouillon. */
export const estLectureSeule = (devis) => devis?.statut !== 'brouillon';

/** Prix de vente unitaire affiché d'une ligne (nombre ou null), selon la marge du devis, de la section et de la ligne. */
export function prixVenteAffiche(devis, section, ligne) {
  return prixVenteDeLigne({ ...devis, statut: 'brouillon' }, section, ligne);
}

/** Même contenu (champs enregistrés), quel que soit l'ordre des clés : sert à reconnaître un devis modifié ailleurs. */
export function memeContenu(a, b) {
  const stable = (v) => (Array.isArray(v) ? v.map(stable) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, stable(v[k])])) : v);
  return JSON.stringify(stable(champsAEnregistrer(a))) === JSON.stringify(stable(champsAEnregistrer(b)));
}
