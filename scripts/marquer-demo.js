// Outil « marquer un client de démonstration » : pose demo: true sur un client existant. Voir docs/donnees-demo.md.
// Simule par défaut ; --ecrire pour écrire vraiment.
let outils;
try {
  outils = [await import('./plateforme/commun.js'), await import('./plateforme/marquer-demo.js')];
} catch (e) {
  if (e?.code === 'ERR_MODULE_NOT_FOUND') {
    console.error("✖ Les composants de l'outil ne sont pas installés. Lancez d'abord, une seule fois :\n  npm ci --prefix scripts/plateforme");
    process.exit(1);
  }
  throw e;
}
const [{ creerSortie }, { executerMarquerDemo }] = outils;
const { out } = creerSortie();
process.exitCode = await executerMarquerDemo(process.argv.slice(2), { out });
