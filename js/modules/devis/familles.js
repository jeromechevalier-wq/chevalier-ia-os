// Familles d'articles du Bordereau (module Devis) : une liste simple `[{ id, nom, actif }]` gérée par l'utilisateur (créer, renommer, désactiver),
// sans sous-familles. Un article porte au plus un `familleId` facultatif. Logique PURE (aucun accès à Firebase ni au navigateur), testée avec node --test.
// Stockage : document `devis_parametres/familles` = `{ liste: [...] }` (même collection que les réglages du module). Document absent = familles par défaut.
// Ce fichier n'importe rien : il est copié tel quel pour le serveur MCP (scripts/preparer-fonctions.js).
export const ID_DOCUMENT_FAMILLES = 'familles';
export const LIMITE_NOM_FAMILLE = 60;
/** Les sept familles proposées au départ (identifiants stables : un article peut s'y rattacher avant que le document existe). */
export const FAMILLES_PAR_DEFAUT = Object.freeze([
  'Fournitures', 'Main d’œuvre', 'Ouvrages', 'Sous-traitance', 'Matériels', 'Textes', 'Divers',
].map((nom, i) => Object.freeze({ id: `famille-${i + 1}`, nom, actif: true })));

const espaces = (v) => String(v ?? '').replace(/[\s  ]+/g, ' ').trim();
const cle = (v) => espaces(v).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Liste lue dans la base (document absent ou illisible = familles par défaut). Toujours une liste valide. */
export function famillesDe(brut) {
  const liste = brut && Array.isArray(brut.liste) ? brut.liste : null;
  if (!liste) return FAMILLES_PAR_DEFAUT.map((f) => ({ ...f }));
  return liste
    .filter((f) => f && typeof f.id === 'string' && f.id && typeof f.nom === 'string' && espaces(f.nom))
    .map((f) => ({ id: f.id, nom: espaces(f.nom), actif: f.actif !== false }));
}

/** Famille qui porte ce nom (sans accents ni casse), hors `sauf`. Les noms sont uniques parmi toutes les familles, actives ou non. */
export const familleDuNom = (familles, nom, sauf = null) => (familles ?? []).find((f) => f.id !== sauf && cle(f.nom) === cle(nom)) ?? null;

/** Message d'erreur pour un nom de famille, ou null s'il est valable. */
export function erreursFamille(nom, familles = [], { sauf = null } = {}) {
  const n = espaces(nom);
  if (!n) return 'Écris le nom de la famille (exemple : Plomberie).';
  if (n.length > LIMITE_NOM_FAMILLE) return `Le nom de la famille est trop long (${LIMITE_NOM_FAMILLE} caractères au plus).`;
  const pris = familleDuNom(familles, n, sauf);
  if (pris) return `La famille « ${pris.nom} » existe déjà${pris.actif === false ? ' (désactivée : réactive-la plutôt)' : ''}. Choisis un autre nom.`;
  return null;
}

const refus = (message) => ({ erreur: message, familles: null, famille: null });

/** Création : `{ erreur, familles (liste complète à enregistrer), famille }`. `nouvelId` : fonction qui donne un identifiant neuf. */
export function planCreationFamille(nom, familles, { nouvelId } = {}) {
  const liste = familles ?? [];
  const erreur = erreursFamille(nom, liste);
  if (erreur) return refus(erreur);
  const famille = { id: nouvelId(), nom: espaces(nom), actif: true };
  return { erreur: null, familles: [...liste.map((f) => ({ ...f })), famille], famille };
}

/** Renommer une famille (les articles gardent leur lien : il passe par l'identifiant). */
export function planRenommerFamille(id, nom, familles) {
  const liste = familles ?? [];
  const f = liste.find((x) => x.id === id);
  if (!f) return refus('Famille introuvable : recharge la page.');
  const erreur = erreursFamille(nom, liste, { sauf: id });
  if (erreur) return refus(erreur);
  const neuve = { ...f, nom: espaces(nom) };
  return { erreur: null, familles: liste.map((x) => (x.id === id ? neuve : { ...x })), famille: neuve };
}

/** Désactiver (`actif = false`) ou réactiver une famille. Jamais de suppression : les articles déjà rattachés la gardent. */
export function planDesactiverFamille(id, familles, actif = false) {
  const liste = familles ?? [];
  const f = liste.find((x) => x.id === id);
  if (!f) return refus('Famille introuvable : recharge la page.');
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
