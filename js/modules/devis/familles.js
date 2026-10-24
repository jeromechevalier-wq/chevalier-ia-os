// Familles d'articles du Bordereau (module Devis) : une liste `[{ id, nom, actif, parentId? }]` à DEUX niveaux. Le premier niveau est fixe (les sept familles de départ,
// verrouillées, chacune liée à un type d'article) ; le second est libre (l'utilisateur crée « Carrelage » sous Fournitures). Un article porte au plus un `familleId` facultatif,
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
export const FAMILLES_PAR_DEFAUT = Object.freeze(DEPART.map(([nom], i) => Object.freeze({ id: `famille-${i + 1}`, nom, actif: true })));
/** Type d'article de chaque famille de départ (table en dur). */
const TYPE_DE_DEPART = Object.freeze(Object.fromEntries(DEPART.map(([, type], i) => [`famille-${i + 1}`, type])));

const espaces = (v) => String(v ?? '').replace(/[\s  ]+/g, ' ').trim();
const cle = (v) => espaces(v).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Une famille de départ est verrouillée : ni renommée, ni désactivée. */
export const estFamilleDepart = (id) => Object.hasOwn(TYPE_DE_DEPART, id);
/** Famille de premier niveau = sans `parentId`. */
export const estPremierNiveau = (f) => !f?.parentId;

/**
 * Liste lue dans la base (document absent ou illisible = familles par défaut). Toujours une liste valide : les sept familles de départ sont toujours là,
 * en tête, sous leur nom d'origine et actives (verrouillées) ; une famille dont le parent n'existe pas (ou n'est pas de premier niveau) est ramenée au premier niveau.
 */
export function famillesDe(brut) {
  const liste = brut && Array.isArray(brut.liste) ? brut.liste : null;
  if (!liste) return FAMILLES_PAR_DEFAUT.map((f) => ({ ...f }));
  const lues = liste
    .filter((f) => f && typeof f.id === 'string' && f.id && typeof f.nom === 'string' && espaces(f.nom) && !estFamilleDepart(f.id))
    .map((f) => ({ id: f.id, nom: espaces(f.nom), actif: f.actif !== false, ...(typeof f.parentId === 'string' && f.parentId ? { parentId: f.parentId } : {}) }));
  const premiers = new Set([...FAMILLES_PAR_DEFAUT.map((f) => f.id), ...lues.filter((f) => !f.parentId).map((f) => f.id)]);
  return [...FAMILLES_PAR_DEFAUT.map((f) => ({ ...f })), ...lues.map((f) => (f.parentId && !premiers.has(f.parentId) ? { id: f.id, nom: f.nom, actif: f.actif } : f))];
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
  if (parent.parentId) return refus(`« ${parent.nom} » est déjà une sous-famille : on ne peut pas en créer dedans (deux niveaux au plus). Choisis une famille de premier niveau.`);
  const erreur = erreursFamille(nom, liste, { parentId });
  if (erreur) return refus(erreur);
  const famille = { id: nouvelId(), nom: espaces(nom), actif: true, parentId };
  return { erreur: null, familles: [...liste.map((f) => ({ ...f })), famille], famille };
}

/** Renommer une famille (les articles gardent leur lien : il passe par l'identifiant). Les sept familles de départ ne se renomment pas. */
export function planRenommerFamille(id, nom, familles) {
  const liste = familles ?? [];
  const f = trouver(liste, id);
  if (!f) return refus('Famille introuvable : recharge la page.');
  if (estFamilleDepart(id)) return refus(`« ${f.nom} » est une famille de départ : elle ne se renomme pas. Tu peux créer des sous-familles dedans.`);
  const erreur = erreursFamille(nom, liste, { sauf: id, parentId: f.parentId || '' });
  if (erreur) return refus(erreur);
  const neuve = { ...f, nom: espaces(nom) };
  return { erreur: null, familles: liste.map((x) => (x.id === id ? neuve : { ...x })), famille: neuve };
}

/** Désactiver (`actif = false`) ou réactiver une famille. Jamais de suppression : les articles déjà rattachés la gardent. Les familles de départ restent actives. */
export function planDesactiverFamille(id, familles, actif = false) {
  const liste = familles ?? [];
  const f = trouver(liste, id);
  if (!f) return refus('Famille introuvable : recharge la page.');
  if (estFamilleDepart(id) && actif === false) return refus(`« ${f.nom} » est une famille de départ : elle ne se désactive pas.`);
  const neuve = { ...f, actif };
  return { erreur: null, familles: liste.map((x) => (x.id === id ? neuve : { ...x })), famille: neuve };
}

/** Contrôle du `familleId` d'un article : message, ou null. Vide = pas de famille. Une famille désactivée reste permise si l'article l'a déjà (`actuel`). */
export function erreurFamilleArticle(familleId, familles, actuel = null) {
  if (familleId === undefined || familleId === null || familleId === '') return null;
  const f = (familles ?? []).find((x) => x.id === familleId);
  if (!f) return 'Cette famille n’existe pas. Choisis une famille de la liste, ou laisse le champ vide.';
  if (f.actif === false && familleId !== actuel) return `La famille « ${f.nom} » est désactivée. Choisis-en une autre, ou réactive-la.`;
  return null;
}

/** Nom de la famille d'un article (vide si aucune). */
export const nomFamille = (familles, familleId) => (familles ?? []).find((f) => f.id === familleId)?.nom ?? '';
