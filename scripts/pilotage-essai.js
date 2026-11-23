// Essai à la main du module Pilotage avec les VRAIES données : `node scripts/pilotage-essai.js <fichier-de-réglage.json>` (le fichier reste HORS du dépôt).
// Le fichier a la forme du réglage { groupes, tableau: { titre, tuiles: [...] } } (voir functions/src/pilotage/reglages.js).
// Exécute le MÊME service que la fonction `pilotageLire` (functions/src/pilotage/service.js), sans l'authentification, avec la connexion rangée dans Secret Manager (secret SUPABASE_INDICATEURS du projet chevalier-ia-os),
// lue avec les identifiants Google de la machine (identifiants par défaut, sinon la commande `gcloud` connectée).
// N'AFFICHE QUE : pour chaque tuile, son id, le nombre de lignes, les noms des colonnes et, s'il y a une erreur, une phrase générique (plus le type de panne et son code SQL à 5 caractères, jamais un message de la base).
// Jamais une valeur du secret, jamais une ligne de données. Aucun nom de vue ni de colonne réel dans ce fichier.
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { creerAccesMemoire } from '../functions/src/coeur/donnees.js';
import { creerLecteurSecrets } from '../functions/src/securite/secrets.js';
import { creerConnecteurPostgres, NOM_SECRET_PILOTAGE } from '../functions/src/pilotage/postgres.js';
import { creerServicePilotage } from '../functions/src/pilotage/service.js';
import { ErreurPilotage } from '../functions/src/pilotage/reglages.js';

const PROJET = 'chevalier-ia-os';
const chemin = process.argv[2];
if (!chemin) { console.error('Usage : node scripts/pilotage-essai.js <fichier-de-réglage.json>'); process.exit(2); }

let reglage;
try { reglage = JSON.parse(readFileSync(chemin, 'utf8')); } catch { console.error('Fichier de réglage illisible ou JSON invalide.'); process.exit(2); }

/** Identifiants par défaut de la machine ; à défaut, la commande gcloud (la valeur reste en mémoire, jamais affichée). */
const lecteurParDefaut = creerLecteurSecrets({ projet: PROJET });
async function lireSecret(nom) {
  try { return await lecteurParDefaut(nom); } catch { /* pas d'identifiants par défaut : repli sur gcloud */ }
  return execFileSync('gcloud', ['secrets', 'versions', 'access', 'latest', `--secret=${nom}`, `--project=${PROJET}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
}

const pannes = [];
const donnees = creerAccesMemoire({});
const service = creerServicePilotage({
  donnees: () => donnees,
  connecter: creerConnecteurPostgres({ lireSecret, nomSecret: NOM_SECRET_PILOTAGE }),
  journalErreur: (type, etat) => pannes.push(`${type}${etat ? ` ${etat}` : ''}`),
});

try {
  const r = await service.lire({ email: null, apercu: reglage }); // aperçu : toutes les tuiles du fichier, sans cache
  console.log(`Titre : ${r.titre || '(vide)'} ; ${r.tuiles.length} tuile(s), ${r.erreurs.length} erreur(s).`);
  for (const t of r.tuiles) {
    const erreur = r.erreurs.find((e) => e.id === t.id);
    const colonnes = t.lignes.length ? Object.keys(t.lignes[0]).join(', ') : '-';
    console.log(`- ${t.id} : ${t.lignes.length} ligne(s) ; colonnes : ${colonnes}${erreur ? ` ; ERREUR : ${erreur.message}` : ''}`);
  }
  if (pannes.length) console.log(`Pannes (type, code SQL) : ${[...new Set(pannes)].join(' | ')}`);
  process.exit(0);
} catch (e) {
  if (e instanceof ErreurPilotage) { console.error(`Réglage refusé : ${e.message}`); process.exit(1); }
  console.error('Échec inattendu de l\'essai.');
  process.exit(1);
}
