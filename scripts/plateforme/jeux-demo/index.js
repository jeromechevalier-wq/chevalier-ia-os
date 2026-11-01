// Jeux de démonstration PAR MÉTIER (option --metier de scripts/donnees-demo.js). Un fichier de données par métier ; ce module les réunit et fabrique leur catalogue.
// Tout est INVENTÉ : prix de vente HT arrondis, aucune marque, aucun nom réel (dépôt public). Le contrôle de complétude est dans donnees-demo.js (`problemesDuJeu`) :
// un jeu n'apparaît dans la liste des métiers que s'il le passe.
//
// Format d'un jeu (voir etancheur.js) :
//   id, nom, motOuvrage (ouvrage | ensemble | forfait | prestation | lot), entreprise ({ nom, … } : « Mon entreprise » fictive), tvaReduite (10 % possible pour un particulier), voie, dechets (bloc déchets des devis),
//   noteDevis, texteLibre, familles ([[id, nom, parentId]] : sous-familles libres), articles ([[id, libelle, unité, prix de vente HT, type, familleId]]),
//   ensembles ([[id, libelle, unité, familleId, [[idArticle, quantité]]]]), mots (mots appris, même modèle que MOTS_EXEMPLE), organisations ([[nom, ville, secteur]] ×15),
//   travaux (intitulés d'affaires), vedettes (devis écrits à la main : { statut, client, travaux, objet, sections: [{ titre, lignes: [[idArticle, quantité, TVA facultative]] }], acompte }).
import etancheur from './etancheur.js';
import agence from './agence.js';
import plombier from './plombier.js';

/** Marge (en majoration) des réglages du jeu : le prix d'achat est calculé pour que le prix de vente tombe sur le chiffre rond du jeu (vente = achat x 1,25). */
export const MARGE_JEUX = 25;

/** Tous les jeux définis, dans l'ordre. Seuls ceux qui passent le contrôle de complétude sont proposés (donnees-demo.js, `metiersDisponibles`). */
export const JEUX = Object.freeze({ [etancheur.id]: etancheur, [agence.id]: agence, [plombier.id]: plombier });

/** Catalogue d'un jeu au format des articles du module Devis : `{ articles, familles }` (familles : document `devis_parametres/familles`, ou null). */
export function catalogueDuJeu(jeu) {
  const achat = (vente) => Math.round(vente * 80) / 100; // vente / 1,25, en centimes
  const articles = (jeu.articles ?? []).map(([id, libelle, unite, vente, type, familleId, tauxTva = 20]) => ({ id, code: id.toUpperCase(), libelle, unite, prixAchat: achat(vente), tauxTva, type, familleId, actif: true }));
  const ensembles = (jeu.ensembles ?? []).map(([id, libelle, unite, familleId, composants]) => ({
    id, code: id.toUpperCase(), libelle, unite, prixAchat: 0, tauxTva: 20, type: 'ouvrage', familleId, actif: true,
    composants: composants.map(([articleId, quantite]) => ({ articleId, quantite })),
  }));
  const familles = jeu.familles?.length ? { liste: jeu.familles.map(([id, nom, parentId]) => ({ id, nom, actif: true, parentId })) } : null;
  return { articles: [...articles, ...ensembles], familles };
}
