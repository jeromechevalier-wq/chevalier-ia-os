// Logique PURE de l'écran « Factures » du module Achats (25/11/2026, PR 8a) : formats, recherche, filtres, tri, regroupement par statut, compteurs, totaux, pastilles de carte,
// vues, archivage (textes). Aucun import, aucun réseau, aucun écran : tout est testé dans tests/achatsfactures-logique.test.js.
// Recopiée de la logique de l'appli d'origine (liste-factures, factures, archivage, types) : les règles et les messages ne changent pas.

// ---------------------------------------------------------------- formats

/** Minuscules, sans accents ni ligatures courantes : « Électro » et « electro » se valent. */
export const normaliser = (s) => (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/œ/gi, 'oe').replace(/æ/gi, 'ae').toLowerCase().trim();

export const estAvoir = (f) => f?.type_document === 'avoir';

/** Les montants de la base sont toujours positifs : le signe vient du seul type du document (un avoir se déduit). Jamais inversé deux fois. */
export const montantSigne = (n, f) => (n === null || n === undefined ? null : estAvoir(f) ? -Math.abs(n) : n);

export const euros = (n) => (n === null || n === undefined ? '—' : n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' }));

/** Euros d'une facture ou d'un avoir : un avoir s'affiche en négatif (−100,00 €). */
export const eurosFacture = (n, f) => euros(montantSigne(n, f));

const FUSEAU = 'Europe/Paris';

/** Date sans heure (AAAA-MM-JJ) écrite telle quelle, jamais convertie en fuseau (sinon décalage d'un jour). Un horodatage complet est converti en date de Paris. */
export const dateFr = (valeur) => {
  if (!valeur) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valeur);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  return new Date(valeur).toLocaleDateString('fr-FR', { timeZone: FUSEAU });
};

/** Horodatage (stocké en UTC) affiché en heure de Paris : « 22/11/2026 à 14:32 ». */
export const dateHeureFr = (iso) => {
  if (!iso) return '—';
  const p = new Intl.DateTimeFormat('fr-FR', { timeZone: FUSEAU, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date(iso)).reduce((a, x) => { a[x.type] = x.value; return a; }, {});
  return `${p.day}/${p.month}/${p.year} à ${p.hour}:${p.minute}`;
};

/** Date du jour au format AAAA-MM-JJ, en heure de Paris (nom des fichiers exportés). */
export const dateJourFichier = (quand = new Date()) => {
  const p = new Intl.DateTimeFormat('fr-FR', { timeZone: FUSEAU, day: '2-digit', month: '2-digit', year: 'numeric' }).formatToParts(quand).reduce((a, x) => { a[x.type] = x.value; return a; }, {});
  return `${p.year}-${p.month}-${p.day}`;
};

// ---------------------------------------------------------------- statuts et noms

export const STATUTS = Object.freeze([
  { id: 'a_valider', titre: 'À valider', couleur: 'var(--attention)' },
  { id: 'acceptee', titre: 'Acceptées', couleur: 'var(--succes)' },
  { id: 'refusee', titre: 'Refusées', couleur: 'var(--retard)' },
]);
export const LIBELLE_STATUT = Object.freeze({ a_valider: 'À valider', acceptee: 'Acceptée', refusee: 'Refusée' });

export const SANS_FOURNISSEUR = 'Fournisseur inconnu';
export const SANS_CHANTIER = 'Chantier non affecté';

export const nomFournisseur = (f) => f.fournisseur?.trim() || SANS_FOURNISSEUR;
export const nomChantier = (f) => f.chantiers?.nom?.trim() || SANS_CHANTIER;

// ---------------------------------------------------------------- montants (en centimes : jamais d'addition de nombres à virgule)

/** Euros → centimes entiers (null ou valeur non finie = 0). */
export const enCentimes = (n) => (typeof n === 'number' && Number.isFinite(n) ? Math.round(n * 100) : 0);

/** Montant TTC en centimes AVEC son signe : les montants de la base sont toujours positifs, un avoir se déduit (le signe vient du seul type du document). */
export const centimesSignes = (f) => (f.type_document === 'avoir' ? -Math.abs(enCentimes(f.montant_ttc)) : enCentimes(f.montant_ttc));

/** Totaux d'une colonne ou d'une liste : les avoirs sont SOUSTRAITS. */
export function totaux(factures) {
  return { nombre: factures.length, centimes: factures.reduce((s, f) => s + centimesSignes(f), 0) };
}
/** Centimes → « 1 541,40 € » (même format que `euros`). */
export const eurosDeCentimes = (c) => (c / 100).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });

/** Sous le nom d'une colonne : « 3 factures · 1 541,40 € » (le montant est omis à 0 €). */
export function texteTete(t) {
  const nb = `${t.nombre} facture${t.nombre > 1 ? 's' : ''}`;
  return t.centimes ? `${nb} · ${eurosDeCentimes(t.centimes)}` : nb;
}

// ---------------------------------------------------------------- filtres

export const CRITERES_VIDES = Object.freeze({ recherche: '', fournisseurs: [], chantiers: [], du: '', au: '' });

/** Nombre de filtres actifs de la fenêtre « Filtres » (la recherche a son propre champ, elle ne compte pas). */
export const nombreFiltres = (c) => c.fournisseurs.length + c.chantiers.length + (c.du ? 1 : 0) + (c.au ? 1 : 0);
export const criteresActifs = (c) => nombreFiltres(c) > 0 || normaliser(c.recherche) !== '';

/** Recherche : chaque mot saisi doit se trouver dans le fournisseur, le numéro ou le chantier (sans casse ni accents, sans exiger l'ordre). */
export function correspondRecherche(f, recherche) {
  const mots = normaliser(recherche).split(/\s+/).filter(Boolean);
  if (!mots.length) return true;
  const texte = normaliser(`${f.fournisseur ?? ''} ${f.numero ?? ''} ${f.chantiers?.nom ?? ''}`);
  return mots.every((m) => texte.includes(m));
}

export function filtrer(factures, c) {
  return factures.filter((f) => {
    if (!correspondRecherche(f, c.recherche)) return false;
    if (c.fournisseurs.length && !c.fournisseurs.includes(nomFournisseur(f))) return false;
    if (c.chantiers.length && !c.chantiers.includes(nomChantier(f))) return false;
    if (c.du || c.au) {
      const d = f.date_facture; // AAAA-MM-JJ : la comparaison de textes suffit. Une facture sans date ne passe pas une période.
      if (!d || (c.du && d < c.du) || (c.au && d > c.au)) return false;
    }
    return true;
  });
}

/** Valeurs proposées dans la fenêtre « Filtres » : celles qui existent vraiment, triées sans accents. */
export function valeursDeFiltre(factures) {
  const tri = (a, b) => normaliser(a).localeCompare(normaliser(b), 'fr');
  return {
    fournisseurs: [...new Set(factures.map(nomFournisseur))].sort(tri),
    chantiers: [...new Set(factures.map(nomChantier))].sort(tri),
  };
}

/** Pastilles des filtres actifs, sous la barre (la recherche n'en a pas : elle est visible dans son champ). */
export function pastillesFiltres(c, formaterDate) {
  return [
    ...c.fournisseurs.map((v) => ({ cle: 'fournisseur', valeur: v, libelle: `Fournisseur : ${v}` })),
    ...c.chantiers.map((v) => ({ cle: 'chantier', valeur: v, libelle: `Chantier : ${v}` })),
    ...(c.du ? [{ cle: 'du', valeur: c.du, libelle: `Depuis le ${formaterDate(c.du)}` }] : []),
    ...(c.au ? [{ cle: 'au', valeur: c.au, libelle: `Jusqu’au ${formaterDate(c.au)}` }] : []),
  ];
}
export function retirerCritere(c, p) {
  switch (p.cle) {
    case 'fournisseur': return { ...c, fournisseurs: c.fournisseurs.filter((v) => v !== p.valeur) };
    case 'chantier': return { ...c, chantiers: c.chantiers.filter((v) => v !== p.valeur) };
    case 'du': return { ...c, du: '' };
    case 'au': return { ...c, au: '' };
    default: return c;
  }
}

// ---------------------------------------------------------------- tri (un seul, partagé entre Kanban et Liste)

/** `sens` : sens pris quand on choisit le critère (Montant et dates : le plus grand / le plus récent d'abord). `menu: false` : critère de colonne seulement. */
export const CRITERES_TRI = Object.freeze([
  { id: 'date', libelle: 'Date de la facture', sens: 'desc' },
  { id: 'fournisseur', libelle: 'Fournisseur', sens: 'asc' },
  { id: 'montant', libelle: 'Montant', sens: 'desc' },
  { id: 'numero', libelle: 'Numéro', sens: 'asc' },
  { id: 'chantier', libelle: 'Chantier', sens: 'asc', menu: false },
  { id: 'statut', libelle: 'Statut', sens: 'asc', menu: false },
  { id: 'decision', libelle: 'Décidée le', sens: 'desc', menu: false },
]);
export const TRI_DEFAUT = Object.freeze({ critere: 'date', sens: 'desc' });
const ORDRE_STATUT = { a_valider: 0, acceptee: 1, refusee: 2 };

/** Valeur de tri d'un critère : texte (sans accents), nombre ou null (valeur absente, toujours rangée en dernier quel que soit le sens). */
function cleDeTri(f, critere) {
  switch (critere) {
    case 'fournisseur': return f.fournisseur?.trim() ? normaliser(f.fournisseur) : null;
    case 'numero': return f.numero?.trim() ? normaliser(f.numero) : null;
    case 'chantier': return f.chantiers?.nom?.trim() ? normaliser(f.chantiers.nom) : null;
    case 'date': return f.date_facture;
    case 'decision': return f.date_decision;
    case 'montant': return f.montant_ttc === null || f.montant_ttc === undefined ? null : centimesSignes(f);
    case 'statut': return ORDRE_STATUT[f.statut];
    default: return null;
  }
}

/** Tri stable : à clé égale, l'ordre d'arrivée est gardé. Ne modifie pas la liste reçue. */
export function trier(factures, tri) {
  const signe = tri.sens === 'asc' ? 1 : -1;
  return factures
    .map((f, i) => ({ f, i, k: cleDeTri(f, tri.critere) }))
    .sort((a, b) => {
      if ((a.k === null || a.k === undefined) && (b.k === null || b.k === undefined)) return a.i - b.i;
      if (a.k === null || a.k === undefined) return 1;
      if (b.k === null || b.k === undefined) return -1;
      const c = typeof a.k === 'number' && typeof b.k === 'number' ? a.k - b.k : String(a.k).localeCompare(String(b.k), 'fr', { numeric: true });
      return c !== 0 ? c * signe : a.i - b.i;
    })
    .map((x) => x.f);
}

/** Clic sur un en-tête de colonne : même critère = on inverse le sens ; autre critère = son sens d'origine. */
export function triApresClicColonne(tri, critere) {
  if (tri.critere === critere) return { critere, sens: tri.sens === 'asc' ? 'desc' : 'asc' };
  return { critere, sens: CRITERES_TRI.find((c) => c.id === critere)?.sens ?? 'asc' };
}

/** Relit un tri mémorisé « critere:sens » ; tout ce qui est inconnu ou abîmé redonne le tri par défaut. */
export function lireTri(texte) {
  const [critere, sens] = (texte ?? '').split(':');
  if (CRITERES_TRI.some((c) => c.id === critere) && (sens === 'asc' || sens === 'desc')) return { critere, sens };
  return { ...TRI_DEFAUT };
}
export const texteTri = (t) => `${t.critere}:${t.sens}`;

// ---------------------------------------------------------------- regroupement par statut (Kanban)

export function regrouper(factures) {
  const g = { a_valider: [], acceptee: [], refusee: [] };
  for (const f of factures) if (g[f.statut]) g[f.statut].push(f);
  return g;
}

// ---------------------------------------------------------------- pastilles de carte

/**
 * Repères visibles sur la carte, sans refaire les contrôles de l'écran Examiner (ils demandent le texte extrait et l'historique du fournisseur).
 * À valider : lecture impossible, informations manquantes, totaux qui ne tombent pas juste (en centimes). Acceptée : « malgré alerte ».
 */
export function pastillesCarte(f) {
  const p = [];
  if (f.statut === 'acceptee' && f.acceptee_malgre_alerte) p.push({ libelle: 'Acceptée malgré alerte', ton: 'attention' });
  if (f.statut === 'a_valider') {
    if (f.extraction_erreur) p.push({ libelle: 'Lecture impossible', ton: 'retard' });
    else {
      if (!f.fournisseur?.trim() || f.montant_ttc === null || f.montant_ttc === undefined) p.push({ libelle: 'Informations manquantes', ton: 'attention' });
      if (f.montant_ht !== null && f.montant_tva !== null && f.montant_ttc !== null && enCentimes(f.montant_ht) + enCentimes(f.montant_tva) !== enCentimes(f.montant_ttc)) p.push({ libelle: 'Totaux à vérifier', ton: 'retard' });
    }
  }
  return p;
}

// ---------------------------------------------------------------- archivage et vues

export const estArchivee = (f) => !!f.archivee_le;

/** Vue « Kanban » et « Liste » : seulement les factures NON archivées ; vue « Archives » : seulement les archivées. */
export const selonVue = (factures, archives) => factures.filter((f) => estArchivee(f) === archives);

/** Bouton d'archivage d'une facture : jamais pour une facture « à valider » (on n'archive que ce qui est décidé) ; « Désarchiver » si elle l'est déjà. */
export function actionArchivage(f) {
  if (f.statut === 'a_valider') return null;
  return estArchivee(f) ? 'desarchiver' : 'archiver';
}

export const VUES = Object.freeze([['kanban', 'Kanban', 'square-kanban'], ['liste', 'Liste', 'list'], ['archives', 'Archives', 'archive']]);
/** Relit la vue mémorisée : seuls Kanban et Liste se retiennent (Archives n'est jamais la vue par défaut) ; tout le reste redonne le Kanban. */
export const lireVue = (texte) => (texte === 'liste' ? 'liste' : 'kanban');

/** « 13 factures », « 2 factures archivées » ; avec un filtre qui en cache : « 2 sur 13 factures ». `total` = factures de la vue, `visibles` = après filtres. */
export function texteCompteur(total, visibles, archives, filtre) {
  const t = `${total} facture${total > 1 ? 's' : ''}${archives ? ` archivée${total > 1 ? 's' : ''}` : ''}`;
  return filtre ? `${visibles} sur ${t}` : t;
}

export const DUREE_ANNULATION = 8000;
export const DUREE_MESSAGE = 4000;
export const MESSAGE_ERREUR_PAR_DEFAUT = 'Une erreur est survenue, réessaie dans un instant.';
export const MESSAGE_REMIS = 'Remis en place';

export const textesArchivage = (nom) => ({
  titre: 'Archiver cette facture ?',
  message: `${nom ? `« ${nom} » ira` : 'Elle ira'} dans les archives. Tu pourras la désarchiver quand tu veux.`,
  libelleOk: 'Archiver',
  fait: 'Facture archivée',
  desarchive: 'Facture désarchivée',
});

const messageDe = (e) => (e instanceof Error && e.message ? e.message : MESSAGE_ERREUR_PAR_DEFAUT);

/** Archive (après la confirmation, faite par l'écran). Le message du serveur est renvoyé tel quel en cas de refus. L'écran est relu dans tous les cas. */
export async function archiverPuisRelire(faire, relire) {
  let res = { ok: true, annulable: true };
  try { await faire(); } catch (e) { res = { ok: false, message: messageDe(e) }; }
  await relire();
  return res;
}

/** « Annuler » pendant les 8 secondes : remet la facture telle qu'elle était (désarchivage existant). */
export async function annulerArchivage(defaire, relire) {
  try { await defaire(); } catch (e) { return { ok: false, message: `Impossible d’annuler : ${messageDe(e)}` }; }
  await relire();
  return { ok: true };
}

/** Message d'état de la liste quand elle est incomplète ou que les analyses n'ont pas pu être lues (dit à l'écran, jamais en silence). */
export const MESSAGE_LISTE_INCOMPLETE = 'Liste incomplète : les totaux et la recherche ne portent pas sur toutes les factures.';
export const MESSAGE_ANALYSES_NON_LUES = 'Les contrôles automatiques n’ont pas pu être lus : ouvre chaque facture pour les voir.';
export const MESSAGE_EXAMINER_BIENTOT = 'Examiner : bientôt disponible';
