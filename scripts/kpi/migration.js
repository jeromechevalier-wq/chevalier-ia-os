// Copie des tables des objectifs de l'Accueil vers les tables « KPI » (décision de Jérôme du 22/10/2026).
//   os_objectifs         -> os_kpi          (définitions, cibles ; ajoute module: 'os' et accueil: true s'ils manquent)
//   os_objectifs_saisies -> os_kpi_saisies  (saisies à la main ; copie telle quelle)
// Logique pure : le stockage et l'affichage sont injectés, donc tout se teste en mémoire (tests/kpi-migration.test.js). Le point d'entrée est scripts/migrer-kpi.js.
//
// Garde-fous : simulation par défaut (rien n'est écrit sans --ecrire) ; les anciennes tables ne sont JAMAIS modifiées ni supprimées (le stockage
// n'a même pas d'opération pour cela) ; rejouer ne crée pas de doublon et ne réécrit pas un document déjà identique ; un document de la
// nouvelle table qui DIFFÈRE est signalé et laissé tel quel, sauf --ecraser ; la sortie ne contient que des nombres et des identifiants
// (jamais un libellé, une cible ou une valeur).

/** Les copies à faire : de, vers, et ce qu'on ajoute aux documents s'il manque. */
export const COPIES = Object.freeze([
  Object.freeze({ de: 'os_objectifs', vers: 'os_kpi', ajouts: Object.freeze({ module: 'os', accueil: true }) }),
  Object.freeze({ de: 'os_objectifs_saisies', vers: 'os_kpi_saisies', ajouts: Object.freeze({}) }),
]);

const OPTIONS = ['ecrire', 'ecraser'];

/** argv (sans « node » ni le script) -> { options } ou { erreur }. Option inconnue = erreur (jamais ignorée en silence). */
export function lireArguments(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i++) {
    const m = /^--([a-z]+)$/.exec(argv[i]);
    if (!m) return { erreur: `Argument inattendu : « ${argv[i]} ».` };
    if (m[1] === 'projet') {
      if (argv[i + 1] !== 'crm') return { erreur: 'Seule la base 1 est concernée : --projet crm (ou sans cette option).' };
      i++;
      continue;
    }
    if (!OPTIONS.includes(m[1])) return { erreur: `Option inconnue : --${m[1]}.` };
    options[m[1]] = true;
  }
  if (options.ecraser && !options.ecrire) return { erreur: "--ecraser n'a de sens qu'avec --ecrire." };
  return { options };
}

const estHorodatage = (x) => x && typeof x === 'object' && typeof x.toMillis === 'function';

/** Égalité profonde (dates et horodatages Firestore comparés par leur instant). */
export function egal(a, b) {
  if (a === b) return true;
  if (estHorodatage(a) && estHorodatage(b)) return a.toMillis() === b.toMillis();
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => egal(x, b[i]));
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const ca = Object.keys(a);
    const cb = Object.keys(b);
    return ca.length === cb.length && ca.every((k) => k in b && egal(a[k], b[k]));
  }
  return false;
}

/** Le document tel qu'il doit être dans la nouvelle table : mêmes champs, plus les ajouts SEULEMENT s'ils manquent. */
export function documentCible(donnees, ajouts) {
  const cible = { ...donnees };
  for (const [champ, valeur] of Object.entries(ajouts)) if (cible[champ] === undefined) cible[champ] = valeur;
  return cible;
}

/**
 * Exécute la copie. `ctx` : { store, sortie(ligne) }.
 * `store` : { lire(collection) -> [{ id, data }], lireUn(collection, id) -> data|null, ecrire(collection, id, data, { ecraser }) }.
 * Renvoie le code de sortie : 0 = tout va bien, 1 = erreur d'arguments ou documents divergents refusés.
 */
export async function executer(argv, ctx) {
  const { store, sortie } = ctx;
  const lu = lireArguments(argv);
  if (lu.erreur) { sortie(`✖ ${lu.erreur}`); return 1; }
  const { ecrire = false, ecraser = false } = lu.options;
  sortie(ecrire
    ? "▶ ÉCRITURE : les tables os_kpi et os_kpi_saisies vont être complétées (les anciennes tables ne sont pas touchées)."
    : "▶ SIMULATION : rien n'est écrit. Ajoute --ecrire pour copier.");
  let divergents = 0;
  for (const { de, vers, ajouts } of COPIES) {
    const anciens = await store.lire(de);
    let aCopier = 0; let identiques = 0; let ecrases = 0; const refuses = [];
    for (const { id, data } of anciens) {
      const cible = documentCible(data, ajouts);
      const present = await store.lireUn(vers, id);
      if (present === null || present === undefined) {
        aCopier++;
        if (ecrire) await store.ecrire(vers, id, cible, { ecraser: false });
      } else if (egal(present, cible)) {
        identiques++;
      } else if (ecraser) {
        ecrases++;
        if (ecrire) await store.ecrire(vers, id, cible, { ecraser: true });
      } else {
        refuses.push(id);
      }
    }
    divergents += refuses.length;
    const verbe = ecrire ? 'copiés' : 'à copier';
    sortie(`${de} -> ${vers} : ${anciens.length} documents dans l'ancienne table, ${aCopier} ${verbe}, ${identiques} déjà identiques${ecraser ? `, ${ecrases} ${ecrire ? 'écrasés' : 'à écraser'}` : ''}, ${refuses.length} différents (refusés).`);
    if (refuses.length) sortie(`  ✖ Identifiants différents dans ${vers}, laissés tels quels (utilise --ecraser pour les remplacer) : ${refuses.join(', ')}`);
  }
  if (divergents) { sortie(`✖ ${divergents} document(s) de la nouvelle table diffèrent de l'ancienne : rien n'a été écrasé.`); return 1; }
  sortie(ecrire ? '✔ Terminé. Tu peux relancer sans --ecrire : tout doit être « déjà identique ».' : '✔ Simulation terminée.');
  return 0;
}
