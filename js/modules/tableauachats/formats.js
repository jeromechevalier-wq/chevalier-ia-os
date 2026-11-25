// Module Achats « Tableau de bord 2 » : formats d'affichage (français). LOGIQUE PURE : aucune dépendance au navigateur.
const NBSP = ' '; // espace insécable avant « € » et « % »
const euros0 = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const euros2 = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const entier = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
const decimal1 = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 1 });
const decimal2 = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const prixFin = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 4 });

/** Une valeur de la base devient un nombre, ou `null` si elle est vide ou illisible (jamais 0 inventé). */
export function nombre(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

const MOIS_COURTS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const MOIS_LONGS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
/** Date « AAAA-MM-JJ » (sans fuseau) : le jour reste celui écrit, jamais décalé. */
function jourEcrit(v) {
  const x = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v ?? ''));
  return x ? { a: x[1], m: Number(x[2]), j: x[3] } : null;
}

export function formater(v, f = 'texte') {
  if (f === 'texte') return v === null || v === undefined ? '' : String(v);
  if (f === 'date' || f === 'mois_court' || f === 'mois_annee') {
    const d = jourEcrit(v);
    if (!d) return v === null || v === undefined ? '' : String(v);
    if (f === 'date') return `${d.j}/${String(d.m).padStart(2, '0')}/${d.a}`;
    if (f === 'mois_court') return `${MOIS_COURTS[d.m - 1]} ${d.a.slice(2)}`;
    return `${MOIS_LONGS[d.m - 1]} ${d.a}`;
  }
  const n = nombre(v);
  if (n === null) return '';
  switch (f) {
    case 'euros0': return euros0.format(n);
    case 'euros2': return euros2.format(n);
    case 'euros_abrege': {
      const a = Math.abs(n);
      if (a >= 1_000_000) return `${decimal1.format(n / 1_000_000)}${NBSP}M€`;
      if (a >= 1_000) return `${decimal1.format(n / 1_000)}${NBSP}k€`;
      return `${entier.format(n)}${NBSP}€`;
    }
    case 'pourcent0': return `${entier.format(n)}${NBSP}%`;
    case 'pourcent1': return `${decimal1.format(n)}${NBSP}%`;
    case 'entier': return entier.format(n);
    case 'decimal2': return decimal2.format(n);
    case 'prix': return Math.abs(n) < 10 ? prixFin.format(n) : euros2.format(n); // un petit prix (0,0185 € le gramme) garde jusqu'à 4 décimales
    case 'jours': return `${decimal1.format(n)}${NBSP}${Math.abs(n) <= 1 ? 'jour' : 'jours'}`;
    default: return String(v);
  }
}

/** Variation en % entre deux périodes ; `null` si la période précédente est à 0 ou vide (jamais d'infini). */
export function variation(actuel, precedent) {
  if (actuel === null || precedent === null || actuel === undefined || precedent === undefined || precedent === 0) return null;
  return ((actuel - precedent) / Math.abs(precedent)) * 100;
}
