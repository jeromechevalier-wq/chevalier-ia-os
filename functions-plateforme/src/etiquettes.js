// Association workflow → client par ÉTIQUETTE n8n : « client-<identifiant> » (ex. client-audrey).
// Garde-fous (décision de Jérôme) :
//  - sans étiquette de client : le workflow n'est JAMAIS copié ;
//  - étiquette d'un client inconnu, ou d'un client sans le module « journal » : workflow ignoré et signalé ;
//  - deux étiquettes de client sur un même workflow : refusé et signalé (pour aucun des deux clients) ;
//  - étiquette mal formée : ignoré et signalé.
// Un nom d'étiquette n8n fait 24 caractères au plus : « client- » en prend 7, donc l'identifiant d'un client qui veut ce module
// tient en 17 caractères au plus (les identifiants de clients vont jusqu'à 40 : voir docs/journal-activite-workflows.md).

export const PREFIXE_ETIQUETTE = 'client-';
export const LONGUEUR_MAX_ETIQUETTE_N8N = 24;
export const LONGUEUR_MAX_IDENTIFIANT_JOURNAL = LONGUEUR_MAX_ETIQUETTE_N8N - PREFIXE_ETIQUETTE.length; // 17
export const MOTIF_IDENTIFIANT_CLIENT = /^[a-z0-9][a-z0-9_-]{0,39}$/; // même règle que l'outil « nouveau client »
export const MOTIF_ID_N8N = /^[A-Za-z0-9_-]{1,64}$/; // identifiants n8n acceptés comme noms de documents

/** Nom d'étiquette attendu pour un client. */
export const etiquetteDuClient = (client) => `${PREFIXE_ETIQUETTE}${client}`;

/**
 * Range les workflows par client.
 * `connus` : identifiants de tous les clients qui existent ; `actifs` : ceux qui ont le module « journal » actif.
 * Renvoie { parClient: Map(client → [workflow]), signalements: [{ workflowId, raison, etiquettes }] }.
 * Raisons : 'deux-clients', 'client-inconnu', 'sans-module', 'etiquette-invalide', 'identifiant-invalide'.
 */
export function classer(workflows, { connus, actifs }) {
  const parClient = new Map();
  const signalements = [];
  for (const w of workflows) {
    if (!MOTIF_ID_N8N.test(String(w.id))) { signalements.push({ workflowId: String(w.id).slice(0, 64), raison: 'identifiant-invalide', etiquettes: [] }); continue; }
    const etiquettes = w.tags.filter((t) => t.toLowerCase().startsWith(PREFIXE_ETIQUETTE));
    if (etiquettes.length === 0) continue; // jamais copié, pas même signalé : c'est le cas normal d'un workflow de Jérôme
    if (etiquettes.length > 1) { signalements.push({ workflowId: w.id, raison: 'deux-clients', etiquettes }); continue; }
    const id = etiquettes[0].slice(PREFIXE_ETIQUETTE.length).toLowerCase();
    if (!MOTIF_IDENTIFIANT_CLIENT.test(id)) { signalements.push({ workflowId: w.id, raison: 'etiquette-invalide', etiquettes }); continue; }
    if (!connus.has(id)) { signalements.push({ workflowId: w.id, raison: 'client-inconnu', etiquettes }); continue; }
    if (!actifs.has(id)) { signalements.push({ workflowId: w.id, raison: 'sans-module', etiquettes }); continue; }
    if (!parClient.has(id)) parClient.set(id, []);
    parClient.get(id).push(w);
  }
  return { parClient, signalements };
}
