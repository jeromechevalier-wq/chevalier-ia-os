// Module Rendez-vous sur la plateforme clients : « Envoyer les propositions », SMS de pluie ou d'annulation (rdvEnvoyer) et l'état du branchement (rdvEtat).
// Même code métier que chez Jérôme (serveur/src/coeur/rdv-envoi.js, copie de functions/src/coeur/rdv-envoi.js). Comme les fonctions de devis :
//  - le client reçu est une CIBLE à vérifier : l'appelant doit être « editeur » du client (un lecteur est refusé) et le module « rdv » doit être actif sur sa fiche ;
//  - UN SEUL refus neutre « Action non autorisée. » ; tout est lu et écrit sous clients/<client>/ ;
//  - SMS : la connexion ClickSend est celle DU client (secret CLICKSEND_RDV_<client>), lue à l'exécution par `sortie` (serveur/src/coeur/sms-direct.js, le SEUL fichier qui parle à ClickSend) ; sans elle, « Envoyer » reste grisé.
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

/**
 * Filet planifié (toutes les 15 minutes) : envoie les SMS dus de CHAQUE client dont le module « rdv » est actif et dont la connexion ClickSend existe.
 * Un client en panne n'arrête pas les autres. Rend un bilan sans donnée sensible : { clients, branches, envoyes, echecs }.
 */
export async function tirerPourTous({ db, sortie, modulesActifs }) {
  const bilan = { clients: 0, branches: 0, envoyes: 0, echecs: 0 };
  for (const doc of (await db.collection('clients').get()).docs) {
    bilan.clients += 1;
    try {
      if (!(await modulesActifs(doc.id)).includes(MODULE_RDV)) continue;
      const r = await sortie.tirer(doc.id);
      if (!r.branche) continue;
      bilan.branches += 1;
      bilan.envoyes += r.envoyes;
      bilan.echecs += r.echecs;
    } catch (e) {
      logger.error('Rendez-vous : tir planifié en échec pour un client', { code: String(e?.name ?? 'inconnue').slice(0, 30) });
    }
  }
  return bilan;
}
