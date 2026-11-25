// Module Achats « Tableau de bord 2 » : filtrage des factures par la rangée de filtres (Période, Chantier, Statut, Fournisseur). Fonctions pures.
// Valeur d'un filtre : { type: 'liste', choix: string[] } ou { type: 'periode', libelle, du, au } (AAAA-MM-JJ, bornes comprises). Filtres = { [id]: valeur }.
const FUSEAU = 'Europe/Paris';
const partiesParis = (quand) => new Intl.DateTimeFormat('fr-FR', { timeZone: FUSEAU, day: '2-digit', month: '2-digit', year: 'numeric' }).formatToParts(quand).reduce((a, x) => { a[x.type] = x.value; return a; }, {});

// ------------------------------------------------------------------ dates (jour de Paris, calcul en UTC pour ignorer l'heure d'été)
/** Date du jour AAAA-MM-JJ, en heure de Paris. */
export const dateJourFichier = (quand = new Date()) => { const p = partiesParis(quand); return `${p.year}-${p.month}-${p.day}`; };
export const aujourdhui = () => dateJourFichier();
/** Jour de Paris (AAAA-MM-JJ) d'un horodatage stocké en UTC. */
export const jourParis = (iso) => dateJourFichier(new Date(iso));
const enDate = (j) => { const [a, m, d] = j.split('-').map(Number); return new Date(Date.UTC(a, m - 1, d)); };
const enJour = (d) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
export const ajouterJours = (j, n) => { const d = enDate(j); d.setUTCDate(d.getUTCDate() + n); return enJour(d); };
const debutMois = (j, decalage = 0) => { const d = enDate(j); return enJour(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + decalage, 1))); };
const finMois = (j, decalage = 0) => ajouterJours(debutMois(j, decalage + 1), -1);

/** Raccourcis de la Période, dans l'ordre et avec les noms de Metabase. Les « derniers » jours et mois ne comptent pas la période en cours ; seule exception voulue : « 12 mois glissants » garde le mois en cours. */
export const RACCOURCIS = [
  { id: 'aujourdhui', libelle: 'Aujourd’hui', plage: (t) => [t, t] },
  { id: 'hier', libelle: 'Hier', plage: (t) => [ajouterJours(t, -1), ajouterJours(t, -1)] },
  { id: 'semaine', libelle: 'Semaine précédente', plage: (t) => { const lundi = ajouterJours(t, -((enDate(t).getUTCDay() + 6) % 7)); return [ajouterJours(lundi, -7), ajouterJours(lundi, -1)]; } },
  { id: '7j', libelle: '7 derniers jours', plage: (t) => [ajouterJours(t, -7), ajouterJours(t, -1)] },
  { id: '30j', libelle: '30 derniers jours', plage: (t) => [ajouterJours(t, -30), ajouterJours(t, -1)] },
  { id: 'mois', libelle: 'Mois précédent', plage: (t) => [debutMois(t, -1), finMois(t, -1)] },
  { id: '3m', libelle: '3 derniers mois', plage: (t) => [debutMois(t, -3), finMois(t, -1)] },
  { id: '12m', libelle: '12 mois glissants', plage: (t) => [debutMois(t, -11), finMois(t, 0)] }, // les 11 mois d'avant ET le mois en cours : même fenêtre que les séries mensuelles
  { id: 'ce-mois', libelle: 'Ce mois', plage: (t) => [debutMois(t), finMois(t)] },
  { id: 'annee', libelle: 'Cette année', plage: (t) => [`${t.slice(0, 4)}-01-01`, `${t.slice(0, 4)}-12-31`] },
];

export const afficherJour = (j) => { const [a, m, d] = j.split('-'); return `${d}/${m}/${a}`; };
export function libellePlage(du, au) {
  if (du && au) return du === au ? afficherJour(du) : `${afficherJour(du)} – ${afficherJour(au)}`;
  if (du) return `depuis le ${afficherJour(du)}`;
  if (au) return `jusqu’au ${afficherJour(au)}`;
  return '';
}

// ------------------------------------------------------------------ noms : sans tenir compte des majuscules, des accents ni des espaces en trop
/** Forme de comparaison d'un nom : minuscules, sans accents, espaces simples. */
export const normaliser = (s) => (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
/** Nom du fournisseur à afficher : le nom enregistré de l'entreprise (même SIRET = même nom), sinon le nom écrit sur la facture. */
export const nomFournisseur = (f) => (f.fournisseur_affiche && f.fournisseur_affiche.trim()) || f.fournisseur;
/** Clé de regroupement : un seul fournisseur par entreprise. */
export const cleFournisseur = (f) => normaliser(nomFournisseur(f));

// ------------------------------------------------------------------ filtres : qui regarde quoi
const choixDe = (f, id) => { const v = f[id]; return v && v.type === 'liste' && v.choix.length ? v.choix : null; };

/** Applique les filtres aux factures (Période sur la date de la facture, Chantier, Statut, Fournisseur). */
export function filtrerFactures(lignes, f) {
  const ch = choixDe(f, 'chantier'), st = choixDe(f, 'statut'), fo0 = choixDe(f, 'fournisseur'), fo = fo0 ? new Set(fo0.map(normaliser)) : null;
  const per = f.periode && f.periode.type === 'periode' ? f.periode : null;
  return lignes.filter((l) => {
    if (ch && !ch.includes(l.chantier)) return false;
    if (st && !st.includes(l.statut_fr)) return false;
    if (fo && !fo.has(cleFournisseur(l))) return false;
    if (per) { if (per.du && l.date_ref < per.du) return false; if (per.au && l.date_ref > per.au) return false; }
    return true;
  });
}

/** Chantiers : seul le filtre Chantier s'applique ; le budget consommé reste celui de toute la vie du chantier. */
export function filtrerChantiers(lignes, f) {
  const ch = choixDe(f, 'chantier');
  return lignes.filter((c) => !ch || ch.includes(c.chantier));
}

export const nbFiltresActifs = (f) => Object.values(f).filter(Boolean).length;

// ------------------------------------------------------------------ filtres par onglet
/** Dirigeant : aucun filtre (chiffres « du jour »). Période et Chantier communs à Pilotage, Liste, Prix, Lignes et Fournisseurs ; Statut et Fournisseur propres à la Liste. */
export const FILTRES_PAR_ONGLET = { dirigeant: [], pilotage: ['periode', 'chantier'], liste: ['periode', 'chantier', 'statut', 'fournisseur'], prix: ['periode', 'chantier'], lignes: ['periode', 'chantier'], fournisseurs: ['periode', 'chantier'] };
export const STATUT_A_VALIDER = 'À valider';

/** Valeurs par défaut : Période = 12 mois glissants (mois en cours compris), tout le reste à « Tous ». */
export function filtresParDefaut(t = aujourdhui()) {
  const r = RACCOURCIS.find((x) => x.id === '12m'), [du, au] = r.plage(t);
  return { periode: { type: 'periode', libelle: r.libelle, du, au } };
}
/** Ne garde que les filtres qui concernent l'onglet. */
export const restreindre = (f, onglet) => Object.fromEntries(FILTRES_PAR_ONGLET[onglet].filter((id) => f[id]).map((id) => [id, f[id]]));
const memeValeur = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
/** Vrai si, pour cet onglet, un filtre s'écarte de sa valeur par défaut (affiche « Réinitialiser »). */
export const ecarteDuDefaut = (f, onglet, t = aujourdhui()) => { const d = filtresParDefaut(t); return FILTRES_PAR_ONGLET[onglet].some((id) => !memeValeur(f[id], d[id])); };

// ------------------------------------------------------------------ mémoire des filtres : une par onglet
export const ONGLETS_ORDRE = ['dirigeant', 'pilotage', 'liste', 'prix', 'lignes', 'fournisseurs'];
export const memoireParDefaut = (t = aujourdhui()) => {
  const d = filtresParDefaut(t);
  return Object.fromEntries(ONGLETS_ORDRE.map((o) => [o, restreindre(d, o)]));
};
/** Changement fait dans la barre de filtres de l'onglet : SEULS les filtres qui ont changé sont recopiés dans les onglets qui ont le même filtre. */
export function appliquerChangement(m, onglet, v) {
  const n = { ...m };
  for (const id of FILTRES_PAR_ONGLET[onglet]) {
    if (memeValeur(v[id], m[onglet][id])) continue;
    for (const o of ONGLETS_ORDRE) {
      if (!FILTRES_PAR_ONGLET[o].includes(id)) continue;
      const f = { ...n[o] };
      if (v[id]) f[id] = v[id]; else delete f[id];
      n[o] = f;
    }
  }
  return n;
}
/** « Réinitialiser » : remet à leur valeur par défaut les seuls filtres de l'onglet. */
export function reinitialiser(m, onglet, t = aujourdhui()) {
  const d = filtresParDefaut(t), v = {};
  for (const id of FILTRES_PAR_ONGLET[onglet]) if (d[id]) v[id] = d[id];
  return appliquerChangement(m, onglet, v);
}
const sansCle = (f, ...ids) => { const n = { ...f }; for (const id of ids) delete n[id]; return n; };
const statutAValider = () => ({ type: 'liste', choix: [STATUT_A_VALIDER] });

/** Lien « Voir les N factures à décider » du Dirigeant : la Liste passe à Statut = À valider, sans limite de période. Les autres onglets ne changent pas. */
export const actionVoirADecider = (m) => ({ ...m, liste: { statut: statutAValider() } });
/** Bouton « N à valider » de la Liste : Statut = À valider ; la Période est retirée seulement si elle cache des factures à valider. */
export const actionNAValider = (m, cachees) => ({ ...m, liste: { ...(cachees > 0 ? sansCle(m.liste, 'periode') : m.liste), statut: statutAValider() } });
/** « Afficher toutes les périodes » : la Période est retirée de la Liste seulement. */
export const actionToutesPeriodes = (m) => ({ ...m, liste: sansCle(m.liste, 'periode') });

/** Rappel de la Liste : toutes les factures à valider (hors période) et combien le filtre Période en cache (jamais en silence). */
export function rappelAValider(lignes, f) {
  const sansPeriode = filtrerFactures(lignes, { ...f, periode: undefined, statut: undefined }).filter((l) => l.statut === 'a_valider');
  const visibles = filtrerFactures(sansPeriode, { periode: f.periode });
  const st = choixDe(f, 'statut');
  const statutLesGarde = !st || st.includes(STATUT_A_VALIDER);
  return { total: sansPeriode.length, cachees: statutLesGarde ? sansPeriode.length - visibles.length : 0 };
}
/** Phrase d'avertissement : toujours vraie (une facture à valider peut être plus ancienne OU datée dans le futur). */
export const texteHorsPeriode = (n) => `${n} ${n === 1 ? 'facture à valider' : 'factures à valider'} hors de la période.`;

/** Valeurs proposées dans un filtre « liste » : sans vide, sans doublon (sans tenir compte des majuscules ni des accents), en ordre alphabétique à la française. */
export function valeursDistinctes(lignes) {
  const vues = new Map();
  for (const v of lignes) { if (v && v.trim() !== '') { const k = normaliser(v); if (!vues.has(k)) vues.set(k, v.trim()); } }
  return [...vues.values()].sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' }));
}
