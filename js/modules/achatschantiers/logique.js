// Logique PURE du module Achats « Chantiers » (24/11/2026, PR 6) : formulaire, corps des demandes, vues, filtres, tri, regroupement par statut, compteurs, menu « … »,
// chiffres du budget, textes d'archivage. Aucun import, aucun réseau, aucun écran : tout est testé dans tests/achatschantiers-logique.test.js.
// Recopiée de la logique de l'appli d'origine (chantiers, liste-chantiers, archivage) : les règles et les messages ne changent pas.

// ---------------------------------------------------------------- formats

/** Minuscules, sans accents ni ligatures courantes : « Électro » et « electro » se valent. */
export const normaliser = (s) => (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/œ/gi, 'oe').replace(/æ/gi, 'ae').toLowerCase().trim();

export const euros = (n) => (n === null || n === undefined ? '—' : n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' }));

const FUSEAU = 'Europe/Paris';

/** Date sans heure (AAAA-MM-JJ) écrite telle quelle, jamais convertie en fuseau (sinon décalage d'un jour). Un horodatage complet est converti en date de Paris. */
export const dateFr = (valeur) => {
  if (!valeur) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valeur);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  return new Date(valeur).toLocaleDateString('fr-FR', { timeZone: FUSEAU });
};

/** Date du jour au format AAAA-MM-JJ, en heure de Paris (nom des fichiers exportés). */
export const dateJourFichier = (quand = new Date()) => {
  const p = new Intl.DateTimeFormat('fr-FR', { timeZone: FUSEAU, day: '2-digit', month: '2-digit', year: 'numeric' }).formatToParts(quand).reduce((a, x) => { a[x.type] = x.value; return a; }, {});
  return `${p.year}-${p.month}-${p.day}`;
};

// ---------------------------------------------------------------- nom affiché : « Nom · Ville »

const norm = (s) => normaliser(String(s).replace(/œ/gi, 'oe').replace(/æ/gi, 'ae'));
/** Morceaux d'adresse qui ne sont pas une ville (bâtiment, lot, zone d'activité, pays). */
const PAS_UNE_VILLE = /^(bat|batiment|lot|zone|za|zi|france)\b/;

/** Ville de l'adresse : le texte qui suit un code postal à 5 chiffres (« 83560 Vinon-sur-Verdon » → « Vinon-sur-Verdon »), sinon null. */
export function villeDeAdresse(adresse) {
  const m = /\b\d{5}\s+([^,;\n\d]+)/.exec(adresse ?? '');
  const v = m?.[1].trim();
  return v || null;
}

/**
 * Ville d'un chantier, tirée de son adresse : le texte après le code postal, sinon le dernier segment après une virgule, sinon null.
 * « Cedex 03 » est retiré ; un morceau qui commence par bât, lot, zone, ZA, ZI ou France n'est pas une ville.
 */
export function villeChantier(adresse) {
  const nette = (v) => {
    const t = (v ?? '').replace(/\s+cedex\b.*$/i, '').trim();
    return t && !PAS_UNE_VILLE.test(norm(t)) ? t : null;
  };
  const apresCodePostal = nette(villeDeAdresse(adresse));
  if (apresCodePostal) return apresCodePostal;
  const segments = (adresse ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (segments.length < 2) return null;
  const dernier = segments[segments.length - 1];
  return /\d/.test(dernier) ? null : nette(dernier);
}

/** Première ligne d'un chantier : « Nom · Ville » (la ville seulement si l'adresse en donne une et si le nom ne la contient pas déjà). */
export function libelleChantier(c) {
  const ville = villeChantier(c.adresse);
  return ville && !norm(c.nom).includes(norm(ville)) ? `${c.nom} · ${ville}` : c.nom;
}

// ---------------------------------------------------------------- statuts et formulaire

export const STATUTS_CHANTIER = [
  { id: 'en_preparation', libelle: 'En préparation' },
  { id: 'en_cours', libelle: 'En cours' },
  { id: 'termine', libelle: 'Terminé' },
  { id: 'suspendu', libelle: 'Suspendu' },
];
export const libelleStatutChantier = (s) => STATUTS_CHANTIER.find((x) => x.id === s)?.libelle ?? s;

/** Mêmes limites que le serveur. */
export const LIMITES_CHANTIER = { nom: 200, code: 40, client: 200, adresse: 300 };

/** Ce que saisit l'utilisateur (tout en texte, comme dans les champs de la fenêtre). */
export const CHAMPS_VIDES = { nom: '', code: '', client: '', adresse: '', budget_ht: '', statut: 'en_preparation', date_debut: '', date_fin_prevue: '' };

/** Champs d'un chantier existant, pour pré-remplir la fenêtre de modification. */
export const champsDepuis = (c) => ({
  nom: c.nom, code: c.code ?? '', client: c.client ?? '', adresse: c.adresse ?? '',
  budget_ht: c.budget_ht === null || c.budget_ht === undefined ? '' : String(c.budget_ht).replace('.', ','),
  statut: c.statut, date_debut: c.date_debut ?? '', date_fin_prevue: c.date_fin_prevue ?? '',
});

/** Budget saisi (« 12 500,50 » ou « 12500.5 ») : null si vide, NaN si ce n'est pas un nombre positif ou nul. */
export function lireBudget(texte) {
  const t = texte.replace(/[\s  ]/g, '').replace(',', '.');
  if (t === '') return null;
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return NaN;
  const n = Number(t);
  return Number.isFinite(n) && n < 1e10 ? n : NaN;
}

/** AAAA-MM-JJ existant (jours du mois et années bissextiles vérifiés, sans passer par un formatage de date du navigateur). */
const dateExiste = (v) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return false;
  const an = Number(m[1]); const mois = Number(m[2]); const jour = Number(m[3]);
  const bissextile = (an % 4 === 0 && an % 100 !== 0) || an % 400 === 0;
  const jours = [31, bissextile ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mois - 1];
  return mois >= 1 && mois <= 12 && jour >= 1 && jour <= jours;
};

/**
 * Contrôle de forme avant l'envoi (le serveur refait les mêmes). Phrase française, ou null si tout va bien.
 * `creation` : le code peut rester vide (la base l'attribue) ; en modification il ne peut pas être vide.
 */
export function verifierChantier(c, creation) {
  const nom = c.nom.trim();
  if (!nom) return 'Le nom du chantier est obligatoire.';
  if (nom.length > LIMITES_CHANTIER.nom) return `Le nom est trop long (${LIMITES_CHANTIER.nom} caractères au maximum).`;
  if (!creation && !c.code.trim()) return 'Le code du chantier ne peut pas être vide.';
  if (c.code.trim().length > LIMITES_CHANTIER.code) return `Le code est trop long (${LIMITES_CHANTIER.code} caractères au maximum).`;
  if (c.client.trim().length > LIMITES_CHANTIER.client) return `Le client est trop long (${LIMITES_CHANTIER.client} caractères au maximum).`;
  if (c.adresse.trim().length > LIMITES_CHANTIER.adresse) return `L’adresse est trop longue (${LIMITES_CHANTIER.adresse} caractères au maximum).`;
  if (Number.isNaN(lireBudget(c.budget_ht))) return 'Le budget doit être un nombre positif ou nul, avec au plus 2 décimales (par exemple 12 500,50).';
  if (!STATUTS_CHANTIER.some((s) => s.id === c.statut)) return 'Choisis le statut du chantier.';
  if (c.date_debut && !dateExiste(c.date_debut)) return 'La date de début n’est pas une date valide.';
  if (c.date_fin_prevue && !dateExiste(c.date_fin_prevue)) return 'La date de fin prévue n’est pas une date valide.';
  return null;
}

/** Corps de `creer_chantier` : clés à plat (liste blanche du serveur), seulement les champs remplis. Jamais d'identité, jamais `date_fin_reelle`. */
export function corpsCreationChantier(c) {
  const corps = { nom: c.nom.trim(), statut: c.statut };
  if (c.code.trim()) corps.code = c.code.trim();
  if (c.client.trim()) corps.client = c.client.trim();
  if (c.adresse.trim()) corps.adresse = c.adresse.trim();
  const b = lireBudget(c.budget_ht);
  if (b !== null && !Number.isNaN(b)) corps.budget_ht = b;
  if (c.date_debut) corps.date_debut = c.date_debut;
  if (c.date_fin_prevue) corps.date_fin_prevue = c.date_fin_prevue;
  return corps;
}

/** `champs` de `modifier_chantier` : SEULEMENT ce qui a changé par rapport au chantier d'origine. Budget vidé = 0 (le serveur refuse null) ; texte et dates vidés = null ; jamais `date_fin_reelle`. Objet vide = rien à envoyer. */
export function champsModifies(origine, c) {
  const avant = champsDepuis(origine);
  const r = {};
  if (c.nom.trim() !== avant.nom.trim()) r.nom = c.nom.trim();
  if (c.code.trim() !== avant.code.trim()) r.code = c.code.trim();
  if (c.client.trim() !== avant.client.trim()) r.client = c.client.trim() || null;
  if (c.adresse.trim() !== avant.adresse.trim()) r.adresse = c.adresse.trim() || null;
  const b = lireBudget(c.budget_ht) ?? 0;
  const bAvant = lireBudget(avant.budget_ht) ?? 0;
  if (b !== bAvant) r.budget_ht = b;
  if (c.statut !== avant.statut) r.statut = c.statut;
  if (c.date_debut !== avant.date_debut) r.date_debut = c.date_debut || null;
  if (c.date_fin_prevue !== avant.date_fin_prevue) r.date_fin_prevue = c.date_fin_prevue || null;
  return r;
}

export const estArchive = (c) => c.archive === true;

/** Liste affichée : chantiers non archivés (vue « Liste ») ou archivés (vue « Archives »), puis recherche sur le nom, le code, le client et l'adresse (sans casse ni accents), triés par nom. */
export function chantiersAffiches(chantiers, archives, recherche) {
  const mots = normaliser(recherche).split(/\s+/).filter(Boolean);
  return chantiers
    .filter((c) => estArchive(c) === archives)
    .filter((c) => { const t = normaliser(`${c.nom} ${c.code ?? ''} ${c.client ?? ''} ${c.adresse ?? ''}`); return mots.every((m) => t.includes(m)); })
    .sort((a, b) => normaliser(a.nom).localeCompare(normaliser(b.nom), 'fr'));
}

/** Bouton d'archivage d'un chantier : « Archiver » ou « Désarchiver ». */
export const actionArchivageChantier = (c) => (estArchive(c) ? { libelle: 'Désarchiver', archive: false } : { libelle: 'Archiver', archive: true });

// ---------------------------------------------------------------- vues (Kanban, Liste, Archives)

/** Sans préférence mémorisée, l'écran s'ouvre sur le Kanban. */
export const VUE_CHANTIERS_DEFAUT = 'kanban';

/** Relit la vue mémorisée : seuls Kanban et Liste se retiennent (Archives n'est jamais la vue par défaut) ; tout le reste redonne le Kanban. */
export const lireVueChantiers = (texte) => (texte === 'liste' ? 'liste' : VUE_CHANTIERS_DEFAUT);

/** Chantiers de la vue : Kanban et Liste = non archivés, Archives = archivés. */
export const chantiersDeVue = (chantiers, vue) => chantiers.filter((c) => estArchive(c) === (vue === 'archives'));

/** Colonnes du Kanban, dans l'ordre de `STATUTS_CHANTIER`, toujours toutes présentes (même vides). Les chantiers archivés n'y entrent jamais. L'ordre reçu est gardé dans chaque colonne. */
export function regrouperParStatut(chantiers) {
  const g = { en_preparation: [], en_cours: [], termine: [], suspendu: [] };
  for (const c of chantiers) if (!estArchive(c) && g[c.statut]) g[c.statut].push(c);
  return g;
}

/** Un budget à 0 ou vide veut dire « pas de budget » : il ne compte pas. */
export const aUnBudget = (c) => typeof c.budget_ht === 'number' && c.budget_ht > 0;

/** Total de budget HT, arrondi à 2 décimales ; null s'il n'y a aucun budget (affiché « — »). */
export function totalBudget(chantiers) {
  const avec = chantiers.filter(aUnBudget);
  if (avec.length === 0) return null;
  return Math.round(avec.reduce((s, c) => s + Math.round(c.budget_ht * 100), 0)) / 100;
}

/** Sous le titre d'une colonne : « 2 chantiers · 12 500,00 € HT » ou « 0 chantier · — » (jamais un chiffre écrit à la main). */
export const texteTeteColonne = (nombre, total) => `${nombre} chantier${nombre > 1 ? 's' : ''} · ${total === null ? '—' : `${euros(total)} HT`}`;

/** Couleur du trait de chaque colonne : une variable CSS existante des jetons, jamais une couleur écrite en dur. */
export const COULEUR_STATUT_CHANTIER = {
  en_preparation: 'var(--texte2)', en_cours: 'var(--succes)', termine: 'var(--texte2)', suspendu: 'var(--attention)',
};

// ---------------------------------------------------------------- filtres, recherche

export const CRITERES_CHANTIERS_VIDES = { recherche: '', statuts: [], client: '' };
export const nombreFiltresChantiers = (c) => c.statuts.length + (normaliser(c.client) ? 1 : 0);
export const criteresChantiersActifs = (c) => nombreFiltresChantiers(c) > 0 || normaliser(c.recherche) !== '';

/** Recherche (nom, code, client, adresse ; sans casse ni accents, tous les mots), puis statut (plusieurs possibles) et client (texte libre : un chantier sans client ne passe plus dès qu'il est rempli). */
export function filtrerChantiers(chantiers, c) {
  const mots = normaliser(c.recherche).split(/\s+/).filter(Boolean);
  const client = normaliser(c.client);
  return chantiers.filter((x) => {
    if (c.statuts.length > 0 && !c.statuts.includes(x.statut)) return false;
    if (client && !normaliser(x.client ?? '').includes(client)) return false;
    const t = normaliser(`${x.nom} ${x.code ?? ''} ${x.client ?? ''} ${x.adresse ?? ''}`);
    return mots.every((m) => t.includes(m));
  });
}

export function pastillesChantiers(c) {
  const p = c.statuts.map((s) => ({ cle: 'statut', valeur: s, libelle: `Statut : ${libelleStatutChantier(s)}` }));
  if (c.client.trim()) p.push({ cle: 'client', valeur: c.client, libelle: `Client : ${c.client.trim()}` });
  return p;
}
export function retirerCritereChantier(c, p) {
  return p.cle === 'client' ? { ...c, client: '' } : { ...c, statuts: c.statuts.filter((s) => s !== p.valeur) };
}

// ---------------------------------------------------------------- tri

export const CRITERES_TRI_CHANTIERS = [
  { id: 'nom', libelle: 'Nom', sens: 'asc' },
  { id: 'code', libelle: 'Code', sens: 'asc' },
  { id: 'statut', libelle: 'Statut', sens: 'asc' },
  { id: 'budget', libelle: 'Budget', sens: 'desc' },
  { id: 'debut', libelle: 'Début', sens: 'asc' },
  { id: 'fin', libelle: 'Fin prévue', sens: 'asc' },
];
/** Ordre par défaut de l'écran : nom croissant. */
export const TRI_CHANTIERS_DEFAUT = { critere: 'nom', sens: 'asc' };

/** Relit le tri mémorisé « critere:sens » ; tout ce qui est inconnu redonne le tri par défaut. */
export function lireTriChantiers(texte) {
  const [critere, sens] = String(texte ?? '').split(':');
  return CRITERES_TRI_CHANTIERS.some((c) => c.id === critere) && (sens === 'asc' || sens === 'desc') ? { critere, sens } : { ...TRI_CHANTIERS_DEFAUT };
}

/** Tri stable. « Statut » suit l'ordre de `STATUTS_CHANTIER` (pas l'alphabet) ; le code se compare avec ses nombres (CH-2 avant CH-10). Une valeur vide (code, budget à 0, date) est rangée en dernier dans les deux sens. */
export function trierChantiers(chantiers, tri) {
  const signe = tri.sens === 'asc' ? 1 : -1;
  const cle = (c) => {
    switch (tri.critere) {
      case 'code': return c.code?.trim() ? normaliser(c.code) : null;
      case 'statut': return STATUTS_CHANTIER.findIndex((s) => s.id === c.statut);
      case 'budget': return aUnBudget(c) ? c.budget_ht : null;
      case 'debut': return c.date_debut || null;
      case 'fin': return c.date_fin_prevue || null;
      default: return normaliser(c.nom);
    }
  };
  return chantiers
    .map((c, i) => ({ c, i, k: cle(c) }))
    .sort((a, b) => {
      if (a.k === null && b.k === null) return a.i - b.i;
      if (a.k === null) return 1;
      if (b.k === null) return -1;
      const r = typeof a.k === 'number' && typeof b.k === 'number' ? a.k - b.k : String(a.k).localeCompare(String(b.k), 'fr', { numeric: true });
      return r !== 0 ? r * signe : a.i - b.i;
    })
    .map((x) => x.c);
}

// ---------------------------------------------------------------- compteur et actions

/** « 13 chantiers », « 2 chantiers archivés » ; avec un filtre qui en cache : « 2 sur 13 chantiers ». `total` = chantiers de la vue, `visibles` = après filtres. */
export function texteCompteurChantiers(total, visibles, archives) {
  const partiel = visibles !== total ? `${visibles} sur ` : '';
  return `${partiel}${total} chantier${total > 1 ? 's' : ''}${archives ? ` archivé${total > 1 ? 's' : ''}` : ''}`;
}

/** Entrées du menu « … » : Modifier + Archiver, ou Désarchiver seul pour un chantier archivé (un archivé ne se modifie pas). */
export const actionsChantier = (c) => (estArchive(c) ? ['desarchiver'] : ['modifier', 'archiver']);
export const LIBELLE_ACTION_CHANTIER = { modifier: 'Modifier', archiver: 'Archiver', desarchiver: 'Désarchiver' };

// ---------------------------------------------------------------- archivage : confirmation, puis « Annuler » 8 s

export const DUREE_ANNULATION = 8000;
export const DUREE_MESSAGE = 4000;
export const MESSAGE_ERREUR_PAR_DEFAUT = 'Une erreur est survenue, réessaie dans un instant.';
export const MESSAGE_REMIS = 'Remis en place';

export const textesArchivage = (nom) => ({
  titre: 'Archiver ce chantier ?',
  message: `${nom ? `« ${nom} » ira` : 'Il ira'} dans les archives. Tu pourras le désarchiver quand tu veux.`,
  libelleOk: 'Archiver',
  fait: 'Chantier archivé',
  desarchive: 'Chantier désarchivé',
});

const messageDe = (e) => (e instanceof Error && e.message ? e.message : MESSAGE_ERREUR_PAR_DEFAUT);

/** Archive (après la confirmation, faite par l'écran). Le message du serveur est renvoyé tel quel en cas de refus. L'écran est relu dans tous les cas. */
export async function archiverPuisRelire(faire, relire) {
  let res = { ok: true, annulable: true };
  try { await faire(); } catch (e) { res = { ok: false, message: messageDe(e) }; }
  await relire();
  return res;
}

/** « Annuler » pendant les 8 secondes : remet le chantier tel qu'il était (désarchivage existant). */
export async function annulerArchivage(defaire, relire) {
  try { await defaire(); } catch (e) { return { ok: false, message: `Impossible d’annuler : ${messageDe(e)}` }; }
  await relire();
  return { ok: true };
}

// ---------------------------------------------------------------- chiffres du budget (vue de la base : budget, accepté, en attente, reste, % consommé)

/** Colonnes lues dans la vue des chiffres par chantier. */
export const COLONNES_CHIFFRES = ['chantier_id', 'budget_ht', 'budget_renseigne', 'accepte_ht', 'en_attente_ht', 'reste_ht', 'pct_budget_consomme', 'niveau'];

const NIVEAUX = { budget_non_renseigne: 'Budget non renseigné', ok: 'Dans le budget', a_surveiller: 'À surveiller (90 % ou plus)', depasse: 'Budget dépassé' };
export const libelleNiveau = (n) => NIVEAUX[n] ?? '';

/** Pourcentage du budget consommé : « 42,5 % », ou « — » quand le budget n'est pas renseigné (jamais « 0 % »). */
export const textePourcentage = (p) => (typeof p === 'number' && Number.isFinite(p) ? `${p.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %` : '—');

/** Index des chiffres par identifiant de chantier. Une ligne sans identifiant est ignorée. */
export function indexerChiffres(lignes) {
  const m = new Map();
  for (const l of lignes ?? []) if (l && typeof l.chantier_id === 'string') m.set(l.chantier_id, l);
  return m;
}

/** Ligne de la fenêtre d'un chantier : les quatre nombres, tels que la base les donne (jamais recalculés ici), ou null s'il n'y en a pas. */
export function lignesChiffres(ch) {
  if (!ch) return null;
  const montant = (n) => (typeof n === 'number' ? euros(n) : '—');
  return [
    { id: 'budget', libelle: 'Budget HT', valeur: ch.budget_renseigne ? montant(ch.budget_ht) : '—' },
    { id: 'accepte', libelle: 'Accepté HT', valeur: montant(ch.accepte_ht) },
    { id: 'attente', libelle: 'En attente HT', valeur: montant(ch.en_attente_ht) },
    { id: 'reste', libelle: 'Reste HT', valeur: ch.budget_renseigne ? montant(ch.reste_ht) : '—' },
    { id: 'pct', libelle: 'Part du budget', valeur: textePourcentage(ch.pct_budget_consomme) },
  ];
}

/** Largeur de la barre de budget (0 à 100) : jamais au-delà, jamais de barre sans budget. */
export const largeurBarre = (ch) => (ch && ch.budget_renseigne && typeof ch.pct_budget_consomme === 'number' ? Math.max(0, Math.min(100, ch.pct_budget_consomme)) : null);
