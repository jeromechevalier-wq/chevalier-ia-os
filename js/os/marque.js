// Fiche de marque d'un client (chantier 5 de la plateforme clients) : logique pure, sans Firebase ni DOM, testée seule.
// La fiche est lisible SANS connexion (marques/<client>) : elle ne contient donc que du visuel, jamais rien de confidentiel.
// Elle ne s'écrit jamais depuis un navigateur (règles Firestore) ; ce fichier ne fait que la lire proprement et la rendre sûre.

/** Message de refus, IDENTIQUE pour un compte inconnu et pour un membre d'un autre client : il ne révèle rien. */
export const MESSAGE_REFUS_ESPACE = "Ce compte n'a pas accès à cet espace.";

/** Marque neutre : utilisée tant que la fiche n'est pas lue, et pour la page « espace indisponible ». */
export const MARQUE_NEUTRE = Object.freeze({
  nom: 'Espace client',
  couleur: '#f0a93a',
  logo: null,
  images: Object.freeze([]),
  accueil: '',
});

const ID_CLIENT = /^[a-z0-9][a-z0-9_-]{0,39}$/;
const COULEUR = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
const FOND_PAGE = '#241b2e'; // fond sombre de la page de connexion
const MAX_IMAGES = 4;

/** Identifiant de client lu dans une route (`espace/<client>`, éventuellement avec des majuscules) ; null si la route n'est pas valide. */
export function identifiantClientDepuisRoute(route) {
  const segs = String(route ?? '').split('/').filter(Boolean);
  if (segs[0] !== 'espace' || segs.length !== 2) return null;
  const id = segs[1].trim().toLowerCase();
  return ID_CLIENT.test(id) ? id : null;
}

/**
 * Route d'un espace client avec ou sans écran de module : `espace/<client>[/<route du module>]` -> { client, reste } ; null si l'identifiant est invalide.
 * `reste` est la route du module (ex. « crm/personnes/abc »), vide pour la page d'accueil du client.
 */
export function routeDansEspace(route) {
  const segs = String(route ?? '').split('/').filter(Boolean);
  if (segs[0] !== 'espace' || segs.length < 2) return null;
  const client = segs[1].trim().toLowerCase();
  return ID_CLIENT.test(client) ? { client, reste: segs.slice(2).join('/') } : null;
}

/** Clé d'entrée d'une route d'espace : `espace/<client>` en minuscules (les écrans d'un même client ne rechargent pas la page). */
export function cleEspace(route) {
  const segs = String(route ?? '').split('/').filter(Boolean);
  return segs[0] === 'espace' ? ['espace', ...(segs[1] ? [segs[1]] : [])].join('/').toLowerCase() : '';
}

/** La route désigne-t-elle une page d'espace client (valide ou non) ? Sert à choisir entre le CRM et la plateforme. */
export function estRouteEspace(route) {
  return String(route ?? '').split('/').filter(Boolean)[0] === 'espace';
}

/** Couleur CSS acceptée : seulement #rgb ou #rrggbb (aucune autre syntaxe ne passe dans une feuille de style). Renvoie #rrggbb ou null. */
export function normaliserCouleur(valeur) {
  if (typeof valeur !== 'string') return null;
  const v = valeur.trim();
  if (!COULEUR.test(v)) return null;
  const hex = v.slice(1).toLowerCase();
  return `#${hex.length === 3 ? [...hex].map((c) => c + c).join('') : hex}`;
}

function composantes(couleur) {
  const c = normaliserCouleur(couleur);
  if (!c) throw new Error(`Couleur invalide : « ${couleur} »`);
  return [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
}

/** Luminance relative (WCAG 2.x). */
export function luminance(couleur) {
  const [r, g, b] = composantes(couleur).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Rapport de contraste WCAG entre deux couleurs (de 1 à 21). */
export function contraste(a, b) {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

/** Texte à poser sur une couleur (bouton) : noir ou blanc, le plus lisible. Le contraste obtenu est toujours d'au moins 4,5. */
export function texteSur(couleur) {
  return contraste(couleur, '#000000') >= contraste(couleur, '#ffffff') ? '#000000' : '#ffffff';
}

function melanger(couleur, cible, part) {
  const a = composantes(couleur);
  const b = composantes(cible);
  return `#${a.map((v, i) => Math.round(v + (b[i] - v) * part).toString(16).padStart(2, '0')).join('')}`;
}

/** Couleur de marque utilisable comme TEXTE ou trait sur un fond donné : éclaircie ou assombrie tant que le contraste est inférieur au minimum. */
export function couleurLisibleSur(couleur, fond = FOND_PAGE, minimum = 4.5) {
  const cible = luminance(fond) < 0.5 ? '#ffffff' : '#000000';
  let c = normaliserCouleur(couleur) || MARQUE_NEUTRE.couleur;
  for (let part = 0; part <= 1.0001 && contraste(c, fond) < minimum; part += 0.1) c = melanger(normaliserCouleur(couleur) || MARQUE_NEUTRE.couleur, cible, part);
  return c;
}

/** Adresse d'image acceptée : https seulement (jamais javascript:, data: ni http:). */
export function urlImageValide(valeur) {
  if (typeof valeur !== 'string' || valeur.length > 2000) return null;
  try {
    const u = new URL(valeur.trim());
    return u.protocol === 'https:' ? u.href : null;
  } catch {
    return null;
  }
}

const texte = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/**
 * Fiche de marque brute (document Firestore) -> marque sûre à afficher, ou null si la fiche est absente ou inactive.
 * Tout champ invalide est ignoré (couleur -> couleur neutre, image -> écartée) : une fiche abîmée ne casse jamais la page.
 */
export function normaliserMarque(donnees) {
  if (!donnees || typeof donnees !== 'object' || donnees.actif !== true) return null;
  const images = (Array.isArray(donnees.images) ? donnees.images : [])
    .map((i) => (typeof i === 'string' ? { url: i } : i))
    .map((i) => ({ url: urlImageValide(i?.url), alt: texte(i?.alt, 120) }))
    .filter((i) => i.url)
    .slice(0, MAX_IMAGES);
  return {
    nom: texte(donnees.nom, 80) || MARQUE_NEUTRE.nom,
    couleur: normaliserCouleur(donnees.couleur) || MARQUE_NEUTRE.couleur,
    logo: urlImageValide(donnees.logo),
    images,
    accueil: texte(donnees.accueil, 500),
  };
}

/** Variables de style d'une marque : fond du bouton, texte lisible dessus, couleur lisible sur le fond de la page. */
export function styleMarque(marque) {
  const m = marque || MARQUE_NEUTRE;
  return {
    '--marque': m.couleur,
    '--marque-texte': texteSur(m.couleur),
    '--marque-lisible': couleurLisibleSur(m.couleur),
  };
}

// ---------------------------------------------------------------- accent de l'interface chez un client (chantier 6)
// L'accent de l'interface (boutons, menu actif, liens, pastilles) prend la couleur de marque du client. Les couleurs SÉMANTIQUES
// (étapes des affaires, phases des projets, priorités, retard, succès) ne passent jamais par ici : elles ne changent pas.
// Chez Jérôme (racine) rien n'est injecté : les jetons de css/tokens.css gardent leurs valeurs jaunes.

/** Surfaces les plus défavorables de chaque thème (css/tokens.css) : le contraste est garanti sur toutes les surfaces du thème. */
export const SURFACES_THEME = Object.freeze({ sombre: '#36353a', clair: '#efeee9' });
const CONTRASTE_TEXTE = 4.5; // texte, icônes, liens
const CONTRASTE_FOND = 3; // éléments d'interface (fond d'un bouton) : critère WCAG 1.4.11

/** Accent calculé pour un thème : { accent, surAccent, survol, trait } (toutes en #rrggbb). */
export function accentPourTheme(couleur, theme) {
  const surface = SURFACES_THEME[theme] ?? SURFACES_THEME.sombre;
  const base = normaliserCouleur(couleur) || MARQUE_NEUTRE.couleur;
  const accent = couleurLisibleSur(base, surface, CONTRASTE_FOND); // fond de bouton : visible sur la page
  const surAccent = texteSur(accent);
  return {
    accent,
    surAccent,
    survol: melanger(accent, surAccent === '#000000' ? '#ffffff' : '#000000', 0.2),
    trait: couleurLisibleSur(base, surface, CONTRASTE_TEXTE), // texte, icône, trait fin
  };
}

const ALPHAS = ['1f', '20', '26', '33', '55', '66', '80', '99'];

/**
 * Feuille de style de l'accent d'un client : redéfinit les jetons d'accent de tokens.css pour les deux thèmes
 * (sélecteur `:root[data-marque]`, plus précis que celui des thèmes). La couleur est revalidée (#rgb / #rrggbb) : rien d'autre n'entre dans la feuille.
 */
export function feuilleAccent(couleur) {
  const base = normaliserCouleur(couleur) || MARQUE_NEUTRE.couleur;
  const alphas = ALPHAS.map((a) => `--accent-a${a}: ${base}${a};`).join(' ');
  return ['sombre', 'clair'].map((theme) => {
    const a = accentPourTheme(base, theme);
    return `:root[data-theme='${theme}'][data-marque] { --accent: ${a.accent}; --sur-accent: ${a.surAccent}; --accent-survol: ${a.survol}; --accent-trait: ${a.trait}; --lien: ${a.trait}; ${alphas} }`;
  }).join('\n');
}

// ---------------------------------------------------------------- identité de la page (titre, icône, appli installée)

/** Première lettre du nom, en majuscule (pastille et icône quand il n'y a pas de logo). */
export function initialeMarque(marque) {
  return [...String((marque || MARQUE_NEUTRE).nom || '?').trim()][0]?.toUpperCase() || '?';
}

const echapperXml = (t) => t.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]);

/** Icône de page sans logo : carré arrondi à la couleur de marque avec l'initiale (adresse data: SVG, aucun fichier). */
export function iconeInitiale(marque) {
  const m = marque || MARQUE_NEUTRE;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="${m.couleur}"/>`
    + `<text x="32" y="44" font-family="Arial, sans-serif" font-size="36" font-weight="700" text-anchor="middle" fill="${texteSur(m.couleur)}">${echapperXml(initialeMarque(m))}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/** Manifeste de l'appli installée d'un client (nom et couleurs du client, jamais ceux de Jérôme). `origine` = l'origine de la page (schéma et domaine). */
export function manifesteClient(marque, client, origine) {
  const m = marque || MARQUE_NEUTRE;
  const accueil = `${origine}/#/espace/${client}`;
  return {
    name: m.nom,
    short_name: [...m.nom].slice(0, 12).join(''),
    description: m.nom,
    lang: 'fr',
    start_url: accueil,
    scope: `${origine}/`,
    id: accueil,
    display: 'standalone',
    background_color: FOND_PAGE,
    theme_color: FOND_PAGE,
    // Le logo est une image du stockage dont la taille réelle est inconnue ici : « sizes: any » était faux (Chrome le signalait en console), on ne déclare donc aucune taille. L'icône à l'initiale (SVG, « any » est exact pour un SVG) reste en repli.
    icons: m.logo ? [{ src: m.logo }, { src: iconeInitiale(m), sizes: 'any', type: 'image/svg+xml' }] : [{ src: iconeInitiale(m), sizes: 'any', type: 'image/svg+xml' }],
  };
}
