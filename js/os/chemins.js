// Chemin de base des données d'un module (chantier 2 de la plateforme clients).
// Le CRM de Jérôme garde la racine ('' : crm_personnes, projets_projets…, rien ne change). Un module installé chez un client
// écrit sous `clients/<client>/` (clients/<client>/crm_personnes…). Les plans d'écriture (logique.js, partagés avec le serveur MCP)
// gardent leurs noms de collection « nus » : le préfixe n'est ajouté qu'au moment de parler à Firestore, dans donnees.js.
// Ce fichier n'importe rien (pas de Firebase) : il se teste seul.

const SEGMENT = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

/** Nettoie et vérifie un chemin de base : '' (racine) ou un nombre PAIR de segments (un chemin de document, ex. clients/acme). */
export function normaliserBase(base = '') {
  const segments = String(base ?? '').split('/').filter((s) => s !== '');
  if (!segments.length) return '';
  if (segments.length % 2 !== 0 || !segments.every((s) => SEGMENT.test(s))) {
    throw new Error(`Chemin de base invalide : « ${base} » (attendu : vide, ou clients/<client>)`);
  }
  return segments.join('/');
}

/** Chemin de base d'un module client : clients/<client>. */
export function cheminBaseClient(client) {
  if (typeof client !== 'string' || !SEGMENT.test(client)) throw new Error(`Identifiant de client invalide : « ${client} »`);
  return `clients/${client}`;
}

/** Chemin complet d'une collection : '' + crm_personnes -> crm_personnes ; clients/acme + crm_personnes -> clients/acme/crm_personnes. */
export function cheminCollection(base, nom) {
  const b = normaliserBase(base);
  return b ? `${b}/${nom}` : nom;
}
