// « Portail devis seul » (étape 1) : un MODE D'AFFICHAGE de la coque, pas un module.
// Même compte, mêmes données, mêmes écrans ; seule l'adresse change (#/portail-devis chez Jérôme, #/espace/<client>/portail-devis chez un client),
// et le menu, le « + » et la recherche se limitent aux modules du portail. Ce fichier est pur (aucun import, testable seul) :
// le portail est un préfixe de route lu dans le navigateur, il ne donne aucun droit (les règles Firestore décident, inchangées).
// Menu du portail devis (décision de Jérôme du 09/11/2026) : Devis · Clients · Catalogue · Relances · Statistiques, puis « Espace complet ».
// « Clients » est l'écran Personnes du socle commun (crm/personnes) sous un autre mot, dans le portail seulement (`supplements`) ; le menu normal garde « Personnes ».
export const PORTAILS = Object.freeze({
  'portail-devis': Object.freeze({
    modules: Object.freeze(['devis']),
    accueil: 'devis/liste',
    menu: Object.freeze(['devis/liste', 'crm/personnes', 'devis/bordereau', 'devis/relances', 'devis/statistiques']),
    supplements: Object.freeze([Object.freeze({ chemin: 'crm/personnes', libelle: 'Clients', icone: 'user' })]), // entrées du menu qui ne sont pas des écrans d'un module du portail
    libelleRetour: 'Espace complet',
    actions: Object.freeze([Object.freeze({ id: 'exporter-devis', libelle: 'Exporter mes données', icone: 'download' })]), // règle « chaque module a son export » : même fonction que Réglages > Devis (exporterDevis), dans le menu du compte (clic sur le nom), avant « Espace complet »
  }),
});

const ID_FICHE = /^[A-Za-z0-9_-]{1,128}$/;
/**
 * Écrans du socle commun (fiches Personnes et Organisations) que le portail sert TOUJOURS, même sans le module Affaires : { vue: 'personnes' | 'organisations', id: string | null } ou null.
 * L'identifiant d'une fiche doit être de la forme d'un identifiant Firestore (jamais un morceau d'adresse tapé librement) ; sinon null (« Page introuvable »).
 */
export function ecranSocleDeRoute(segments) {
  const [prefixe, vue, id, ...reste] = segments ?? [];
  if (prefixe !== 'crm' || !['personnes', 'organisations'].includes(vue) || reste.length) return null;
  if (id !== undefined && !ID_FICHE.test(id)) return null;
  return { vue, id: id ?? null };
}

const segs = (route) => String(route ?? '').split('/').filter(Boolean);

/** Route SANS préfixe d'espace -> { id, reste } si son premier segment est l'id d'un portail (minuscules exactes), sinon null. */
export function portailDeRoute(route) {
  const [premier, ...reste] = segs(route);
  return Object.hasOwn(PORTAILS, premier) ? { id: premier, reste: reste.join('/') } : null;
}

/** Modules du portail réellement actifs (intersection ; vide si Devis n'est pas actif). */
export function modulesDuPortail(id, actifs) {
  const p = PORTAILS[id];
  return p ? p.modules.filter((m) => (actifs ?? []).includes(m)) : [];
}

/**
 * Clé d'entrée d'une route COMPLÈTE (avec « espace/<client> » s'il y en a un) : '' (racine), 'portail-devis', 'espace/<client>', 'espace/<client>/portail-devis'.
 * Changer de clé recharge la page ; changer d'écran dans une même entrée ne la recharge pas.
 */
export function cleEntreeDe(route) {
  const s = segs(route);
  if (s[0] === 'espace') {
    const base = ['espace', ...(s[1] ? [s[1]] : [])].join('/').toLowerCase();
    return s[1] && Object.hasOwn(PORTAILS, s[2]) ? `${base}/${s[2]}` : base;
  }
  return Object.hasOwn(PORTAILS, s[0]) ? s[0] : '';
}
