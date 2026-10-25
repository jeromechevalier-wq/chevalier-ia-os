// Étapes du module Affaires pour la page Réglages > Déploiement (25/10/2026). LOGIQUE PURE (ni DOM, ni Firebase).
// Le dossier Google Drive racine des projets (réglage `dossierParentDrive`, { id, nom }) : on dit seulement s'il est choisi, jamais son identifiant ni son nom.
import { DOCS } from '../../os/deploiement.js';

export const ETAPES_DEPLOIEMENT_AFFAIRES = Object.freeze([
  Object.freeze({ id: 'dossier-drive', groupe: 'pendant', module: 'affaires', type: 'auto', libelle: 'Dossier Google Drive racine des projets choisi',
    reparation: 'Crée à la main le dossier racine des projets dans le Drive du client, puis choisis-le dans Réglages > Affaires et projets > Options (sous la case Google Drive).',
    route: 'reglages/crm/reglages-options' }),
  Object.freeze({ id: 'drive-api', groupe: 'google', module: 'affaires', type: 'manuel', libelle: 'API Drive et Picker activées, adresse du site autorisée pour la connexion Google',
    reparation: 'Console Google, « API et services » : active l’API Drive et l’API Picker, puis ajoute l’adresse du site dans les origines JavaScript autorisées.',
    lien: `${DOCS}google-drive.md` }),
]);

/** États des lignes automatiques : `pret` = les réglages de l'espace sont lus ; sinon on ne peut rien dire. */
export function controlerDeploiementAffaires({ pret = true, reglages } = {}) {
  if (!pret) return { 'dossier-drive': 'inconnu' };
  try {
    const d = reglages?.dossierParentDrive;
    return { 'dossier-drive': d && typeof d === 'object' && typeof d.id === 'string' && d.id.trim() ? 'ok' : 'manque' };
  } catch {
    return { 'dossier-drive': 'inconnu' };
  }
}
