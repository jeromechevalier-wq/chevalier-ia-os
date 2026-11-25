// À importer en tête d'un test du serveur : `import './_fiche-essai.js';` (chantier 0, 25/11/2026).
// Branche en mémoire la fiche reglages_maison/maison des essais (FICHE_ESSAI : le comportement d'avant le chantier 0) sur le serveur de Jérôme
// (functions/src) et sur sa copie de la plateforme (functions-plateforme/serveur/src, créée par scripts/preparer-fonctions.js).
// Sans elle, le serveur refuse tout (fiche absente = refus) : c'est voulu en production, et vérifié par reglages-maison.test.js.
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { brancherFicheEssai, FICHE_ESSAI } from './_reglages-maison-essai.js';

const COPIES = ['../functions/src/securite/reglages-maison.js', '../functions-plateforme/serveur/src/securite/reglages-maison.js'];
for (const chemin of COPIES) {
  if (existsSync(fileURLToPath(new URL(chemin, import.meta.url)))) await brancherFicheEssai(FICHE_ESSAI, chemin);
}
