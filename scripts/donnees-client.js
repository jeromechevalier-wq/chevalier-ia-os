// Outil de remise et de suppression des données d'un client (chantier 13). Voir docs/nouveau-client.md.
// La suppression simule par défaut ; elle exige une sauvegarde faite juste avant et la saisie de l'identifiant du client.
let outils;
try {
  outils = [await import('./plateforme/commun.js'), await import('./plateforme/donnees-client.js')];
} catch (e) {
  if (e?.code === 'ERR_MODULE_NOT_FOUND') {
    console.error("✖ Les composants de l'outil ne sont pas installés. Lancez d'abord, une seule fois :\n  npm ci --prefix scripts/plateforme");
    process.exit(1);
  }
  throw e;
}
const [{ creerSortie }, { executerDonneesClient, lecteurClavier }] = outils;
const { out } = creerSortie();
process.exitCode = await executerDonneesClient(process.argv.slice(2), { out, lireLigne: lecteurClavier() });
