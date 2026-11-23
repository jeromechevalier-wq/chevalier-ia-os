// Règles pures du Tableau de bord (sans DOM ni Firebase, testées par Node) : formats français nommés, seuils et règles de couleur, variation d'un grand chiffre,
// balisage minimal d'un texte, tri et pagination d'un tableau, fonctions de format et couleurs nommées pour ECharts.
// Le réglage ne contient JAMAIS de fonction : il nomme un format (liste fermée) et c'est ce fichier, code de l'appli, qui le met en œuvre.

export const FORMATS = Object.freeze(['euros0', 'euros2', 'euros4', 'euros_abrege', 'pourcent0', 'pourcent1', 'entier', 'jours', 'date', 'date_heure', 'mois_annee']);
export const COULEURS = Object.freeze(['bon', 'attention', 'mauvais', 'neutre']);
export const ESPACE_MILLIERS = ' '; // espace fine insécable
export const ESPACE_INSECABLE = ' '; // avant « € », « % » et les unités
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const FUSEAU = 'Europe/Paris';

const estObjet = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
export const estVide = (v) => v === null || v === undefined || (typeof v === 'string' && v.trim() === '');

/** Nombre d'une valeur de la base (les « numeric » de Postgres arrivent en texte), ou null. */
export function nombre(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && /^\s*-?\d+(\.\d+)?\s*$/.test(v)) return Number(v);
  return null;
}

function groupes(n, maxDec, minDec = maxDec) {
  const texte = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: minDec, maximumFractionDigits: maxDec, useGrouping: true }).format(n)
    .replace(/[   ]/g, ESPACE_MILLIERS).replace('−', '-');
  return /^-0(,0+)?$/.test(texte) ? texte.slice(1) : texte; // jamais « -0 »
}

function eurosAbrege(n) {
  const a = Math.abs(n);
  if (a >= 1e6 || Math.round(a / 100) / 10 >= 1000) return `${groupes(n / 1e6, 1, 0)}${ESPACE_INSECABLE}M€`;
  if (a >= 1000) return `${groupes(n / 1000, 1, 0)}${ESPACE_INSECABLE}k€`;
  return `${groupes(n, 0)}${ESPACE_INSECABLE}€`;
}

const DATE_SEULE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MOIS_SEUL = /^(\d{4})-(\d{2})$/;
const SANS_FUSEAU = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/;
const deux = (n) => String(n).padStart(2, '0');
const jourValide = (a, m, j) => m >= 1 && m <= 12 && j >= 1 && j <= new Date(Date.UTC(a, m, 0)).getUTCDate(); // « 2026-02-31 » est refusé
const CALENDRIER = typeof Intl !== 'undefined' ? new Intl.DateTimeFormat('fr-FR', { timeZone: FUSEAU, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }) : null;

/** { a, m, j, h, mi } d'une date : « AAAA-MM-JJ » et « AAAA-MM » sont lues telles quelles (aucun fuseau) ; un instant (ISO avec Z ou décalage, Date) est mis à l'heure de Paris. null si illisible. */
export function partiesDate(v) {
  if (typeof v === 'string') {
    let m = DATE_SEULE.exec(v.trim());
    if (m) return jourValide(+m[1], +m[2], +m[3]) ? { a: +m[1], m: +m[2], j: +m[3], h: null, mi: null } : null;
    m = MOIS_SEUL.exec(v.trim());
    if (m) return { a: +m[1], m: +m[2], j: null, h: null, mi: null };
    m = SANS_FUSEAU.exec(v.trim());
    if (m) return jourValide(+m[1], +m[2], +m[3]) && +m[4] < 24 && +m[5] < 60 ? { a: +m[1], m: +m[2], j: +m[3], h: +m[4], mi: +m[5] } : null;
  }
  const d = v instanceof Date ? v : (typeof v === 'string' ? new Date(v) : (typeof v === 'number' && Math.abs(v) >= 1e11 ? new Date(v) : null)); // un nombre de millisecondes (instant) est une date, pas un nombre brut
  if (!d || Number.isNaN(d.getTime()) || !CALENDRIER) return null;
  const p = Object.fromEntries(CALENDRIER.formatToParts(d).map((x) => [x.type, x.value]));
  return { a: +p.year, m: +p.month, j: +p.day, h: +p.hour, mi: +p.minute };
}

/** Texte d'une valeur selon un format nommé. Valeur vide : ''. Format absent ou inconnu : la valeur telle quelle (nombre à la française). Jamais d'exception. */
export function formater(format, valeur) {
  if (valeur === true) return 'oui';
  if (valeur === false) return 'non';
  if (estVide(valeur)) return '';
  if (format === 'date' || format === 'date_heure' || format === 'mois_annee') {
    const p = partiesDate(valeur);
    if (!p || !p.m || p.m > 12) return String(valeur);
    if (format === 'mois_annee') return `${MOIS[p.m - 1]} ${p.a}`;
    if (p.j === null) return `${MOIS[p.m - 1]} ${p.a}`;
    const jour = `${deux(p.j)}/${deux(p.m)}/${p.a}`;
    return format === 'date_heure' && p.h !== null ? `${jour} ${deux(p.h)}:${deux(p.mi)}` : jour;
  }
  const n = nombre(valeur);
  if (n === null) return String(valeur);
  switch (format) {
    case 'euros0': return `${groupes(n, 0)}${ESPACE_INSECABLE}€`;
    case 'euros2': return `${groupes(n, 2)}${ESPACE_INSECABLE}€`;
    case 'euros4': return `${groupes(n, 4)}${ESPACE_INSECABLE}€`; // les petits coûts (un appel d'IA : 0,0009 €)
    case 'euros_abrege': return eurosAbrege(n);
    case 'pourcent0': return `${groupes(n, 0)}${ESPACE_INSECABLE}%`;
    case 'pourcent1': return `${groupes(n, 1)}${ESPACE_INSECABLE}%`;
    case 'entier': return groupes(n, 0);
    case 'jours': return `${groupes(n, 1, 0)}${ESPACE_INSECABLE}${Math.abs(n) < 2 ? 'jour' : 'jours'}`;
    default: return groupes(n, 2, 0);
  }
}

// ---------- Couleurs, seuils, règles ----------
export const estCouleur = (c) => COULEURS.includes(c);

/** Seuil d'un grand chiffre : le premier dont `jusqua` est absent ou ≥ valeur (borne incluse). null si la valeur n'est pas un nombre ou s'il n'y a pas de seuils. */
export function seuilDe(seuils, valeur) {
  const n = nombre(valeur);
  if (n === null || !Array.isArray(seuils)) return null;
  return seuils.filter(estObjet).find((s) => s.jusqua === undefined || s.jusqua === null || n <= s.jusqua) ?? null;
}

function comparer(si, valeur, ref) {
  if (ref === null || ref === undefined) return si === '=' && estVide(valeur); // « = null » : la valeur est vide
  if (estVide(valeur)) return false;
  const a = nombre(valeur);
  const b = typeof ref === 'number' ? ref : nombre(ref);
  if (a !== null && b !== null) {
    switch (si) { case '>=': return a >= b; case '>': return a > b; case '<=': return a <= b; case '<': return a < b; case '=': return a === b; default: return false; }
  }
  return si === '=' && String(valeur) === String(ref);
}

/** Couleur nommée d'une cellule : la PREMIÈRE règle vraie gagne ; null si aucune. */
export function couleurDeRegles(regles, valeur) {
  if (!Array.isArray(regles)) return null;
  const r = regles.filter(estObjet).find((x) => comparer(x.si, valeur, x.valeur));
  return r && estCouleur(r.couleur) ? r.couleur : null;
}

// ---------- Variation d'un grand chiffre ----------
const comparerPeriodes = (a, b) => {
  const na = nombre(a);
  const nb = nombre(b);
  if (na !== null && nb !== null) return na - nb;
  return String(a).localeCompare(String(b));
};

/**
 * Variation entre les DEUX DERNIÈRES périodes : les lignes sont rangées par `periodeColonne` (croissant), les deux dernières comptent.
 * Rend { actuelle, precedente, periodePrecedente, pourcent, sens: 'hausse'|'baisse'|'stable'|null, couleur } ; `pourcent` est null si la période d'avant vaut 0 ou manque.
 * `hausse` = 'bon' (une hausse est une bonne nouvelle) ou 'mauvais' (une hausse est mauvaise, ex. une dépense).
 */
export function calculerVariation(lignes, { colonne, periodeColonne, hausse } = {}) {
  const l = (Array.isArray(lignes) ? lignes : []).filter((x) => estObjet(x) && !estVide(x[periodeColonne]));
  l.sort((x, y) => comparerPeriodes(x[periodeColonne], y[periodeColonne]));
  const derniere = l.at(-1);
  const avant = l.length >= 2 ? l.at(-2) : null;
  const actuelle = derniere ? nombre(derniere[colonne]) : null;
  const vide = { actuelle, precedente: null, periodePrecedente: null, pourcent: null, sens: null, couleur: null };
  if (!avant) return vide;
  const precedente = nombre(avant[colonne]);
  if (actuelle === null || precedente === null) return { ...vide, periodePrecedente: avant[periodeColonne] };
  const base = { ...vide, precedente, periodePrecedente: avant[periodeColonne] };
  if (precedente === 0) return { ...base, precedenteNulle: true }; // pas de pourcentage : l'écran dit « Variation non calculable »
  const pourcent = ((actuelle - precedente) / Math.abs(precedente)) * 100;
  const arrondi = Math.round(pourcent * 10) / 10;
  const sens = arrondi === 0 ? 'stable' : (arrondi > 0 ? 'hausse' : 'baisse');
  const couleur = sens === 'stable' ? 'neutre' : ((sens === 'hausse') === (hausse !== 'mauvais') ? 'bon' : 'mauvais');
  return { ...base, pourcent, sens, couleur };
}

/** La ligne qui porte la valeur d'un grand chiffre : la plus récente selon `periodeColonne` si la variation est demandée, sinon la première ligne lue. */
export function ligneDuChiffre(lignes, variation) {
  const l = (Array.isArray(lignes) ? lignes : []).filter(estObjet);
  if (!variation) return l[0] ?? null;
  const avecPeriode = l.filter((x) => !estVide(x[variation.periodeColonne]));
  return avecPeriode.sort((x, y) => comparerPeriodes(x[variation.periodeColonne], y[variation.periodeColonne])).at(-1) ?? l[0] ?? null;
}

/** « +12,3 % » ou « -4,0 % » (une décimale, signe toujours écrit). */
export const texteVariation = (pourcent) => { const a = Math.round(pourcent * 10) / 10; return `${a > 0 ? '+' : ''}${groupes(a, 1)}${ESPACE_INSECABLE}%`; }; // l'arrondi affiché, sans signe à 0

// ---------- Texte : balisage minimal (gras **, italique *, retour à la ligne, lien interne [libellé](#onglet)) ----------
// Même expression de lien que la validation du serveur (functions/src/pilotage/reglages.js, LIEN_TEXTE_SOURCE) : un test verrouille l'égalité des deux constantes. Pas de lookbehind (Safari avant 16.4).
export const LIEN_TEXTE_SOURCE = '\\[[^\\]\\n]+\\]\\(#[a-z0-9_-]{1,40}\\)';
const JETON = new RegExp(`(\\*\\*(?!\\s)(?:[^*\\n]*[^*\\s])\\*\\*|\\*(?!\\s)(?:[^*\\n]*[^*\\s])\\*|${LIEN_TEXTE_SOURCE})`);

/** Texte -> lignes de segments { texte, gras?, italique?, onglet? }. Jamais de HTML : l'écran pose chaque segment avec textContent. */
export function analyserTexte(texte) {
  return String(texte ?? '').split('\n').map((ligne) => ligne.split(JETON).filter((x) => x !== '').map((p) => {
    if (p.startsWith('**') && p.endsWith('**') && p.length > 4) return { texte: p.slice(2, -2), gras: true };
    if (p.startsWith('*') && p.endsWith('*') && p.length > 2) return { texte: p.slice(1, -1), italique: true };
    const m = /^\[([^\]]+)\]\(#([a-z0-9_-]{1,40})\)$/.exec(p);
    return m ? { texte: m[1], onglet: m[2] } : { texte: p };
  }));
}

// ---------- Tableau : tri et pagination ----------
/** Copie triée (stable) : nombres comparés comme des nombres, le reste comme du texte français ; les valeurs vides en dernier, dans les deux sens. */
export function trierLignes(lignes, colonne, sens = 'asc') {
  const f = sens === 'desc' ? -1 : 1;
  return lignes.map((l, i) => [l, i]).sort(([a, i], [b, j]) => {
    const va = a?.[colonne];
    const vb = b?.[colonne];
    if (estVide(va) || estVide(vb)) return estVide(va) === estVide(vb) ? i - j : (estVide(va) ? 1 : -1);
    const na = nombre(va);
    const nb = nombre(vb);
    const c = na !== null && nb !== null ? na - nb : String(va).localeCompare(String(vb), 'fr', { numeric: true });
    return c === 0 ? i - j : c * f;
  }).map(([l]) => l);
}

/** Une page de lignes : { lignes, page (1…), pages }. Une page demandée hors limites est ramenée dans les limites. */
export function pageDe(lignes, page, parPage) {
  const taille = Math.max(1, Number.isInteger(parPage) ? parPage : 20);
  const pages = Math.max(1, Math.ceil(lignes.length / taille));
  const p = Math.min(Math.max(1, page || 1), pages);
  return { lignes: lignes.slice((p - 1) * taille, p * taille), page: p, pages };
}

// ---------- ECharts : formats et couleurs nommées ----------
/** Fonction de format d'un nom de format (valeur d'axe ou d'infobulle). */
export const fonctionFormat = (nom) => (v) => formater(nom, Array.isArray(v) ? v.at(-1) : v);

/** Le nombre que porte un point de graphique (étiquette) : sa valeur si c'est un nombre, sinon la dimension encodée en valeur dans la ligne. */
export function nombreDuPoint(p) {
  if (nombre(p?.value) !== null) return nombre(p.value);
  const cles = ['value', 'y', 'x', 'radius', 'angle'];
  const dims = p?.dimensionNames ?? [];
  for (const c of cles) {
    for (const i of p?.encode?.[c] ?? []) {
      const v = Array.isArray(p.value) ? p.value[i] : p.value?.[dims[i]];
      if (nombre(v) !== null) return nombre(v);
    }
  }
  return Array.isArray(p?.value) ? nombre(p.value.at(-1)) : null;
}

const toutesLesCles = (v) => (Array.isArray(v) ? v : (v === undefined ? [] : [v]));

/** Pose les fonctions de format demandées par `formats` ({ axeY, axeX, infobulle, etiquettes }) sur une COPIE de l'option. */
export function appliquerFormats(option, formats) {
  if (!estObjet(formats) || !Object.keys(formats).length) return option;
  const sortie = { ...option };
  const axe = (cle, nom) => {
    if (!nom || sortie[cle] === undefined) return;
    const poser = (a) => ({ ...(estObjet(a) ? a : {}), axisLabel: { ...(estObjet(a?.axisLabel) ? a.axisLabel : {}), formatter: fonctionFormat(nom) } });
    sortie[cle] = Array.isArray(sortie[cle]) ? sortie[cle].map(poser) : poser(sortie[cle]);
  };
  axe('yAxis', formats.axeY);
  axe('xAxis', formats.axeX);
  if (formats.infobulle) {
    const poser = (t) => ({ ...(estObjet(t) ? t : {}), valueFormatter: fonctionFormat(formats.infobulle) });
    sortie.tooltip = Array.isArray(sortie.tooltip) ? sortie.tooltip.map(poser) : poser(sortie.tooltip);
  }
  if (formats.etiquettes && sortie.series !== undefined) {
    const nom = formats.etiquettes;
    sortie.series = toutesLesCles(sortie.series).map((s) => (estObjet(s) ? { ...s, label: { ...(estObjet(s.label) ? s.label : {}), formatter: (p) => formater(nom, nombreDuPoint(p)) } } : s));
  }
  return sortie;
}

/** Remplace, dans une COPIE de l'option, chaque chaîne « @bon », « @attention », « @mauvais », « @neutre » par la couleur du thème (`couleurs` = { bon, attention, mauvais, neutre }). Une autre chaîne n'est jamais touchée. */
export function resoudreCouleurs(option, couleurs) {
  const aller = (v) => {
    if (typeof v === 'string') {
      const m = /^@(bon|attention|mauvais|neutre)$/.exec(v);
      return m && couleurs?.[m[1]] ? couleurs[m[1]] : v;
    }
    if (Array.isArray(v)) return v.map(aller);
    if (estObjet(v)) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, aller(x)]));
    return v;
  };
  return aller(option);
}
