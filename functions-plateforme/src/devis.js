// Module Devis sur la plateforme clients : les transitions d'un devis (devisFinaliser, devisChangerStatut, devisNouvelleVersion, devisArchiver, devisSupprimer, devisEnregistrerEnvoi, devisModifierDestinataires)
// et « Préparer l'e-mail » (devisPreparerEmail, devisPreparerEmailEtat).
// Séparé de index.js pour pouvoir l'essayer sans Cloud Functions (comme espace.js) : `db` est injecté. Le travail est dans serveur/src/coeur/devis.js
// (copie de functions/src/coeur/devis.js, le MÊME code que chez Jérôme).
//  - le client reçu est une CIBLE à vérifier, jamais une confiance : l'appelant doit avoir clients/<client>/membres/<son e-mail> avec le rôle « editeur »
//    (un lecteur est refusé), et le module « devis » doit être actif sur la fiche du client ;
//  - UN SEUL refus neutre « Action non autorisée. » (espace inexistant, non-membre, lecteur, module inactif) : on ne dit rien de plus ;
//  - tout est écrit sous clients/<client>/ (avecBase) : un autre client est hors d'atteinte ;
//  - les transitions n'appellent pas n8n. Seule « Préparer l'e-mail » demande à n8n, par `sortie` (serveur/src/coeur/n8n-sortie.js, le SEUL fichier qui fait un POST vers n8n) : le webhook et le secret sont ceux DU client.
import { logger } from 'firebase-functions';
import { creerAccesFirestore, avecBase } from '../serveur/src/coeur/donnees.js';
import { ErreurDevis, OPERATIONS, reponsePublique } from '../serveur/src/coeur/devis.js';
import { demanderPreparation } from '../serveur/src/coeur/devis-email.js';
import { Refus } from './appels.js';
import { MOTIF_IDENTIFIANT_CLIENT } from './etiquettes.js';

export const MODULE_DEVIS = 'devis';
const REFUS_NEUTRE = () => new Refus('permission-denied', 'Action non autorisée.');

/** Identité de l'appelant : e-mail vérifié obligatoire, en minuscules. */
export function emailDe(auth) {
  const jeton = auth?.token;
  if (!auth?.uid || !jeton || jeton.email_verified !== true || typeof jeton.email !== 'string') throw new Refus('unauthenticated', 'Connexion requise.');
  return jeton.email.toLowerCase();
}

/** Contrôle de l'appelant d'une fonction de devis : e-mail vérifié, membre du client reçu avec un des `roles` (éditeur seulement par défaut), module « devis » actif. Rend { email, client } ou lève le refus neutre. */
export async function controlerAppelant({ db, auth, client, roles = ['editeur'] }) {
  const email = emailDe(auth);
  if (typeof client !== 'string' || !MOTIF_IDENTIFIANT_CLIENT.test(client)) throw new Refus('invalid-argument', 'Demande invalide.');
  if (client === 'interne') throw REFUS_NEUTRE(); // « interne » est réservé à Jérôme : c'est l'espace dont les secrets n'ont pas de suffixe (n8n-sortie.js)
  const membre = await db.doc(`clients/${client}/membres/${email}`).get();
  if (!membre.exists || !roles.includes(membre.get('role'))) throw REFUS_NEUTRE();
  const fiche = await db.doc(`clients/${client}`).get();
  if (!fiche.exists || fiche.get('modules')?.[MODULE_DEVIS] !== true) throw REFUS_NEUTRE();
  return { email, client };
}

/**
 * « Préparer l'e-mail » chez un client : demande au workflow n8n DE CE CLIENT (adresse et secret propres à lui, lus par `sortie`) de créer un brouillon Gmail avec le PDF.
 * Donnée reçue : { client, devisId, destinataires?, copie?, objet?, message? } (les 4 derniers facultatifs, cet envoi seulement ; le serveur revérifie). Rend { ok, demandeId }. Mêmes contrôles que les autres fonctions de devis ; rien n'est envoyé, ni par l'appli ni par n8n.
 * `sortie` : { branche(espace), demander(espace, …) } (serveur/src/coeur/n8n-sortie.js, le SEUL fichier qui fait un POST vers n8n).
 */
export async function preparerEmailDevis({ db, auth, donnees, sortie, maintenant = Date.now, creerDonnees = null, genererId }) {
  const { email, client } = await controlerAppelant({ db, auth, client: donnees?.client });
  try {
    const acces = creerDonnees ? creerDonnees(client) : avecBase(creerAccesFirestore({ db }), `clients/${client}`);
    const r = await demanderPreparation({ donnees: acces, ctx: { acteur: email, via: 'ecran', maintenant: new Date(maintenant) }, devisId: donnees.devisId, espace: client, sortie, saisie: donnees, ...(genererId ? { genererId } : {}) });
    return { ok: true, demandeId: r.demandeId };
  } catch (e) {
    if (e instanceof ErreurDevis) {
      throw new Refus({ demande_invalide: 'invalid-argument', introuvable: 'not-found' }[e.code] ?? 'failed-precondition', e.message);
    }
    logger.error('Devis : erreur inattendue (préparer l\'e-mail)', { nom: e?.name });
    throw new Refus('internal', 'Une erreur est survenue.');
  }
}

/** Le bouton « Préparer l'e-mail » doit-il être montré ? { branche: true | false } : seulement un éditeur de l'espace, jamais l'adresse ni le secret. */
export async function etatPreparerEmail({ db, auth, donnees, sortie }) {
  const { client } = await controlerAppelant({ db, auth, client: donnees?.client });
  return { branche: (await sortie.branche(client)) === true };
}

/**
 * Exécute une transition de devis pour le client de la demande. `operation` : finaliser | changerStatut | nouvelleVersion | archiver | supprimer.
 * Donnée reçue : { client, devisId, action?, archive? }. Rend { ok, ... } (voir coeur/devis.js, reponsePublique) ou lève un Refus.
 * `creerDonnees(client)` : pour les essais (accès en mémoire) ; par défaut, la base du projet cadrée sur clients/<client>.
 */
export async function transitionDevis({ db, auth, donnees, operation, maintenant = Date.now(), creerDonnees = null }) {
  const executer = OPERATIONS[operation];
  if (!executer) throw new Error(`Opération de devis inconnue : ${operation}`);
  const email = emailDe(auth);
  const client = donnees?.client;
  if (typeof client !== 'string' || !MOTIF_IDENTIFIANT_CLIENT.test(client)) throw new Refus('invalid-argument', 'Demande invalide.');
  const membre = await db.doc(`clients/${client}/membres/${email}`).get();
  if (!membre.exists || membre.get('role') !== 'editeur') throw REFUS_NEUTRE();
  const fiche = await db.doc(`clients/${client}`).get();
  if (!fiche.exists || fiche.get('modules')?.[MODULE_DEVIS] !== true) throw REFUS_NEUTRE();
  try {
    const acces = creerDonnees ? creerDonnees(client) : avecBase(creerAccesFirestore({ db }), `clients/${client}`);
    const r = await executer({ donnees: acces, ctx: { acteur: email, via: 'ecran', maintenant: new Date(maintenant) } }, donnees);
    return reponsePublique(r);
  } catch (e) {
    if (e instanceof ErreurDevis) {
      throw new Refus({ demande_invalide: 'invalid-argument', introuvable: 'not-found' }[e.code] ?? 'failed-precondition', e.message);
    }
    logger.error('Devis : erreur inattendue', { operation, nom: e?.name, detail: String(e?.message ?? '').slice(0, 200) });
    throw new Refus('internal', 'Une erreur est survenue.');
  }
}
