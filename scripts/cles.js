// Gestion des clés de la porte (workflows n8n -> données des modules). Voir scripts/porte/outil.js pour les commandes et les garde-fous.
//   node scripts/cles.js lister   --projet crm|plateforme [--proprietaire <id>]
//   node scripts/cles.js creer    --projet crm|plateforme --proprietaire <id> [--usage tableaudebord] [--ecrire] [--afficher]
//   node scripts/cles.js revoquer --projet crm|plateforme --proprietaire <id> --cle <identifiant court> [--ecrire] [--forcer]
// Lancé À LA MAIN par Jérôme avec ses identifiants Google (gcloud auth application-default login), comme l'outil « nouveau client ».
// Dans l'émulateur (FIRESTORE_EMULATOR_HOST défini) : projet de test, aucune donnée réelle.
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { executer, PROJETS, PROJET_ESSAI, lireArguments } from './porte/outil.js';
import { TABLE_CLES } from './porte/cles.js';

const exiger = createRequire(new URL('./plateforme/package.json', import.meta.url));
let admin;
try {
  admin = { app: exiger('firebase-admin/app'), firestore: exiger('firebase-admin/firestore') };
} catch {
  console.error("✖ Les composants de l'outil ne sont pas installés. Lancez d'abord, une seule fois :\n  npm ci --prefix scripts/plateforme");
  process.exit(1);
}

const lu = lireArguments(process.argv.slice(2));
const projet = PROJETS[lu.options?.projet];
const enEmulateur = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const projetId = enEmulateur ? PROJET_ESSAI : projet?.id;
if (!projetId) {
  // Les erreurs d'arguments sont dites par executer() ; on lui passe un stockage vide.
  process.exitCode = await executer(process.argv.slice(2), { store: null, sortie: console.log, copier: () => false, maintenant: Date.now });
  process.exit();
}

const db = admin.firestore.getFirestore(admin.app.initializeApp({ projectId: projetId }));
const table = db.collection(TABLE_CLES);
const store = {
  async listerCles(proprietaire) {
    const snap = proprietaire ? await table.where('proprietaire', '==', proprietaire).get() : await table.get();
    return snap.docs.map((d) => ({ ...d.data(), id: d.id }));
  },
  async lireCle(id) { const d = await table.doc(id).get(); return d.exists ? { ...d.data(), id } : null; },
  async ecrireCle(id, donnees) { await table.doc(id).create(donnees); }, // create : échoue si le document existe déjà (jamais d'écrasement)
  async majCle(id, partiel) { await table.doc(id).update(partiel); },
  async clientExiste(id) { return (await db.collection('clients').doc(id).get()).exists; },
};

let erreurIdentifiant = null;
if (lu.options?.projet === 'plateforme') {
  ({ erreurIdentifiant } = await import('./plateforme/commun.js'));
}
const copier = (texte) => spawnSync('pbcopy', { input: texte }).status === 0;
process.exitCode = await executer(process.argv.slice(2), { store, sortie: console.log, copier, maintenant: Date.now, erreurIdentifiant });
process.exit();
