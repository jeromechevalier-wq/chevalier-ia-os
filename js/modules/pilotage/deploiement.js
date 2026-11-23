// Étape du module Pilotage pour la page Réglages > Déploiement (règle du 26/10/2026 : une fonction du serveur absente chez les clients se dit à l'écran). LOGIQUE PURE.
// Une ligne n'existe que si le module est actif ; l'étape est à cocher à la main : le Pilotage ne marche pas encore chez un client.
import { DOCS } from '../../os/deploiement.js';

const geler = (liste) => Object.freeze(liste.map((e) => Object.freeze(e)));

export const ETAPES_DEPLOIEMENT_PILOTAGE = geler([
  { id: 'pilotage-plateforme', groupe: 'avant', module: 'pilotage', type: 'manuel', libelle: 'Pilotage : absent chez les clients',
    reparation: 'Absent chez les clients : version plateforme du Pilotage à faire (secret par client, contrôle d’appartenance, règle plateforme). Tant que ce n’est pas fait, n’active pas ce module chez un client.', lien: `${DOCS}pilotage.md` },
]);
