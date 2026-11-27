// Compteurs de la bulle de l'accueil « village » (26/11/2026) : le nombre montré pour un besoin qui porte `compteur` (liste fermée COMPTEURS de js/os/maison-village.js).
// Aucune route nouvelle : la lecture est celle du module Factures d'achat (js/modules/achatsfactures/donnees.js, compterFacturesAValider) par le client de la base de l'espace.
// La lecture démarre dès l'affichage du village (une seule par affichage) ; la base peut mettre plusieurs secondes à se réveiller au premier appel,
// d'où un délai large (20 s) : la bulle montre « Compte en cours » pendant l'attente, puis la pastille dès que le nombre arrive.
// Lecture en échec, incomplète ou plus lente que DELAI_COMPTEUR : null (la bulle s'affiche sans pastille ; jamais de chiffre inventé, jamais « 0 » en cas d'erreur).
import { clientBase, actionsBase, connexionPrete } from './acces-base.js';
import { creerDonnees } from '../modules/achatsfactures/donnees.js';
import { avecDelai } from './maison-village.js';

export const DELAI_COMPTEUR = 20000;

const LECTURES = {
  factures_a_valider: async () => {
    await connexionPrete();
    return creerDonnees({ client: clientBase, actions: actionsBase }).compterFacturesAValider();
  },
};

/** Nombre (entier >= 0) du compteur `id`, ou null (inconnu, erreur, lecture incomplète ou trop lente). */
export async function lireCompteur(id, delai = DELAI_COMPTEUR) {
  const lire = Object.hasOwn(LECTURES, id) ? LECTURES[id] : null;
  if (!lire) return null;
  try {
    const n = await avecDelai(lire, delai);
    return Number.isInteger(n) && n >= 0 ? n : null;
  } catch (e) {
    console.warn('Accueil : compteur illisible', id, e?.code ?? e?.message);
    return null;
  }
}
