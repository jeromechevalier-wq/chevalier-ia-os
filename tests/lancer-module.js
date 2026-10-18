// `npm run test:module <nom>` : les tests d'un seul module (tests/<nom>*.test.js et tests/e2e/<nom>*.spec.js), format ordinateur, sur des émulateurs à part.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const nom = process.argv[2];
if (!nom) { console.error('Usage : npm run test:module <nom>  (ex. : projets, liens-documents, veille)'); process.exit(2); }
const r = spawnSync(process.execPath, [fileURLToPath(new URL('./lancer-tout.js', import.meta.url)), '--module', nom], { stdio: 'inherit' });
process.exit(r.status ?? 1);
