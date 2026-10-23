// Copie des tables des objectifs de l'Accueil vers les tables KPI (os_objectifs -> os_kpi, os_objectifs_saisies -> os_kpi_saisies).
//   node scripts/migrer-kpi.js                       simulation : affiche le nombre de documents, n'écrit rien
//   node scripts/migrer-kpi.js --ecrire              copie (les anciennes tables ne sont jamais touchées ni supprimées)
//   node scripts/migrer-kpi.js --ecrire --ecraser    remplace aussi les documents différents de la nouvelle table
// Lancé À LA MAIN par Jérôme avec ses identifiants Google (gcloud auth application-default login), comme scripts/cles.js. Voir scripts/kpi/migration.js.
// Dans l'émulateur (FIRESTORE_EMULATOR_HOST défini) : projet de test, aucune donnée réelle.
import { createRequire } from 'node:module';
import { PROJETS, PROJET_ESSAI } from './porte/outil.js';
import { executer } from './kpi/migration.js';

const exiger = createRequire(new URL('./plateforme/package.json', import.meta.url));
let admin;
try {
  admin = { app: exiger('firebase-admin/app'), firestore: exiger('firebase-admin/firestore') };
} catch {
  console.error("✖ Les composants de l'outil ne sont pas installés. Lancez d'abord, une seule fois :\n  npm ci --prefix scripts/plateforme");
  process.exit(1);
}

const projetId = process.env.FIRESTORE_EMULATOR_HOST ? PROJET_ESSAI : PROJETS.crm.id;
const db = admin.firestore.getFirestore(admin.app.initializeApp({ projectId: projetId }));
const store = {
  async lire(collection) { return (await db.collection(collection).get()).docs.map((d) => ({ id: d.id, data: d.data() })); },
  async lireUn(collection, id) { const d = await db.collection(collection).doc(id).get(); return d.exists ? d.data() : null; },
  // Sans --ecraser : create() échoue si le document existe déjà (jamais d'écrasement par accident).
  async ecrire(collection, id, donnees, { ecraser }) {
    const ref = db.collection(collection).doc(id);
    if (ecraser) await ref.set(donnees); else await ref.create(donnees);
  },
};
process.exitCode = await executer(process.argv.slice(2), { store, sortie: console.log });
process.exit();
