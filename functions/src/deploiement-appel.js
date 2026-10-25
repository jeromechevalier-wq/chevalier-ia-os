// Fonction appelable « deploiementVerifier » chez Jérôme (projet chevalier-ia-os) : contrôles du serveur pour la page Réglages > Déploiement.
// Même règle d'accès que les fonctions Devis (exigerCompteAutorise : compte Google vérifié parmi COMPTES_AUTORISES), refus neutre « Action non autorisée. ».
// Elle ne lit aucun secret, n'écrit rien, et ne rend que des états fixes (functions/src/coeur/deploiement.js). Le journal Cloud ne reçoit ni adresse ni contenu.
import { HttpsError } from 'firebase-functions/v2/https';
import { COMPTES_AUTORISES } from './veille/appel.js';
import { exigerCompteAutorise } from './devis-appel.js';
import { verifierDeploiement } from './coeur/deploiement.js';

/** `version` : version du serveur (functions/src/version.js) ; `comptes` : comptes autorisés (pour les essais). */
export function creerAppelDeploiement({ version, comptes = COMPTES_AUTORISES, journal = () => {}, maintenant = Date.now }) {
  return async function appel(requete) {
    const debut = maintenant();
    try {
      exigerCompteAutorise(requete, comptes);
    } catch (e) {
      journal({ action: 'deploiementVerifier', statut: 'refus', dureeMs: maintenant() - debut });
      if (e?.code === 'unauthenticated') throw e;
      throw new HttpsError('permission-denied', 'Action non autorisée.');
    }
    const r = await verifierDeploiement({
      version,
      controles: {
        fonctions: async () => true, // si l'on arrive ici, les fonctions du serveur sont publiées et répondent
        membres: async () => Array.isArray(comptes) && comptes.length > 0, // chez Jérôme, les personnes autorisées sont la liste du code (COMPTES_AUTORISES)
      },
    });
    journal({ action: 'deploiementVerifier', statut: 'ok', dureeMs: maintenant() - debut });
    return r;
  };
}

/** Une ligne de journal : liste blanche de champs. */
export function ligneDeJournalDeploiement(entree) {
  const ligne = { severity: entree.statut === 'refus' ? 'WARNING' : 'INFO', message: 'deploiement' };
  for (const c of ['action', 'statut', 'dureeMs']) if (entree[c] !== undefined) ligne[c] = entree[c];
  return JSON.stringify(ligne);
}
