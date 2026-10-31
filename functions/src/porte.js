// La porte des workflows n8n pour le CRM de Jérôme (base 1) : assemble la logique partagée (functions/partage/porte/, copie de scripts/porte/)
// avec l'accès Firestore, la clé d'API n8n (lue dans Secret Manager au moment d'un appel, comme MCP_JETONS) et un journal sans donnée sensible.
// Ce fichier n'est branché à aucune fonction tant que Jérôme n'a pas préparé le compte de service dédié et déposé la clé n8n (docs/porte-cles.md).
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { creerAdaptateur } from '../partage/porte/adaptateur.js';
import { creerPorte, creerGestionnaireHttp } from '../partage/porte/porte.js';
import { lireSecretJetons } from './securite/secret.js';
import { ligneDeJournal, creerN8nDepuisSecret, creerServiceDevis, DUREE_LIEN_PDF_N8N_MINUTES } from './coeur/porte-commun.js';
import { stockageDuProjet } from './devis/stockage-projet.js';

export { ligneDeJournal, creerN8nDepuisSecret, creerServiceDevis, DUREE_LIEN_PDF_N8N_MINUTES };
export const NOM_SECRET_N8N = 'N8N_API_KEY';

/** La porte du CRM (propriétaire « interne », données à la racine), sans la couche HTTP. `fetchImpl` et `stockage` : réservés aux essais (faux n8n, faux stockage). */
export function creerPorteCrm({ db, lireSecret = lireSecretJetons({ nom: NOM_SECRET_N8N }), urlN8n, fetchImpl, stockage, sortie = (ligne) => process.stdout.write(`${ligne}\n`), maintenant } = {}) {
  if (!db) {
    if (!getApps().length) initializeApp();
    db = getFirestore();
  }
  return creerPorte({
    contexte: 'crm',
    donnees: creerAdaptateur({ db }),
    n8n: creerN8nDepuisSecret({ lireSecret, urlN8n, fetchImpl }),
    modulesActifs: async () => ['veille', 'automatisations', 'devis'],
    services: { devis: creerServiceDevis({ db, stockage: stockage ?? stockageDuProjet }) },
    journal: (entree) => sortie(ligneDeJournal(entree)),
    ...(maintenant ? { maintenant } : {}),
  });
}

/** Passerelle HTTP de la porte pour le CRM. */
export function creerGestionnairePorteCrm(options = {}) {
  return creerGestionnaireHttp(creerPorteCrm(options));
}
