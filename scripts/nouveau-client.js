// Outil « nouveau client » (chantier 13). Voir docs/nouveau-client.md. Simule par défaut ; --ecrire pour écrire vraiment.
let outils;
try {
  outils = [await import('./plateforme/commun.js'), await import('./plateforme/nouveau-client.js')];
} catch (e) {
  if (e?.code === 'ERR_MODULE_NOT_FOUND') {
    console.error("✖ Les composants de l'outil ne sont pas installés. Lancez d'abord, une seule fois :\n  npm ci --prefix scripts/plateforme");
    process.exit(1);
  }
  throw e;
}
const [{ creerSortie }, { executerNouveauClient }] = outils;
const { out } = creerSortie();
process.exitCode = await executerNouveauClient(process.argv.slice(2), { out });
