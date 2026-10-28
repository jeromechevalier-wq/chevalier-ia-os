// Fichiers de l'onglet « Documents » chez un client (projet chevalier-ia-app) : les fonctions appelables `documentDeposer`, `documentLien` et `documentSupprimer`.
// Séparé de index.js pour pouvoir l'essayer sans Cloud Functions (comme devis-pdf.js) : `db` et `stockage` sont injectés. Le travail est dans serveur/src/coeur/documents.js
// (copie de functions/src/coeur/documents.js, le MÊME code que chez Jérôme). On n'importe JAMAIS documents/appel.js (il porte les comptes autorisés de Jérôme) : les contrôles d'accès sont ceux d'ICI.
//  - le client reçu est une CIBLE à vérifier, jamais une confiance : e-mail vérifié, membre de clients/<client>/membres/<e-mail> ;
//  - déposer et supprimer : éditeurs seulement ; lire (documentLien, lien signé de 5 minutes) : éditeurs ET lecteurs ;
//  - UN SEUL refus neutre « Action non autorisée. » (espace inexistant, non-membre, rôle insuffisant, aucun module Affaires ou Projets actif) ;
//  - tout est rangé sous clients/<client>/documents/… et lu depuis clients/<client>/ : un autre client est hors d'atteinte (cheminDocumentAppartientALEspace avant de signer).
import { logger } from 'firebase-functions';
import { creerAccesFirestore, avecBase } from '../serveur/src/coeur/donnees.js';
import { operationDeposer, operationLien, operationSupprimer, versErreurAppel } from '../serveur/src/coeur/documents.js';
import { Refus } from './appels.js';
import { MOTIF_IDENTIFIANT_CLIENT } from './etiquettes.js';
import { emailDe } from './devis.js';

const REFUS_NEUTRE = () => new Refus('permission-denied', 'Action non autorisée.');
const espaceDe = (client) => `clients/${client}/`;
const stockageDe = (s) => (typeof s === 'function' ? s() : s) ?? null;
const accesDe = ({ db, creerDonnees }, client) => (creerDonnees ? creerDonnees(client) : avecBase(creerAccesFirestore({ db }), `clients/${client}`));

/** Contrôle de l'appelant : e-mail vérifié, membre du client reçu avec un des `roles`, au moins un des modules Affaires / Projets actif. Rend { email, client } ou lève le refus neutre. */
export async function controlerMembreDocuments({ db, auth, client, roles }) {
  const email = emailDe(auth);
  if (typeof client !== 'string' || !MOTIF_IDENTIFIANT_CLIENT.test(client)) throw new Refus('invalid-argument', 'Demande invalide.');
  if (client === 'interne') throw REFUS_NEUTRE();
  const membre = await db.doc(`clients/${client}/membres/${email}`).get();
  if (!membre.exists || !roles.includes(membre.get('role'))) throw REFUS_NEUTRE();
  const fiche = await db.doc(`clients/${client}`).get();
  const modules = fiche.exists ? fiche.get('modules') : null;
  if (!fiche.exists || !(modules?.affaires === true || modules?.projets === true)) throw REFUS_NEUTRE();
  return { email, client };
}

const OPERATIONS = {
  deposer: { faire: operationDeposer, roles: ['editeur'] },
  lien: { faire: operationLien, roles: ['editeur', 'lecteur'] },
  supprimer: { faire: operationSupprimer, roles: ['editeur'] },
};

/**
 * `operation` : 'deposer' | 'lien' | 'supprimer'. Donnée reçue : { client, ...demande de coeur/documents.js }. Rend ce que rend l'opération, ou lève un Refus.
 * `stockage` : l'objet de stockage.js (ou une fonction qui le rend, ou null s'il est introuvable). `creerDonnees(client)` : pour les essais (accès en mémoire).
 */
export async function appelDocument({ operation, db, auth, donnees, stockage, creerDonnees = null, journal = () => {}, maintenant = Date.now }) {
  const regle = OPERATIONS[operation];
  if (!regle) throw new Error(`Opération de document inconnue : ${operation}`);
  const debut = maintenant();
  const { email, client } = await controlerMembreDocuments({ db, auth, client: donnees?.client, roles: regle.roles });
  const ctx = { acteur: email, via: 'ecran', maintenant: new Date(maintenant()) };
  try {
    const r = await regle.faire({ donnees: accesDe({ db, creerDonnees }, client), stockage: stockageDe(stockage), espace: espaceDe(client), ctx, demande: donnees });
    journal({ action: operation, statut: 'ok', dureeMs: maintenant() - debut });
    return r;
  } catch (e) {
    const attendue = versErreurAppel(e);
    if (attendue) {
      journal({ action: operation, statut: attendue.code === 'internal' ? 'erreur' : 'refus', code: attendue.detail, dureeMs: maintenant() - debut });
      throw new Refus(attendue.code, attendue.message);
    }
    journal({ action: operation, statut: 'erreur', code: String(e?.name ?? 'inconnue').slice(0, 30), dureeMs: maintenant() - debut });
    logger.error('Documents : erreur inattendue', { operation, nom: e?.name });
    throw new Refus('internal', 'Une erreur est survenue. Réessayez.');
  }
}
