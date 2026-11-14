// Module Rendez-vous sur la plateforme clients : « Envoyer les propositions », SMS de pluie ou d'annulation (rdvEnvoyer) et l'état du branchement (rdvEtat).
// Même code métier que chez Jérôme (serveur/src/coeur/rdv-envoi.js, copie de functions/src/coeur/rdv-envoi.js). Comme les fonctions de devis :
//  - le client reçu est une CIBLE à vérifier : l'appelant doit être « editeur » du client (un lecteur est refusé) et le module « rdv » doit être actif sur sa fiche ;
//  - UN SEUL refus neutre « Action non autorisée. » ; tout est lu et écrit sous clients/<client>/ ;
//  - n8n : le webhook et le secret sont ceux DU client (N8N_RDV_URL_<client>, N8N_RDV_SECRET_<client>), lus par `sortie` (le SEUL fichier qui fait un POST vers n8n).
import { logger } from 'firebase-functions';
import { creerAccesFirestore, avecBase } from '../serveur/src/coeur/donnees.js';
import { etatEnvoi, envoyerPropositions, envoyerSms, ErreurRdvEnvoi } from '../serveur/src/coeur/rdv-envoi.js';
import { Refus } from './appels.js';
import { controlerAppelant } from './devis.js';

export const MODULE_RDV = 'rdv';

/** Le bouton « Envoyer » est-il actif ? { branche }. Éditeurs seulement ; jamais l'adresse ni le secret. */
export async function etatRdv({ db, auth, donnees, sortie }) {
  const { client } = await controlerAppelant({ db, auth, client: donnees?.client, module: MODULE_RDV });
  return etatEnvoi({ sortie, espace: client });
}

/** `donnees` : { client, action: 'propositions' | 'sms', rendezVousId, type?, texte? }. `creerDonnees(client)` : pour les essais (accès en mémoire). */
export async function envoyerRdv({ db, auth, donnees, sortie, maintenant = Date.now, creerDonnees = null }) {
  const quand = new Date(typeof maintenant === 'function' ? maintenant() : maintenant);
  const { client } = await controlerAppelant({ db, auth, client: donnees?.client, module: MODULE_RDV });
  const acces = creerDonnees ? creerDonnees(client) : avecBase(creerAccesFirestore({ db }), `clients/${client}`);
  const commun = { donnees: acces, ctx: { maintenant: quand }, espace: client, sortie, rendezVousId: donnees.rendezVousId };
  try {
    if (donnees.action === 'propositions') return await envoyerPropositions(commun);
    if (donnees.action === 'sms') return await envoyerSms({ ...commun, type: donnees.type, texte: donnees.texte });
    throw new ErreurRdvEnvoi('invalid-argument', 'Action inconnue.');
  } catch (e) {
    if (e instanceof ErreurRdvEnvoi) throw new Refus(e.code, e.message);
    logger.error('Rendez-vous : erreur inattendue', { code: String(e?.name ?? 'inconnue').slice(0, 30) });
    throw new Refus('internal', 'Une erreur est survenue.');
  }
}
