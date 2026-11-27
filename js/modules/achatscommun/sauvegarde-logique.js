// Code partagé des modules Achats (26/11/2026) : logique de la « Sauvegarde complète des achats » (un .zip avec une table par module). LOGIQUE PURE (aucun import, aucun réseau).
// Chaque module Achats allumé INSCRIT sa table (le même fichier que son propre bouton d'export) ; aucun module n'en importe un autre : chacun reste vendable seul.

/** Jour de Paris au format AAAA-MM-JJ (comme les noms des fichiers CSV des modules). */
export const jourDeParis = (quand = new Date()) => {
  const p = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', year: 'numeric' }).formatToParts(quand).reduce((a, x) => { a[x.type] = x.value; return a; }, {});
  return `${p.year}-${p.month}-${p.day}`;
};

/** Nom de l'archive : sauvegarde-achats-AAAA-MM-JJ.zip. */
export const nomFichierSauvegarde = (jour) => `sauvegarde-achats-${jour}.zip`;

/** Erreur dont le message se montre tel quel. `tables` : les tables qui n'ont pas pu être lues. */
export class ErreurSauvegarde extends Error {
  constructor(message, tables = []) { super(message); this.name = 'ErreurSauvegarde'; this.tables = tables; this.saisie = true; }
}

/** Liste lisible : « A », « A et B », « A, B et C ». */
export function enumerer(noms) {
  if (noms.length <= 1) return noms.join('');
  return `${noms.slice(0, -1).join(', ')} et ${noms[noms.length - 1]}`;
}

/** Raison montrable d'un échec : le message des erreurs lisibles (couche d'accès, accès non prêt), sinon rien. */
const raisonLisible = (e) => (e && (e.name === 'ErreurBase' || e.saisie === true) && typeof e.message === 'string' && e.message.length <= 300 ? e.message : '');

/** Texte de l'échec : il nomme la ou les tables non lues ; aucun fichier n'est téléchargé. */
export function texteEchec(tables, raison = '') {
  const debut = tables.length > 1
    ? `Sauvegarde non téléchargée : les tables ${enumerer(tables)} n’ont pas pu être lues.`
    : `Sauvegarde non téléchargée : la table ${tables[0]} n’a pas pu être lue.`;
  return `${debut} ${raison || 'Vérifie ta connexion à la base, puis réessaie.'}`;
}

/**
 * Lit toutes les tables inscrites des modules ALLUMÉS (`actifs` : liste d'identifiants ; absent = toutes les inscriptions).
 * `inscriptions` : [{ module, table, fabriquer: async () => ({ nom, contenu, message? }) }].
 * Renvoie { fichiers: [{ nom, contenu }], tables, avertissements } ; lève ErreurSauvegarde si une seule table échoue (jamais une archive incomplète en silence).
 */
export async function rassemblerSauvegarde(inscriptions, { actifs } = {}) {
  const retenues = (inscriptions ?? []).filter((i) => !Array.isArray(actifs) || actifs.includes(i.module));
  if (!retenues.length) throw new ErreurSauvegarde('Aucun module Achats n’est allumé : rien à sauvegarder.');
  const resultats = await Promise.allSettled(retenues.map(async (i) => {
    const f = await i.fabriquer();
    if (!f || typeof f.nom !== 'string' || !f.nom || typeof f.contenu !== 'string') throw new Error('fichier invalide');
    return f;
  }));
  const echecs = retenues.map((i, k) => ({ i, r: resultats[k] })).filter((x) => x.r.status === 'rejected');
  if (echecs.length) {
    const tables = echecs.map((x) => x.i.table);
    throw new ErreurSauvegarde(texteEchec(tables, raisonLisible(echecs[0].r.reason)), tables);
  }
  const lus = resultats.map((r) => r.value);
  return {
    fichiers: lus.map((f) => ({ nom: f.nom, contenu: f.contenu })),
    tables: retenues.map((i) => i.table),
    avertissements: [...new Set(lus.map((f) => f.message).filter(Boolean))],
  };
}
