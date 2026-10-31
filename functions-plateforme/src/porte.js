// La porte des workflows n8n pour les espaces clients (base 2, projet chevalier-ia-app) : la MÊME logique que celle du CRM de Jérôme (serveur/partage/porte/, copie de scripts/porte/),
// avec le contexte « plateforme » : le client vient de la CLÉ seulement (jamais d'un paramètre), les écritures vont sous clients/<client>/, et un workflow n'est accepté que s'il est
// étiqueté et nommé « client-<client> ». Les clés sont retrouvées par leur empreinte dans la collection racine `plateforme_cles` (aucune règle Firestore : le serveur seul y accède).
// La clé d'API n8n est lue dans Secret Manager (N8N_API_KEY) au moment d'un appel. Voir docs/porte-cles.md.
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { creerAdaptateur } from '../serveur/partage/porte/adaptateur.js';
import { creerPorte, creerGestionnaireHttp, MODULES_DE_LA_PORTE } from '../serveur/partage/porte/porte.js';
import { ligneDeJournal, creerN8nDepuisSecret, creerServiceDevis } from '../serveur/src/coeur/porte-commun.js';
import { creerStockage } from '../serveur/src/devis/stockage.js';
import { normaliserMarque } from '../serveur/partage/marque.js';
import { modulesActifsDuClient } from '../serveur/partage/registre.js';

/** Même bucket que `BUCKET` de index.js (un test vérifie l'égalité des deux textes). */
export const BUCKET_PLATEFORME = 'chevalier-ia-app.firebasestorage.app';

/**
 * Modules que la porte peut servir pour ce client : seulement si sa fiche de marque est active ET si le module est allumé sur sa fiche.
 * Fiche absente ou inactive : liste vide, donc le même refus 403 `module_non_actif` (sans dire pourquoi).
 */
export function creerModulesActifs({ db }) {
  const lire = async (collection, id) => {
    const doc = await db.collection(collection).doc(id).get();
    return doc.exists ? doc.data() : null;
  };
  return async function modulesActifs(client) {
    if (!normaliserMarque(await lire('marques', client))) return [];
    const { actifs } = modulesActifsDuClient(await lire('clients', client));
    return actifs.filter((m) => Object.hasOwn(MODULES_DE_LA_PORTE, m));
  };
}

/** La porte des clients, sans la couche HTTP. `urlN8n`, `fetchImpl`, `stockage`, `sortie` : réservés aux essais (faux n8n, faux stockage). */
export function creerPortePlateforme({ db, lireSecret, urlN8n, fetchImpl, stockage, sortie = (ligne) => process.stdout.write(`${ligne}\n`), maintenant } = {}) {
  if (!db) {
    if (!getApps().length) initializeApp();
    db = getFirestore();
  }
  return creerPorte({
    contexte: 'plateforme',
    donnees: creerAdaptateur({ db }),
    n8n: creerN8nDepuisSecret({ lireSecret, urlN8n, fetchImpl }),
    modulesActifs: creerModulesActifs({ db }),
    services: { devis: creerServiceDevis({ db, stockage: stockage ?? (() => creerStockage({ bucket: getStorage().bucket(BUCKET_PLATEFORME) })) }) },
    journal: (entree) => sortie(ligneDeJournal(entree)),
    ...(maintenant ? { maintenant } : {}),
  });
}

/** Passerelle HTTP de la porte pour les clients. */
export function creerGestionnairePortePlateforme(options = {}) {
  return creerGestionnaireHttp(creerPortePlateforme(options));
}
