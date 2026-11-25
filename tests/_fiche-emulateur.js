// Écriture de la fiche reglages_maison dans l'émulateur Firestore (chantier 0, 25/11/2026), sans aucune dépendance au code de l'appli :
// sert aux essais du serveur (par _reglages-maison-essai.js) et aux parcours du navigateur (e2e/outils.js, chargé par Playwright).
// Valeur au format REST de Firestore : texte, booléen, nombre, null, liste et objet (y compris listes d'objets : reglages_maison/ecran.personnes).
export function valeur(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(valeur) } };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'object') return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, valeur(x)])) } };
  return { stringValue: String(v) };
}

/** Écrit la fiche dans l'émulateur Firestore (API REST, jeton « owner » de l'émulateur : passe outre les règles). `fiche` null : la supprime. */
export async function semerFicheEmulateur({ projet = process.env.GCLOUD_PROJECT || 'demo-chevalier-ia-os', fiche, document = 'maison', hote = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080' } = {}) {
  const adresse = `http://${hote}/v1/projects/${projet}/databases/(default)/documents/reglages_maison/${document}`;
  const entetes = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };
  const r = fiche === null
    ? await fetch(adresse, { method: 'DELETE', headers: entetes })
    : await fetch(adresse, { method: 'PATCH', headers: entetes, body: JSON.stringify({ fields: Object.fromEntries(Object.entries(fiche).map(([k, v]) => [k, valeur(v)])) }) });
  if (!r.ok) throw new Error(`fiche reglages_maison/${document} : écriture dans l'émulateur refusée (HTTP ${r.status})`);
}
