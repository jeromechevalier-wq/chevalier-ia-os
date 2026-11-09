// Statistiques des devis (portail devis seul, 09/11/2026 ; étude H.5) : fonction PURE, sans écran ni base.
// Elle ne lit que les devis (tous, rattachés à une affaire ou non) et s'appuie sur `montantDesDevis` pour le montant : mêmes règles que le montant des affaires.
// Règles de Jérôme : un devis ARCHIVÉ compte (archiver = ranger) ; brouillon, refusé et remplacé n'entrent jamais dans le chiffre d'affaires ; les devis de TEST sont exclus de tout ; sans affaire = inclus.
// Date d'un devis (une seule, pour le placer dans la période) : signé -> date de signature ; refusé -> date du refus ; envoyé -> date d'envoi ; finalisé -> date de finalisation ; brouillon -> date de création.
// Un ancien devis sans la date attendue retombe sur la date suivante de la liste (signature -> envoi -> finalisation -> création -> modification) ; sans aucune date lisible il est compté à part (`sansDate`), jamais perdu en silence.
import { montantDesDevis, versCentimes, versEuros } from './logique.js';
import { estTest, moisParis } from '../crm/logique.js';
import { enMs } from './liste.js';

/** Périodes proposées par l'écran (sélecteur simple). La première est celle par défaut. */
export const PERIODES = Object.freeze([
  Object.freeze({ id: '12-mois', libelle: '12 derniers mois', mois: 12 }),
  Object.freeze({ id: '6-mois', libelle: '6 derniers mois', mois: 6 }),
  Object.freeze({ id: '3-mois', libelle: '3 derniers mois', mois: 3 }),
  Object.freeze({ id: 'annee', libelle: 'Année en cours', mois: null }),
]);
export const PERIODE_DEFAUT = PERIODES[0].id;
export const STATUTS_STATISTIQUES = Object.freeze(['brouillon', 'en_attente_envoi', 'envoye', 'accepte', 'refuse', 'remplace']);
/** Statuts de devis « sortis » (remis au client) : le dénominateur du taux de transformation. Un devis signé directement depuis « Finalisé » (remis en main propre) compte aussi. */
const SORTIS = ['envoye', 'accepte', 'refuse'];
const CHAMPS_DATE = {
  accepte: ['accepteLe', 'envoyeLe', 'finaliseLe', 'creeLe', 'modifieLe'],
  refuse: ['refuseLe', 'envoyeLe', 'finaliseLe', 'creeLe', 'modifieLe'],
  envoye: ['envoyeLe', 'finaliseLe', 'creeLe', 'modifieLe'],
  en_attente_envoi: ['finaliseLe', 'creeLe', 'modifieLe'],
  brouillon: ['creeLe', 'modifieLe'],
  remplace: ['finaliseLe', 'creeLe', 'modifieLe'],
};

const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
/** « 2026-10 » -> « oct. 2026 ». */
export const libelleMois = (m) => `${MOIS[Number(m.slice(5)) - 1] ?? m.slice(5)} ${m.slice(0, 4)}`;

const moisSuivant = (m, n = 1) => { const [a, mo] = m.split('-').map(Number); const t = a * 12 + (mo - 1) + n; return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`; };

/** Mois (AAAA-MM) du premier au dernier de la période, `aujourdhui` = "AAAA-MM-JJ". Période inconnue : la période par défaut. */
export function moisDeLaPeriode(aujourdhui, periode = PERIODE_DEFAUT) {
  const fin = String(aujourdhui ?? '').slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(fin)) return [];
  const p = PERIODES.find((x) => x.id === periode) ?? PERIODES[0];
  const nombre = p.mois ?? Number(fin.slice(5));
  return Array.from({ length: nombre }, (_, i) => moisSuivant(fin, i - nombre + 1));
}

/** Date de référence d'un devis (ms) ou null. */
export function dateDuDevis(d) {
  for (const champ of CHAMPS_DATE[d?.statut] ?? []) { const ms = enMs(d[champ]); if (ms !== null) return ms; }
  return null;
}

/**
 * statistiquesDevis(devis, { aujourdhui: 'AAAA-MM-JJ', periode: '12-mois' | '6-mois' | '3-mois' | 'annee' })
 * -> { periode, mois: [{ mois, caSigneHt, signes, envoyes, devis }], parStatut: { <statut>: n }, nbDevis, caSigneHt, signes, sortis, tauxTransformation (0 à 100, arrondi, ou null sans devis sorti), sansDate }
 */
export function statistiquesDevis(devis, { aujourdhui, periode = PERIODE_DEFAUT } = {}) {
  const liste = Array.isArray(devis) ? devis : [];
  const idPeriode = PERIODES.some((p) => p.id === periode) ? periode : PERIODE_DEFAUT;
  const mois = moisDeLaPeriode(aujourdhui, idPeriode).map((m) => ({ mois: m, centimes: 0, signes: 0, envoyes: 0, devis: 0 }));
  const parMois = new Map(mois.map((m) => [m.mois, m]));
  const parStatut = Object.fromEntries(STATUTS_STATISTIQUES.map((s) => [s, 0]));
  let sansDate = 0;
  for (const d of liste) {
    if (!d || typeof d !== 'object' || estTest(d) || !STATUTS_STATISTIQUES.includes(d.statut)) continue; // test, vide ou statut inconnu : hors statistiques
    const ms = dateDuDevis(d);
    if (ms === null) { sansDate += 1; continue; }
    const ligne = parMois.get(moisParis(new Date(ms)));
    if (!ligne) continue; // hors période
    parStatut[d.statut] += 1;
    if (d.statut !== 'remplace') ligne.devis += 1; // une ancienne version remplacée n'est pas un devis de plus : « N devis » = la somme des statuts affichés
    if (SORTIS.includes(d.statut)) ligne.envoyes += 1;
    if (d.statut === 'accepte') {
      ligne.signes += 1;
      const m = montantDesDevis([d]); // un devis signé seul : nature « accepte » ; total HT figé illisible -> null, le devis compte mais n'ajoute rien
      if (m?.nature === 'accepte') ligne.centimes += versCentimes(m.montant);
    }
  }
  const total = (cle) => mois.reduce((s, m) => s + m[cle], 0);
  const sortis = total('envoyes');
  const signes = total('signes');
  return {
    periode: idPeriode,
    mois: mois.map(({ centimes, ...m }) => ({ ...m, caSigneHt: versEuros(centimes) })),
    parStatut,
    nbDevis: total('devis'),
    caSigneHt: versEuros(total('centimes')),
    signes,
    sortis,
    tauxTransformation: sortis ? Math.round((signes / sortis) * 100) : null,
    sansDate,
  };
}
