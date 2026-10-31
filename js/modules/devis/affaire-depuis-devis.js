// Finaliser un devis sans affaire : l'application crée l'affaire (décision de Jérôme, 30/10/2026). Règles PURES (aucun accès à Firebase ni au navigateur), testées dans tests/devis-affaire-depuis-devis.test.js.
// Fichier à part : editeur-logique.js est copié dans functions/partage/ (imports réécrits), il ne doit pas importer le CRM.
import { titreParDefaut, etapesActives, etapeActive } from '../crm/logique.js';
import { nettoyerNomDevis } from './logique.js';

/** Nom proposé pour l'affaire créée : le nom (interne) du devis s'il existe, sinon « Affaire » + le client (organisation, sinon personne). Vide si ni l'un ni l'autre : la fenêtre exige alors un nom. */
export function nomAffaireProposee(devis, { organisation = null, personne = null } = {}) {
  return nettoyerNomDevis(devis?.nom) || titreParDefaut({ organisation, personne });
}

/**
 * Étape de départ de l'affaire créée, d'après le réglage « Étape des affaires créées depuis un devis ».
 * `retenue` : l'étape du réglage si elle existe ET est active, sinon null (jamais de repli sur la première étape ni sur une étape nommée « Devis »).
 * `actives` : les étapes proposées quand rien n'est retenu. `aucune` : le pipeline n'a aucune étape active.
 */
export function etapePourAffaireCreee(reglage, config) {
  const actives = etapesActives(config);
  return { actives, retenue: reglage && etapeActive(reglage, config) ? reglage : null, aucune: actives.length === 0 };
}

/**
 * Étape à passer à `creerAffaire` : celle du réglage, sinon le choix fait dans la fenêtre ; toujours une étape active, sinon null (on n'appelle alors pas `creerAffaire` :
 * `nouvelleAffaire` remplacerait en silence une étape inconnue ou désactivée par la première étape active).
 */
export function etapeAPasser(reglage, choix, config) {
  const { retenue } = etapePourAffaireCreee(reglage, config);
  if (retenue) return retenue;
  return choix && etapeActive(choix, config) ? choix : null;
}
