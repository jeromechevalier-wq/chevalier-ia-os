// Règles pures de l'écran « Fréquentation du site » (14/11/2026) : aucune dépendance à Firebase ni au DOM, donc importables par les tests Node.
// Les chiffres sont mesurés par Plausible Analytics (sans cookies) et AFFICHÉS tels quels : le tableau de bord public de Plausible est montré dans l'écran (iframe),
// rien n'est copié ni recalculé ici (l'API de statistiques de Plausible demande l'offre Business). Le LIEN DE PARTAGE n'est jamais écrit dans le dépôt (public) :
// Jérôme le colle dans l'écran, il est gardé dans ses réglages (crm_parametres/frequentation_site, champ `lien`).

/** Document de réglage qui garde le lien de partage (un seul champ : `lien`). */
export const DOCUMENT_LIEN = Object.freeze({ collection: 'crm_parametres', id: 'frequentation_site' });
/** Le seul hôte accepté : un lien d'un autre site ne serait jamais mis dans un cadre de l'écran. */
export const HOTE_PLAUSIBLE = 'plausible.io';
/** Délai (ms) au bout duquel un cadre qui ne répond pas est présenté comme bloqué. */
export const DELAI_CADRE_MS = 10000;
/** Les trois clics de contact du site, tels que le site les envoie à Plausible (objectifs à créer dans Plausible). */
export const OBJECTIFS_CONTACT = Object.freeze(['Contact formulaire', 'Contact téléphone', 'Contact WhatsApp']);

export const MESSAGES = Object.freeze({
  vide: 'Aucun lien enregistré.',
  inconnu: 'Ce lien n’est pas un lien de partage Plausible. Il doit commencer par https://plausible.io/share/ (Plausible : Paramètres du site > Liens partagés).',
  illisible: 'Ce lien n’est pas une adresse web valide. Copie-le en entier depuis Plausible.',
});

/**
 * Vérifie le lien collé par Jérôme. Renvoie { ok: true, lien } (adresse nettoyée, sans `embed` ni `theme`) ou { ok: false, message }.
 * Seul `https://plausible.io/share/<site>` est accepté (avec son `auth` éventuel) ; `http://` est refusé, les autres paramètres sont retirés.
 */
export function verifierLien(texte) {
  const brut = String(texte ?? '').trim();
  if (!brut) return { ok: false, message: MESSAGES.vide };
  let u;
  try { u = new URL(brut); } catch { return { ok: false, message: MESSAGES.illisible }; }
  if (u.protocol !== 'https:' || u.hostname !== HOTE_PLAUSIBLE || u.port || u.username || u.password || !/^\/share\/[^/]+\/?$/.test(u.pathname)) return { ok: false, message: MESSAGES.inconnu };
  const propre = new URL(`https://${HOTE_PLAUSIBLE}${u.pathname.replace(/\/$/, '')}`);
  const auth = u.searchParams.get('auth');
  if (auth) propre.searchParams.set('auth', auth);
  return { ok: true, lien: propre.href };
}

/** Adresse du cadre : le lien enregistré + `embed=true` (page sans l'habillage de Plausible) et le thème de l'écran. Chaîne vide si le lien n'est pas valable. */
export function adresseCadre(lien, theme = 'light') {
  const v = verifierLien(lien);
  if (!v.ok) return '';
  const u = new URL(v.lien);
  u.searchParams.set('embed', 'true');
  u.searchParams.set('theme', theme === 'dark' ? 'dark' : 'light');
  return u.href;
}

/** Lien à ouvrir dans un nouvel onglet : le lien enregistré tel quel (valable), sinon chaîne vide. */
export const adresseOuverture = (lien) => { const v = verifierLien(lien); return v.ok ? v.lien : ''; };

/** Lien lu dans le document de réglage (absent, vide ou invalide = chaîne vide). */
export const lienDepuisDocument = (d) => { const v = verifierLien(d?.lien); return v.ok ? v.lien : ''; };

/** Ce que montre l'écran : 'chargement' (lecture du lien en cours), 'erreur' (lecture impossible), 'vide' (aucun lien), 'cadre' (lien enregistré). */
export function etatEcran({ lecture, lien }) {
  if (lecture === 'chargement') return 'chargement';
  if (lecture === 'erreur') return 'erreur';
  return lien ? 'cadre' : 'vide';
}
