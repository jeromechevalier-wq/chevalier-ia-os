// Module Achats « Tableau de bord 2 » : les chiffres des graphiques sont recalculés à partir des factures FILTRÉES, avec les mêmes règles que les vues v_td_* :
// avoirs en négatif déjà dans montant_ht, mois futurs exclus des séries mensuelles, classement des fournisseurs à partir des seules factures acceptées de montant positif. LOGIQUE PURE.
// (L'ancien classement « Pareto 80/20 » est retiré dans l'appli d'origine : seul le classement des fournisseurs qui sert au « top 3 » reste.)
import { nombre, formater } from './formats.js';
import { aujourdhui, cleFournisseur, jourParis, nomFournisseur } from './filtrage.js';

const somme = (l) => l.reduce((t, f) => t + (nombre(f.montant_ht) ?? 0), 0);
const arrondi1 = (n) => Math.round(n * 10) / 10;

/** 12 mois glissants, du plus ancien au mois en cours, au format AAAA-MM-01. */
export function douzeMois(t = aujourdhui()) {
  const [a, m] = t.split('-').map(Number);
  return Array.from({ length: 12 }, (_, i) => { const d = new Date(Date.UTC(a, m - 1 - (11 - i), 1)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`; });
}
const moisCourant = (t = aujourdhui()) => `${t.slice(0, 7)}-01`;

export function achatsParMois(l, t = aujourdhui()) {
  return douzeMois(t).map((mois) => { const x = l.filter((f) => f.statut === 'acceptee' && f.mois === mois); return { mois, total_ht: somme(x), nb_factures: x.length }; });
}

/** Classement des fournisseurs ou des chantiers (factures acceptées, montants positifs). */
export function pareto(l, axe) {
  const g = new Map();
  for (const f of l.filter((x) => x.statut === 'acceptee')) {
    const cle = axe === 'fournisseurs' ? cleFournisseur(f) : `${f.chantier_id ?? ''}|${f.chantier}`;
    const e = g.get(cle) ?? { nom: axe === 'fournisseurs' ? nomFournisseur(f) : f.chantier, m: 0 };
    e.m += nombre(f.montant_ht) ?? 0;
    g.set(cle, e);
  }
  const lignes = [...g.values()].filter((e) => e.m > 0).sort((a, b) => b.m - a.m || a.nom.localeCompare(b.nom, 'fr'));
  const total = lignes.reduce((t, e) => t + e.m, 0);
  let cum = 0, avant = 0;
  return lignes.map((e, i) => {
    avant = cum; cum += e.m;
    return { rang: i + 1, nom: e.nom, montant_ht: e.m, part_pct: arrondi1((100 * e.m) / total), cumul_pct: arrondi1((100 * cum) / total), dans_80_pct: avant / total < 0.8 - 0.0000001 };
  });
}

export function aValider(l) {
  const x = l.filter((f) => f.statut === 'a_valider');
  return { nb: x.length, total_ht: somme(x), attente_max_jours: Math.max(0, ...x.map((f) => f.jours_attente ?? 0)) };
}
export const TRANCHES = [{ tranche: '0 à 2 jours', min: 0, max: 2 }, { tranche: '3 à 7 jours', min: 3, max: 7 }, { tranche: '8 à 30 jours', min: 8, max: 30 }, { tranche: 'Plus de 30 jours', min: 31, max: 1e9 }];
export function attenteParTranche(l) {
  const x = l.filter((f) => f.statut === 'a_valider');
  return TRANCHES.map((t) => { const y = x.filter((f) => (f.jours_attente ?? -1) >= t.min && (f.jours_attente ?? -1) <= t.max); return { tranche: t.tranche, nb_factures: y.length, montant_ht: somme(y) }; });
}

export function tauxRefusParMois(l, t = aujourdhui()) {
  return douzeMois(t).map((mois) => {
    const x = l.filter((f) => f.mois === mois), ref = x.filter((f) => f.statut === 'refusee').length, dec = x.filter((f) => f.statut === 'acceptee' || f.statut === 'refusee').length;
    return { mois, nb_decidees: dec, taux_refus_pct: dec ? arrondi1((100 * ref) / dec) : null }; // mois sans décision : vide, jamais 0 % inventé
  });
}

export function facturesParMoisStatut(l, t = aujourdhui()) {
  const courant = moisCourant(t);
  const g = new Map();
  for (const f of l.filter((x) => x.mois <= courant)) { const k = `${f.mois}|${f.statut_fr}`; const e = g.get(k) ?? { mois: f.mois, statut_fr: f.statut_fr, nb_factures: 0 }; e.nb_factures += 1; g.set(k, e); }
  return [...g.values()].sort((a, b) => a.mois.localeCompare(b.mois));
}

export function depensesMoisChantier(l, t = aujourdhui()) {
  const courant = moisCourant(t);
  const g = new Map();
  for (const f of l.filter((x) => x.statut === 'acceptee' && x.mois <= courant)) { const k = `${f.mois}|${f.chantier_id ?? ''}|${f.chantier}`; const e = g.get(k) ?? { mois: f.mois, chantier: f.chantier, total_ht: 0 }; e.total_ht += nombre(f.montant_ht) ?? 0; g.set(k, e); }
  return [...g.values()];
}

export function delaiMedianJours(l, maintenant = Date.now()) {
  const x = l.filter((f) => f.statut !== 'a_valider' && f.date_decision && Date.parse(f.date_decision) >= maintenant - 90 * 86400000)
    .map((f) => (Date.parse(f.date_decision) - Date.parse(f.created_at)) / 86400000).sort((a, b) => a - b);
  if (!x.length) return { jours: null, nb: 0 };
  const m = x.length % 2 ? x[(x.length - 1) / 2] : (x[x.length / 2 - 1] + x[x.length / 2]) / 2;
  return { jours: arrondi1(m), nb: x.length };
}
export function sansChantier(l) { return { nb: l.filter((f) => f.sans_chantier && f.statut !== 'refusee').length, montant_ht: somme(l.filter((f) => f.sans_chantier && f.statut !== 'refusee')) }; }
export function malgreAlerteCeMois(l, t = aujourdhui()) {
  return l.filter((f) => f.acceptee_malgre_alerte && f.statut === 'acceptee' && f.date_decision && jourParis(f.date_decision).slice(0, 7) === t.slice(0, 7)).length;
}
export function top3Fournisseurs(l) {
  const p = pareto(l, 'fournisseurs'); const total = p.reduce((s, x) => s + x.montant_ht, 0);
  return { part_top3_pct: total > 0 ? arrondi1((100 * p.slice(0, 3).reduce((s, x) => s + x.montant_ht, 0)) / total) : null, nb_fournisseurs: p.length };
}
export const aSurveiller = (c) => c.filter((x) => x.statut === 'en_cours' && (nombre(x.pct_budget_consomme) ?? 0) >= 90);

/** Les quatre phrases du résumé du jour (mêmes mots que la vue v_td_resume_jour). */
export function resumeDuJour(l, c) {
  const a = aValider(l), s = aSurveiller(c);
  const derniere = l.reduce((m, f) => (m === null || f.created_at > m ? f.created_at : m), null);
  return [
    a.nb === 0 ? 'Aucune facture à décider.' : `${a.nb} ${a.nb === 1 ? 'facture à décider' : 'factures à décider'} : ${formater(a.total_ht, 'euros0')} HT.`,
    a.nb === 0 ? 'Rien n’attend.' : `La plus ancienne attend depuis ${a.attente_max_jours} ${a.attente_max_jours <= 1 ? 'jour' : 'jours'}.`,
    s.length === 0 ? 'Aucun chantier en cours à 90 % de son budget ou plus.' : `${s.length} ${s.length === 1 ? 'chantier à 90 % du budget ou plus' : 'chantiers à 90 % du budget ou plus'} : ${s.map((x) => x.chantier).join(', ')}.`,
    derniere === null ? 'Aucune facture reçue pour le moment.' : `Dernière facture reçue le ${formater(jourParis(derniere), 'date')}.`,
  ];
}
