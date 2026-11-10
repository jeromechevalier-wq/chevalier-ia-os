// Boutons d'action du menu d'un portail (ex. « Exporter mes données »), partagés par js/main.js (chez Jérôme) et js/os/espace-modules.js (chez un client) : même code des deux côtés.
// `PORTAILS[id].actions` (portail.js, pur) décrit les boutons ; ce fichier dit ce que chaque identifiant fait. Un identifiant inconnu n'a pas de bouton.
import { toast } from './ui.js';

const FONCTIONS = {
  'exporter-devis': () => import('../modules/devis/export.js').then((m) => m.exporterDevis()), // la même fonction que Réglages > Devis > Sauvegarde ; elle affiche elle-même son message d'erreur
};

/** Boutons du menu du portail `portail` (objet de PORTAILS) : [{ id, libelle, icone, surClic }]. */
export function actionsDuPortail(portail) {
  return (portail?.actions ?? []).filter((x) => FONCTIONS[x.id]).map((x) => ({
    ...x,
    surClic: () => FONCTIONS[x.id]().catch((e) => { console.warn(e); toast('Export impossible', { type: 'erreur' }); }), // le module n'a pas pu se charger (réseau)
  }));
}
