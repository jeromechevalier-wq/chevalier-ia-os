// Forme canonique d'un document, pour les COMPARER (restauration, contrôle de concurrence). Une date vaut la même chose
// qu'elle soit un Date (valeur écrite par la fonction) ou un Timestamp Firestore (valeur relue) : { _t: [secondes, nanosecondes] }.
// Les clés sont triées, les champs `undefined` ignorés, `id` (ajouté à la lecture) n'est jamais comparé.

const estTimestamp = (v) => v && typeof v === 'object' && typeof v.seconds === 'number' && 'nanoseconds' in v;

export function canonique(valeur) {
  if (valeur === undefined) return null;
  if (valeur === null) return null;
  if (valeur instanceof Date) {
    const ms = valeur.getTime();
    return { _t: [Math.floor(ms / 1000), (ms - Math.floor(ms / 1000) * 1000) * 1e6] };
  }
  if (estTimestamp(valeur)) return { _t: [valeur.seconds, valeur.nanoseconds] };
  if (typeof valeur?.toDate === 'function') return canonique(valeur.toDate());
  if (Array.isArray(valeur)) return valeur.map(canonique);
  if (typeof valeur === 'object') {
    const sortie = {};
    for (const cle of Object.keys(valeur).sort()) {
      if (valeur[cle] !== undefined) sortie[cle] = canonique(valeur[cle]);
    }
    return sortie;
  }
  return valeur;
}

/** Document sans son champ `id` (l'identifiant est le nom du document, pas une donnée). */
export function sansId(doc) {
  if (!doc) return null;
  const { id: _id, ...reste } = doc;
  return reste;
}

/** Deux documents (ou null) sont-ils identiques ? */
export function egal(a, b) {
  return JSON.stringify(canonique(sansId(a))) === JSON.stringify(canonique(sansId(b)));
}

/** Copie sans aucun champ `undefined` (Firestore les refuse). */
export function sansUndefined(valeur) {
  if (valeur === undefined) return undefined;
  if (valeur === null || valeur instanceof Date) return valeur;
  if (Array.isArray(valeur)) return valeur.map((x) => (x === undefined ? null : sansUndefined(x)));
  if (typeof valeur === 'object' && !estTimestamp(valeur) && typeof valeur.toDate !== 'function') {
    return Object.fromEntries(Object.entries(valeur).filter(([, v]) => v !== undefined).map(([k, v]) => [k, sansUndefined(v)]));
  }
  return valeur;
}
