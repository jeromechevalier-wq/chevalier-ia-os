// Règles du jeu du village (pièces d'or, 27/11/2026, étapes 6 et 7 de docs/accueil-village.md) : fichier PUR, sans aucun import, sans DOM et sans horloge cachée
// (l'heure est toujours reçue en argument). Le même fichier sert à l'écran (pour dessiner) et au serveur (pour décider) : scripts/preparer-fonctions.js le copie tel quel
// dans functions/partage/ et dans functions-plateforme/serveur/partage/. Le serveur seul décide de l'or : une horloge fausse à l'écran ne rapporte rien.
// Montants validés par Jérôme (27/11/2026) : facture validée 10, facture payée 20, devis signé 50. Uniquement des récompenses : rien ne se perd, aucun son.

/** Pièces gagnées par bonne nouvelle. */
export const GAINS = Object.freeze({ 'facture-validee': 10, 'facture-payee': 20, 'devis-signe': 50 });
/** Prix de la boutique (étapes 6b et 7). */
export const PRIX = Object.freeze({ decoration: 20, champ: 100, enclos: 200, parcelle: 500 });
export const PARCELLES_MAX = 8;
export const OBJETS_MAX = 40;
export const COTE_DEPART = 8;
export const CASES_PAR_PARCELLE = 2;
/** Côté d'un objet acheté, en cases du damier. */
export const TAILLES = Object.freeze({ decoration: 1, champ: 2, enclos: 2 });
/** Mêmes noms que DECORATIONS du fichier des dessins du jeu (étape 6a-bis ; un test le vérifie). */
export const MODELES_DECORATION = Object.freeze(['arbre', 'fleurs', 'banc', 'cloture', 'brouette']);
const HEURE = 3600 * 1000;
const JOUR = 24 * HEURE;
export const ENCLOS = Object.freeze({ pieces: 5, toutesLesMs: JOUR, plafond: 20 });
export const CHAMP = Object.freeze({ pieces: 20, dureeMs: 48 * HEURE, etapes: 4 });
/** Une bonne nouvelle datée par un serveur (facture d'achat acceptée, devis signé) ne paie que si elle a moins de 48 h. */
export const FRAICHEUR_MS = 48 * HEURE;
/** Une facture de projet payée : jour du paiement (choisi par l'utilisateur) entre 31 jours avant et 1 jour après aujourd'hui. */
export const PAIEMENT_JOURS_AVANT = 31;
export const PAIEMENT_JOURS_APRES = 1;
/** Écart d'horloge toléré entre deux serveurs (une date de décision « dans le futur » de quelques minutes reste valable). */
const DECALAGE_TOLERE_MS = 5 * 60 * 1000;

const ID = /^[A-Za-z0-9_-]{1,80}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const JOUR_TEXTE = /^(\d{4})-(\d{2})-(\d{2})$/;
const nombre = (v) => typeof v === 'number' && Number.isFinite(v);

/** Nombre de parcelles achetées, ramené entre 0 et PARCELLES_MAX (une valeur qui n'est pas un entier vaut 0). */
export function parcellesValables(parcelles) {
  return Number.isInteger(parcelles) && parcelles > 0 ? Math.min(parcelles, PARCELLES_MAX) : 0;
}

/** Taille du damier d'un utilisateur : 8 x 8, puis 2 colonnes et 2 lignes de plus par parcelle (24 x 24 au plus). */
export function damierDe(parcelles) {
  const cote = COTE_DEPART + CASES_PAR_PARCELLE * parcellesValables(parcelles);
  return { colonnes: cote, lignes: cote };
}

/** Pièces qui manquent pour acheter (0 si l'utilisateur a assez). */
export function manque(prix, or) {
  const p = Number.isInteger(prix) && prix > 0 ? prix : 0;
  const o = Number.isInteger(or) && or > 0 ? or : 0;
  return Math.max(0, p - o);
}

const pieces = (n) => (n <= 1 ? 'pièce' : 'pièces');

/** « Encore 30 pièces. » / « Encore 1 pièce. » */
export function texteManque(n) {
  const v = Number.isInteger(n) && n > 0 ? n : 0;
  return `Encore ${v} ${pieces(v)}.`;
}

/** « 120 pièces d’or », « 1 pièce d’or », « 0 pièce d’or ». */
export function texteOr(n) {
  const v = Number.isInteger(n) && n > 0 ? n : 0;
  return `${v} ${pieces(v)} d’or`;
}

/** Enclos : pièces prêtes (multiple de 5, 20 au plus), plein ou non, et le moment de la prochaine tranche (null s'il est plein ou si la date est invalide). */
export function etatEnclos(depuisMs, maintenantMs) {
  if (!nombre(depuisMs) || !nombre(maintenantMs) || depuisMs > maintenantMs) return { pretes: 0, plein: false, prochaineMs: nombre(depuisMs) ? depuisMs + ENCLOS.toutesLesMs : null };
  const tranches = Math.floor((maintenantMs - depuisMs) / ENCLOS.toutesLesMs);
  const pretes = Math.min(tranches * ENCLOS.pieces, ENCLOS.plafond);
  const plein = pretes >= ENCLOS.plafond;
  return { pretes, plein, prochaineMs: plein ? null : depuisMs + (tranches + 1) * ENCLOS.toutesLesMs };
}

/** Nouvelle valeur de `depuis` après un ramassage : au plafond, maintenant ; sinon on avance du nombre de tranches entières (la fraction de jour entamée est gardée). */
export function apresRamassage(depuisMs, maintenantMs) {
  if (!nombre(depuisMs) || !nombre(maintenantMs) || depuisMs > maintenantMs) return nombre(depuisMs) ? depuisMs : maintenantMs;
  const tranches = Math.floor((maintenantMs - depuisMs) / ENCLOS.toutesLesMs);
  if (tranches * ENCLOS.pieces >= ENCLOS.plafond) return maintenantMs;
  return depuisMs + tranches * ENCLOS.toutesLesMs;
}

/** Champ : étape 0 (semé) à 3 (prêt), sur 48 h ; date dans le futur ou invalide : étape 0, pas prêt. */
export function etatChamp(depuisMs, maintenantMs) {
  if (!nombre(depuisMs) || !nombre(maintenantMs) || depuisMs > maintenantMs) return { etape: 0, pret: false };
  const ecoule = maintenantMs - depuisMs;
  const etape = Math.min(CHAMP.etapes - 1, Math.floor(ecoule / (CHAMP.dureeMs / (CHAMP.etapes - 1))));
  return { etape, pret: ecoule >= CHAMP.dureeMs };
}

/** Vrai si une bonne nouvelle datée par un serveur (facture d'achat acceptée, devis signé) a moins de 48 h. */
export function fraisPourGain(source, dateMs, maintenantMs) {
  if (source !== 'facture-validee' && source !== 'devis-signe') return false;
  if (!nombre(dateMs) || !nombre(maintenantMs)) return false;
  return dateMs <= maintenantMs + DECALAGE_TOLERE_MS && maintenantMs - dateMs <= FRAICHEUR_MS;
}

/** Vrai si le jour de paiement « AAAA-MM-JJ » est entre 31 jours avant et 1 jour après aujourd'hui (jour mal formé : faux). */
export function paiementRecent(jourTexte, maintenantMs) {
  if (typeof jourTexte !== 'string' || !nombre(maintenantMs)) return false;
  const x = jourTexte.match(JOUR_TEXTE);
  if (!x) return false;
  const [a, m, j] = [Number(x[1]), Number(x[2]), Number(x[3])];
  const jour = Date.UTC(a, m - 1, j);
  const d = new Date(jour);
  if (d.getUTCFullYear() !== a || d.getUTCMonth() !== m - 1 || d.getUTCDate() !== j) return false;
  const aujourdhui = Math.floor(maintenantMs / JOUR) * JOUR;
  const ecart = Math.round((jour - aujourdhui) / JOUR);
  return ecart >= -PAIEMENT_JOURS_AVANT && ecart <= PAIEMENT_JOURS_APRES;
}

/**
 * Clé du registre des gains (un gain par élément, pour toute la maison) ; null si un identifiant n'est pas valable.
 * Séparateur « . » : il n'est PAS dans l'alphabet des identifiants (lettres, chiffres, « _ », « - »), donc deux couples (projet, facture) différents
 * ne donnent jamais la même clé (avec « - », « a-b »+« c » et « a »+« b-c » se confondaient).
 */
export function cleDeGain(source, { id, projetId } = {}) {
  if (source === 'facture-validee') return typeof id === 'string' && UUID.test(id) ? `fv.${id.toLowerCase()}` : null;
  if (source === 'facture-payee') return typeof id === 'string' && ID.test(id) && typeof projetId === 'string' && ID.test(projetId) ? `fp.${projetId}.${id}` : null;
  if (source === 'devis-signe') return typeof id === 'string' && ID.test(id) ? `ds.${id}` : null;
  return null;
}
