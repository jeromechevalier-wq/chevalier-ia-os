// Import des contacts de prospection d'Ingrid dans son espace client. Simule par défaut ; --ecrire pour écrire vraiment.
// Aucune donnée personnelle dans ce fichier : les contacts sont lus dans le JSON donné avec --fichier. Voir scripts/plateforme/importer-contacts.js.
let outils;
try {
  outils = [await import('./plateforme/commun.js'), await import('./plateforme/importer-contacts.js')];
} catch (e) {
  if (e?.code === 'ERR_MODULE_NOT_FOUND') {
    console.error("✖ Les composants de l'outil ne sont pas installés. Lancez d'abord, une seule fois :\n  npm ci --prefix scripts/plateforme");
    process.exit(1);
  }
  throw e;
}
const [{ creerSortie }, { executerImport }] = outils;
const { out } = creerSortie();
process.exitCode = await executerImport(process.argv.slice(2), { out });
