// Construit le paquet à publier pour un projet autre que le CRM : dist/<projet>/. Usage : node scripts/preparer-hebergement.js plateforme
// Ne publie rien. Le déploiement est fait ensuite par .github/workflows/deploiement-plateforme.yml (à la main).
import { construire, listerFichiers } from './hebergement.js';

const projet = process.argv[2];
if (!projet) {
  console.error('Usage : node scripts/preparer-hebergement.js <projet>   (ex. plateforme)');
  process.exit(2);
}
try {
  const dossier = construire(projet);
  console.log(`Paquet « ${projet} » construit dans ${dossier} (${listerFichiers(dossier).length} fichiers). Rien n'a été publié.`);
} catch (e) {
  console.error(`Échec : ${e.message}`);
  process.exit(1);
}
