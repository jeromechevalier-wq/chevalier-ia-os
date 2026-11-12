// Fige (ou re-fige) les listes tools/list de référence : tests/fixtures/tools-list-<cas>.json.
// À lancer SEULEMENT quand une description ou un schéma d'un profil autre qu'assistant-devis change volontairement :
//   node tests/outils/figer-tools-list.js
// Les fichiers ne contiennent que des textes d'outils (aucune donnée). L'octet par octet dépend des versions figées de @modelcontextprotocol/sdk (1.32.0) et de zod (4.6.7).
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CAS_FIGES, listerOutils, texteFige } from './lister-outils.js';

const dossier = fileURLToPath(new URL('../fixtures/', import.meta.url));
mkdirSync(dossier, { recursive: true });
for (const [cas, params] of Object.entries(CAS_FIGES)) {
  const { tools } = await listerOutils(params);
  writeFileSync(`${dossier}tools-list-${cas}.json`, texteFige(tools));
  console.log(`tools-list-${cas}.json : ${tools.length} outils`);
}
