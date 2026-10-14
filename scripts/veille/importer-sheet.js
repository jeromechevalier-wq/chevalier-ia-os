// Importe le Google Sheet de la veille dans les trois tables du module Veille (veille_sources, veille_contenus, veille_resumes).
// Usage :  node scripts/veille/importer-sheet.js --sources <onglet-chaines.json> --videos <onglet-videos.json> [--ecrire]
// SANS --ecrire : simulation, rien n'est écrit (affiche ce qui serait créé). AVEC --ecrire : écrit dans le CRM de Jérôme (projet
// chevalier-ia-os) avec ses identifiants Google (gcloud auth application-default login), ou dans l'émulateur si FIRESTORE_EMULATOR_HOST est défini.
// Sûr à relancer : chaque document a un identifiant fixe et est écrit en « fusion » (jamais de doublon, jamais de suppression).
// Ne touche qu'aux trois tables veille_*. Les fichiers .json sont les deux onglets du Sheet exportés tels quels (lignes de valeurs).
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { transformer } from './transformer.js';

const PROJET_CRM = 'chevalier-ia-os';
const PROJET_ESSAI = 'demo-chevalier-ia-os';
const arg = (nom) => { const i = process.argv.indexOf(`--${nom}`); return i === -1 ? null : process.argv[i + 1]; };
const ecrire = process.argv.includes('--ecrire');

const fichierSources = arg('sources');
const fichierVideos = arg('videos');
if (!fichierSources || !fichierVideos) {
  console.error('Usage : node scripts/veille/importer-sheet.js --sources <fichier.json> --videos <fichier.json> [--ecrire]');
  process.exit(1);
}

const { sources, contenus, resumes, avertissements } = transformer(JSON.parse(readFileSync(fichierSources, 'utf8')), JSON.parse(readFileSync(fichierVideos, 'utf8')));
console.log(`Sheet lu : ${sources.length} sources, ${contenus.length} contenus, ${resumes.length} résumés.`);
for (const a of avertissements) console.log(`  ⚠ ${a}`);
const etats = contenus.reduce((m, c) => ({ ...m, [c.data.etat]: (m[c.data.etat] ?? 0) + 1 }), {});
console.log(`  États des contenus : ${JSON.stringify(etats)}`);

if (!ecrire) {
  console.log('\nSimulation : rien n\'est écrit. Relancer avec --ecrire pour écrire.');
  process.exit(0);
}

const enEmulateur = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const projetId = enEmulateur ? PROJET_ESSAI : PROJET_CRM;
const exiger = createRequire(new URL('../plateforme/package.json', import.meta.url));
const { initializeApp } = exiger('firebase-admin/app');
const { getFirestore, FieldValue } = exiger('firebase-admin/firestore');
const app = initializeApp({ projectId: projetId });
const db = getFirestore(app);
console.log(`\nÉcriture dans le projet ${projetId}${enEmulateur ? ' (émulateur)' : ' (CRM de Jérôme, données réelles)'}…`);

const tables = [['veille_sources', sources], ['veille_contenus', contenus], ['veille_resumes', resumes]];
for (const [nom, docs] of tables) {
  const batch = db.batch();
  for (const d of docs) batch.set(db.collection(nom).doc(d.id), { ...d.data, importeLe: FieldValue.serverTimestamp() }, { merge: true });
  await batch.commit();
  const total = (await db.collection(nom).count().get()).data().count;
  console.log(`  ${nom} : ${docs.length} documents écrits, ${total} dans la table.`);
}
console.log('Terminé.');
