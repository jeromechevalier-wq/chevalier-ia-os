// Noms des tables des objectifs de l'Accueil (indicateurs). Fichier pur : ni Firebase ni écran, donc testable sans navigateur.
// Renommage décidé le 22/10/2026 : os_objectifs -> os_kpi (définitions, cibles) et os_objectifs_saisies -> os_kpi_saisies (saisies à la main).
// Les données de Jérôme sont COPIÉES de jour par scripts/migrer-kpi.js (jamais supprimées). Interrupteur allumé le 23/10/2026 : les nouvelles tables sont lues et écrites ; les anciennes ne sont jamais supprimées.

/** Interrupteur du module : false = les anciennes tables, comme avant. Allumé le 23/10/2026, APRÈS la copie des données de Jérôme. */
export const TABLE_KPI_ACTIVE = true;

export const TABLES_ANCIENNES = Object.freeze({ definitions: 'os_objectifs', saisies: 'os_objectifs_saisies' });
export const TABLES_KPI = Object.freeze({ definitions: 'os_kpi', saisies: 'os_kpi_saisies' });

/**
 * La SEULE fonction qui donne les noms de collections.
 * - interrupteur éteint : lecture et écriture dans les anciennes tables.
 * - interrupteur allumé : écriture UNIQUEMENT dans les nouvelles ; lecture dans les nouvelles, sauf `repli[cle]` (la nouvelle table était vide
 *   au montage : on lit l'ancienne en attendant la copie).
 * `cle` : 'definitions' ou 'saisies'.
 */
export function nomCollection(cle, { actif = TABLE_KPI_ACTIVE, ecriture = false, repli = {} } = {}) {
  if (!(cle in TABLES_KPI)) throw new Error(`Table inconnue : ${cle}`);
  if (!actif) return TABLES_ANCIENNES[cle];
  if (!ecriture && repli[cle]) return TABLES_ANCIENNES[cle];
  return TABLES_KPI[cle];
}

/**
 * Au montage seulement : faut-il lire l'ancienne table ? Oui si l'interrupteur est allumé, que la nouvelle est vide (réponse du serveur)
 * ET que l'ancienne n'est PAS vide (`ancienneVide === false`, vérifié par le serveur). Les deux vides (espace neuf) : on reste sur la nouvelle.
 * Si on ne sait pas (`ancienneVide` absent), on reste sur la nouvelle.
 */
export function faut_repli({ actif = TABLE_KPI_ACTIVE, nouvelleVide, ancienneVide, deja = false }) {
  return Boolean(actif && !deja && nouvelleVide && ancienneVide === false);
}
