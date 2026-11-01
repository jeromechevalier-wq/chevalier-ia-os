// Outil « données de démonstration » : remplit un client de la plateforme de données fictives. Voir docs/nouveau-client.md.
// Simule par défaut ; --ecrire pour écrire vraiment ; --retirer pour enlever les données de démonstration.
let outils;
try {
  outils = [await import('./plateforme/commun.js'), await import('./plateforme/donnees-demo.js')];
} catch (e) {
  if (e?.code === 'ERR_MODULE_NOT_FOUND') {
    console.error("✖ Les composants de l'outil ne sont pas installés. Lancez d'abord, une seule fois :\n  npm ci --prefix scripts/plateforme");
    process.exit(1);
  }
  throw e;
}
const [{ creerSortie }, { executerDonneesDemo, lecteurClavier }] = outils;
const { out } = creerSortie();
process.exitCode = await executerDonneesDemo(process.argv.slice(2), { out, lireLigne: lecteurClavier() });
