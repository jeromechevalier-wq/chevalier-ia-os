// Familles d'articles du Bordereau (module Devis) : une liste `[{ id, nom, actif, parentId? }]` à DEUX niveaux. Le premier niveau est celui des sept familles de départ
// (identifiant et type d'article fixes ; l'utilisateur peut les renommer et les désactiver) ; le second est libre (l'utilisateur crée « Carrelage » sous Fournitures). Un article porte au plus un `familleId` facultatif,
// et son type se déduit de la famille de premier niveau. Logique PURE (aucun accès à Firebase ni au navigateur), testée avec node --test.
// Stockage : document `devis_parametres/familles` = `{ liste: [...] }` (même collection que les réglages du module). Document absent = familles par défaut.
// Ce fichier n'importe rien : il est copié tel quel pour le serveur MCP (scripts/preparer-fonctions.js).
export const ID_DOCUMENT_FAMILLES = 'familles';
export const LIMITE_NOM_FAMILLE = 60;
/** Les sept familles de départ, avec leur type d'article (identifiants stables : un article peut s'y rattacher avant que le document existe). */
const DEPART = [
  ['Fournitures', 'fourniture'], ['Main d’œuvre', 'main_oeuvre'], ['Ouvrages', 'ouvrage'], ['Sous-traitance', 'sous_traitance'],
  ['Matériels', 'materiel'], ['Textes', 'texte'], ['Divers', 'divers'],
];
const PREMIER_NIVEAU = DEPART.map(([nom], i) => Object.freeze({ id: `famille-${i + 1}`, nom, actif: true }));
/** Sous-familles de départ, par famille de premier niveau (même ordre que DEPART). Identifiants stables `famille-<n>-<m>`. L'utilisateur peut les renommer et les désactiver (son choix l'emporte). */
const SOUS_DEPART = [
  ['Gros œuvre et maçonnerie', 'Carrelage et revêtements', 'Étanchéité et isolation', 'Plâtrerie et cloisons', 'Peinture', 'Menuiserie', 'Plomberie et sanitaire', 'Électricité', 'Quincaillerie et visserie'],
  ['Maçon', 'Carreleur', 'Étancheur', 'Plaquiste', 'Peintre', 'Menuisier', 'Plombier', 'Électricien', 'Aide de chantier'],
  ['Sols', 'Murs et cloisons', 'Toiture et étanchéité', 'Plomberie', 'Électricité'],
  ['Échafaudage', 'Terrassement', 'Électricité', 'Plomberie', 'Autres corps d’état'],
  ['Location d’engins', 'Outillage'],
  ['Introduction', 'Conditions et mentions'],
  ['Déchets et évacuation', 'Déplacement', 'Protection de chantier'],
];
const SOUS_FAMILLES_DEPART = SOUS_DEPART.flatMap((noms, i) => noms.map((nom, j) => Object.freeze({ id: `famille-${i + 1}-${j + 1}`, nom, actif: true, parentId: `famille-${i + 1}` })));
/** Les familles de départ : les sept de premier niveau (verrouillées), puis leurs sous-familles de départ (modifiables). */
export const FAMILLES_PAR_DEFAUT = Object.freeze([...PREMIER_NIVEAU, ...SOUS_FAMILLES_DEPART]);
/** Type d'article de chaque famille de départ (table en dur). */
const TYPE_DE_DEPART = Object.freeze(Object.fromEntries(DEPART.map(([, type], i) => [`famille-${i + 1}`, type])));

const espaces = (v) => String(v ?? '').replace(/[\s  ]+/g, ' ').trim();
const cle = (v) => espaces(v).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Une des sept familles de départ de premier niveau : son identifiant et son type sont fixes (son nom et son état actif se règlent comme ceux d'une sous-famille). */
export const estFamilleDepart = (id) => Object.hasOwn(TYPE_DE_DEPART, id);
/** Nom d'origine d'une famille de départ de premier niveau (ou null) : sert à savoir si l'utilisateur l'a renommée. */
export const nomDeDepart = (id) => PREMIER_NIVEAU.find((f) => f.id === id)?.nom ?? null;
/** Une sous-famille de départ se renomme et se désactive comme une sous-famille libre (elle est seulement proposée d'office). */
export const estSousFamilleDepart = (id) => SOUS_FAMILLES_DEPART.some((f) => f.id === id);
/** Famille de premier niveau = sans `parentId`. */
export const estPremierNiveau = (f) => !f?.parentId;

/**
 * Liste lue dans la base (document absent ou illisible = familles par défaut). Toujours une liste valide : les sept familles de départ sont toujours là,
 * en tête (sous leur nom d'origine et actives tant que l'utilisateur n'a rien changé ; son nom et son état actif l'emportent), suivies des sous-familles de départ
 * (même règle) ; une famille dont le parent n'existe pas (ou n'est pas de premier niveau) est ramenée au premier niveau.
 */
export function famillesDe(brut) {
  const liste = brut && Array.isArray(brut.liste) ? brut.liste : null;
  if (!liste) return FAMILLES_PAR_DEFAUT.map((f) => ({ ...f }));
  const valides = liste.filter((f) => f && typeof f.id === 'string' && f.id && typeof f.nom === 'string' && espaces(f.nom));
  const lues = valides.map((f) => ({ id: f.id, nom: espaces(f.nom), actif: f.actif !== false, ...(typeof f.parentId === 'string' && f.parentId ? { parentId: f.parentId } : {}) }));
  // Une famille de départ stockée (renommée ou désactivée) l'emporte sur le départ pour le nom et l'état actif seulement ; son identifiant, son type et son parent restent ceux du départ.
  const departDeLaListe = (id) => estSousFamilleDepart(id) || estFamilleDepart(id);
  const stockees = new Map(lues.filter((f) => departDeLaListe(f.id)).map((f) => [f.id, f]));
  const departs = FAMILLES_PAR_DEFAUT.map((f) => (stockees.has(f.id) ? { id: f.id, nom: stockees.get(f.id).nom, actif: stockees.get(f.id).actif, ...(f.parentId ? { parentId: f.parentId } : {}) } : { ...f }));
  const libres = lues.filter((f) => !departDeLaListe(f.id));
  const premiers = new Set([...PREMIER_NIVEAU.map((f) => f.id), ...libres.filter((f) => !f.parentId).map((f) => f.id)]);
  return [...departs, ...libres.map((f) => (f.parentId && !premiers.has(f.parentId) ? { id: f.id, nom: f.nom, actif: f.actif } : f))];
}

/** Famille qui porte ce nom (sans accents ni casse), hors `sauf`, parmi les familles de même parent (`parentId` vide = premier niveau). Actives ou non. */
export const familleDuNom = (familles, nom, sauf = null, parentId = '') => (familles ?? []).find((f) => f.id !== sauf && (f.parentId || '') === (parentId || '') && cle(f.nom) === cle(nom)) ?? null;

/** Message d'erreur pour un nom de famille, ou null s'il est valable. `parentId` : le parent de la famille (vide = premier niveau). */
export function erreursFamille(nom, familles = [], { sauf = null, parentId = '' } = {}) {
  const n = espaces(nom);
  if (!n) return 'Écris le nom de la famille (exemple : Plomberie).';
  if (n.length > LIMITE_NOM_FAMILLE) return `Le nom de la famille est trop long (${LIMITE_NOM_FAMILLE} caractères au plus).`;
  const pris = familleDuNom(familles, n, sauf, parentId);
  if (pris) return `La famille « ${pris.nom} » existe déjà${parentId ? ' à cet endroit' : ''}${pris.actif === false ? ' (désactivée : réactive-la plutôt)' : ''}. Choisis un autre nom.`;
  return null;
}

const refus = (message) => ({ erreur: message, familles: null, famille: null });

/** Famille d'identifiant donné, ou null. */
const trouver = (familles, id) => (familles ?? []).find((f) => f.id === id) ?? null;

/** Type d'article de la famille (celui de sa famille de premier niveau), ou null (aucune famille, famille inconnue ou famille libre sans type). */
export function typeDeFamille(familles, familleId) {
  const f = trouver(familles, familleId);
  if (!f) return null;
  const haut = f.parentId ? trouver(familles, f.parentId) ?? f : f;
  return TYPE_DE_DEPART[haut.id] ?? null;
}

/** Identifiant de la famille de départ d'un type d'article (ou null). */
export const familleDeType = (type) => Object.keys(TYPE_DE_DEPART).find((id) => TYPE_DE_DEPART[id] === type) ?? null;

/** Famille où l'on range un article : la sienne, sinon la famille de départ de son type (les anciens articles n'ont pas de migration), sinon '' (aucune). */
export const familleEffective = (article) => article?.familleId || familleDeType(article?.type) || '';

/** Le chemin d'une famille : « Fournitures › Carrelage » (ou « Fournitures » seul). Vide si la famille est inconnue. */
export function cheminFamille(familles, id) {
  const f = trouver(familles, id);
  if (!f) return '';
  const parent = f.parentId ? trouver(familles, f.parentId) : null;
  return parent ? `${parent.nom} › ${f.nom}` : f.nom;
}

/** L'arbre : `[{ famille, enfants: [famille…] }]`, le premier niveau d'abord (ordre de la liste), les sous-familles sous leur parent. */
export function arbreFamilles(familles) {
  const liste = familles ?? [];
  return liste.filter(estPremierNiveau).map((famille) => ({ famille, enfants: liste.filter((f) => f.parentId === famille.id) }));
}

/** Options du filtre « Famille » en arbre : une ligne par famille de premier niveau (mention « inclut ses sous-familles » si elle en a), ses sous-familles en retrait sous leur nom court, « Sans famille » à la fin. Familles illisibles ou vides : « Sans famille » seul. */
export function optionsFamillesArbre(familles) {
  // Une famille désactivée reste proposée (ses articles restent au Catalogue) avec la mention « désactivée ».
  const notes = (f, parent) => { const l = [...(parent ? ['inclut ses sous-familles'] : []), ...(f.actif === false ? ['désactivée'] : [])]; return l.length ? { note: l.join(' · ') } : {}; };
  const options = arbreFamilles(familles).flatMap(({ famille: f, enfants }) => [
    { valeur: f.id, libelle: f.nom ?? f.id, niveau: 0, ...notes(f, enfants.length > 0) },
    ...enfants.map((e) => ({ valeur: e.id, libelle: e.nom ?? e.id, niveau: 1, parent: f.id })), // une sous-famille désactivée porte déjà « (désactivée) » dans son nom (famillesPourFiltre)
  ]);
  return [...options, { valeur: 'sans_famille', libelle: 'Sans famille', niveau: 0 }];
}

/**
 * Familles proposées par le filtre « Famille » du Catalogue : une famille active toujours ; une famille INACTIVE (sous-famille ou premier niveau) seulement si un article y est encore rangé
 * (pour le premier niveau : dans elle ou dans une de ses sous-familles, un ancien article sans famille comptant dans la famille de départ de son type), alors avec la mention « (désactivée) » pour une sous-famille
 * et « · désactivée » pour le premier niveau (optionsFamillesArbre). Une famille inactive sans aucun article n'est pas proposée (démo d'un métier : plus de familles de maçon ni de Sous-traitance chez une agence).
 */
export function famillesPourFiltre(familles, articles) {
  const rangees = (articles ?? []).filter(Boolean);
  const utilisees = new Set(rangees.map((a) => a.familleId).filter(Boolean));
  const effectives = new Set(rangees.map(familleEffective).filter(Boolean));
  const liste = familles ?? [];
  const premierUtilise = (f) => effectives.has(f.id) || liste.some((x) => x.parentId === f.id && effectives.has(x.id));
  return liste.filter((f) => (f.parentId ? f.actif !== false || utilisees.has(f.id) : f.actif !== false || premierUtilise(f))).map((f) => (f.parentId && f.actif === false ? { ...f, nom: `${f.nom ?? f.id} (désactivée)` } : f));
}

/** La famille et ses sous-familles (identifiants) : un filtre sur « Fournitures » inclut « Carrelage ». */
export const idsAvecSousFamilles = (familles, id) => [id, ...(familles ?? []).filter((f) => f.parentId === id).map((f) => f.id)];

/**
 * Création : `{ erreur, familles (liste complète à enregistrer), famille }`. `nouvelId` : fonction qui donne un identifiant neuf.
 * Seule une sous-famille se crée (`parentId` obligatoire : une famille de premier niveau) ; le premier niveau est fixe.
 */
export function planCreationFamille(nom, familles, { nouvelId, parentId = '' } = {}) {
  const liste = familles ?? [];
  if (!parentId) return refus('Choisis d’abord la famille dans laquelle ranger la nouvelle (Fournitures, Main d’œuvre…) : le premier niveau ne change pas.');
  const parent = trouver(liste, parentId);
  if (!parent) return refus('Famille introuvable : recharge la page.');
  if (parent.actif === false) return refus(`Réactive d’abord « ${parent.nom} ».`);
  if (parent.parentId) return refus(`« ${parent.nom} » est déjà une sous-famille : on ne peut pas en créer dedans (deux niveaux au plus). Choisis une famille de premier niveau.`);
  const erreur = erreursFamille(nom, liste, { parentId });
  if (erreur) return refus(erreur);
  const famille = { id: nouvelId(), nom: espaces(nom), actif: true, parentId };
  return { erreur: null, familles: [...liste.map((f) => ({ ...f })), famille], famille };
}

/** Renommer une famille (les articles gardent leur lien : il passe par l'identifiant, et le type d'une famille de départ ne change pas). */
export function planRenommerFamille(id, nom, familles) {
  const liste = familles ?? [];
  const f = trouver(liste, id);
  if (!f) return refus('Famille introuvable : recharge la page.');
  const erreur = erreursFamille(nom, liste, { sauf: id, parentId: f.parentId || '' });
  if (erreur) return refus(erreur);
  const neuve = { ...f, nom: espaces(nom) };
  return { erreur: null, familles: liste.map((x) => (x.id === id ? neuve : { ...x })), famille: neuve };
}

/** Message quand on veut désactiver la dernière famille de premier niveau active (il en faut au moins une). */
export const ERREUR_DERNIERE_FAMILLE = 'Il en faut au moins une.';
/** Désactiver (`actif = false`) ou réactiver une famille. Jamais de suppression : les articles déjà rattachés la gardent. Il reste toujours au moins une famille de premier niveau active. */
export function planDesactiverFamille(id, familles, actif = false) {
  const liste = familles ?? [];
  const f = trouver(liste, id);
  if (!f) return refus('Famille introuvable : recharge la page.');
  if (actif === false && estPremierNiveau(f) && f.actif !== false && !liste.some((x) => x.id !== id && estPremierNiveau(x) && x.actif !== false)) return refus(ERREUR_DERNIERE_FAMILLE);
  const neuve = { ...f, actif };
  return { erreur: null, familles: liste.map((x) => (x.id === id ? neuve : { ...x })), famille: neuve };
}

/** Contrôle du `familleId` d'un article : message, ou null. Vide = pas de famille. Une famille désactivée reste permise si l'article l'a déjà (`actuel`). */
export function erreurFamilleArticle(familleId, familles, actuel = null) {
  if (familleId === undefined || familleId === null || familleId === '') return null;
  const f = (familles ?? []).find((x) => x.id === familleId);
  if (!f) return 'Cette famille n’existe pas. Choisis une famille de la liste, ou laisse le champ vide.';
  if (f.actif === false && familleId !== actuel) return `La famille « ${f.nom} » est désactivée. Choisis-en une autre, ou réactive-la.`;
  const parent = f.parentId ? (familles ?? []).find((x) => x.id === f.parentId) : null;
  if (parent && parent.actif === false && familleId !== actuel) return `La famille « ${parent.nom} » est désactivée. Choisis-en une autre, ou réactive-la.`;
  return null;
}

/** Nom de la famille d'un article (vide si aucune). */
export const nomFamille = (familles, familleId) => (familles ?? []).find((f) => f.id === familleId)?.nom ?? '';

/** Combien d'articles ACTIFS sont rangés dans cette famille (sous-familles comprises), pour le dire avant de la désactiver. Un ancien article sans famille compte dans la famille de départ de son type. */
export function nombreArticlesDeFamille(familles, articles, id) {
  const ids = new Set(idsAvecSousFamilles(familles, id));
  return (articles ?? []).filter((a) => a?.actif !== false && ids.has(familleEffective(a))).length;
}

/** Famille proposée d'office à un article neuf : « Fournitures » si elle est active, sinon la première famille de premier niveau active qui n'est pas « Textes » (un texte n'a pas de prix), sinon la première active, sinon '' (aucune). */
export function familleParDefaut(familles) {
  const actives = (familles ?? []).filter((f) => estPremierNiveau(f) && f.actif !== false);
  return (actives.find((f) => f.id === 'famille-1') ?? actives.find((f) => typeDeFamille(familles, f.id) !== 'texte') ?? actives[0])?.id ?? '';
}
