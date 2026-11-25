// Formats et normalisation du module Articles : copie des fonctions utilisées par la logique d'origine (le module n'importe aucun autre module).
// Dates : un format AAAA-MM-JJ sans heure est écrit tel quel (jamais converti en fuseau, sinon décalage d'un jour) ; un horodatage est converti en date de Paris.

const FUSEAU = 'Europe/Paris';

/** Minuscules, sans accents, œ = oe, æ = ae, espaces du début et de la fin retirés (comparaison de textes pour la recherche et le tri). */
export const normaliser = (s) =>
  (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/œ/gi, 'oe').replace(/æ/gi, 'ae').toLowerCase().trim();

/** Montant en euros au format français ; « — » quand il est inconnu. */
export const euros = (n) =>
  n === null || n === undefined
    ? '—'
    : n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });

/** Nombre au format français, sans arrondi caché (quantités, prix unitaires) : au plus `maxDecimales` décimales, sans zéros inutiles. */
export const nombreFr = (n, maxDecimales = 4) =>
  n === null || n === undefined ? '—' : new Intl.NumberFormat('fr-FR', { maximumFractionDigits: maxDecimales }).format(n);

/** Date au format JJ/MM/AAAA (« — » si vide). */
export const dateFr = (valeur) => {
  if (!valeur) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valeur);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  return new Date(valeur).toLocaleDateString('fr-FR', { timeZone: FUSEAU });
};
