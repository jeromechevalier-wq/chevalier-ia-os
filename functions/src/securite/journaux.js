// Journal sûr : liste blanche de champs, valeurs courtes. Jamais le jeton, l'en-tête d'autorisation, les paramètres
// des outils, des contenus de fiches, des réponses ni des jetons Drive.
const CHAMPS = ['jeton', 'acteur', 'profil', 'methodeMcp', 'outil', 'operationId', 'dureeMs', 'statut', 'code'];

export function journaliser(entree, sortie = (ligne) => process.stdout.write(`${ligne}\n`)) {
  const ligne = { severity: entree.statut >= 500 ? 'ERROR' : 'INFO', message: 'mcp' };
  for (const c of CHAMPS) {
    const v = entree[c];
    if (v === undefined || v === null) continue;
    ligne[c] = typeof v === 'string' ? v.slice(0, 80) : v;
  }
  sortie(JSON.stringify(ligne));
}
