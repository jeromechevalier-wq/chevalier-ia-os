// Décide du niveau de test d'une PR : rapide, docs, plateforme ou complet.
// Appelé par le job « Niveau de test » de .github/workflows/tests.yml (lit des variables d'environnement, écrit $GITHUB_OUTPUT).
// La décision est une fonction pure (decider) pour être testée hors réseau : tests/actions-temps.test.js.
// Mêmes règles qu'avant (19/10, 21/10 et 25/10/2026) + la voie « docs » (31/10/2026) : une PR qui ne change QUE de la documentation
// ne lance ni navigateur ni émulateurs, seulement les 7 fichiers de test qui lisent docs/ (npm run test:docs, environ 1 à 2 minutes).
import { appendFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Fichiers sensibles : règles de sécurité, configuration Firebase, workflows GitHub, outillage des tests (pas les fichiers de test eux-mêmes).
export const SENSIBLES = /^(firestore\.rules$|storage\.rules$|firebase[^/]*\.json$|\.github\/workflows\/|tests\/(lancer-tout\.js|niveau-de-test\.js|ports\.js|playwright\.config\.js|package-lock\.json|e2e\/outils\.js|e2e\/serveur\.js)$)/;
// Documentation seule : non publiée par Hosting (hosting.ignore de firebase.json) ou hors de tout déploiement.
export const DOCS = /^(docs\/|wiki\/|README\.md$|CLAUDE\.md$|PROMPT-CONSTRUCTION\.md$|\.github\/A-FAIRE\.md$)/;
const SPEC = /^tests\/e2e\/[A-Za-z0-9._-]+\.spec\.js$/;

export function decider({ evenement, completDemande, etiquettes = '', fichiers = [], fichiersAjoutesOuModifies = [] }) {
  let complet = false;
  if (evenement === 'workflow_dispatch') {
    complet = String(completDemande) === 'true';
  } else {
    if (`,${etiquettes},`.includes(',tests-complets,')) complet = true;
    if (fichiers.some((f) => SENSIBLES.test(f))) complet = true;
  }
  let plateforme = '';
  if (evenement === 'pull_request' && !complet && fichiers.some((f) => f.startsWith('functions-plateforme/'))) plateforme = 'true';
  let specs = '';
  if (evenement === 'pull_request') {
    specs = fichiersAjoutesOuModifies.filter((f) => SPEC.test(f)).map((f) => `${f.replace(/^tests\//, '')} `).join('');
  }
  const docs = evenement === 'pull_request' && !complet && fichiers.length > 0 && fichiers.every((f) => DOCS.test(f));
  return { complet, plateforme, specs, docs };
}

function git(...args) {
  try {
    return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).split('\n').filter(Boolean);
  } catch (e) {
    console.error('git a échoué :', e.message);
    return [];
  }
}

function main() {
  const { EVENEMENT, COMPLET_DEMANDE, ETIQUETTES = '', BASE = '', GITHUB_OUTPUT } = process.env;
  const pr = EVENEMENT === 'pull_request' && BASE;
  const fichiers = pr ? git('diff', '--name-only', BASE, 'HEAD') : [];
  const ajoutes = pr ? git('diff', '--name-only', '--diff-filter=AM', BASE, 'HEAD') : [];
  const r = decider({ evenement: EVENEMENT, completDemande: COMPLET_DEMANDE, etiquettes: ETIQUETTES, fichiers, fichiersAjoutesOuModifies: ajoutes });
  const sortie = { complet: String(r.complet), plateforme: r.plateforme, specs: r.specs, docs: String(r.docs) };
  const niveau = r.complet ? 'complet' : r.docs ? 'docs' : 'rapide';
  console.log(`Niveau : ${niveau} (${fichiers.length} fichier(s) changé(s)). Parcours de la PR : ${r.specs.trim() || 'aucun'}.`);
  if (r.complet) {
    if (`,${ETIQUETTES},`.includes(',tests-complets,')) console.log('Étiquette tests-complets : palier complet.');
    const sensibles = fichiers.filter((f) => SENSIBLES.test(f));
    if (sensibles.length) console.log(`Fichiers sensibles touchés : palier complet.\n${sensibles.join('\n')}`);
  }
  const lignes = Object.entries(sortie).map(([k, v]) => `${k}=${v}`).join('\n') + '\n';
  if (GITHUB_OUTPUT) appendFileSync(GITHUB_OUTPUT, lignes); else process.stdout.write(lignes);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
