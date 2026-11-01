// Jeux de démonstration PAR MÉTIER (option --metier de scripts/donnees-demo.js). Un fichier de données par métier ; ce module les réunit et fabrique leur catalogue.
// Tout est INVENTÉ : prix de vente HT arrondis, aucune marque, aucun nom réel (dépôt public). Le contrôle de complétude est dans donnees-demo.js (`problemesDuJeu`) :
// un jeu n'apparaît dans la liste des métiers que s'il le passe.
//
// Format d'un jeu (voir etancheur.js) :
//   id, nom, motOuvrage (ouvrage | ensemble | forfait | prestation | lot), entreprise ({ nom, … } : « Mon entreprise » fictive), tvaReduite (10 % possible pour un particulier), voie, dechets (bloc déchets des devis),
//   noteDevis, texteLibre, familles ([[id, nom, parentId]] : sous-familles propres au métier, actives), famillesMasquees ('toutes' ou liste d'ids `famille-N-M` : sous-familles de départ écrites `actif: false`),
//   famillesPremierNiveau ({ 'famille-N': 'Nouveau nom' } : renommage des 7 familles de premier niveau ; l'id, le type et le parent ne changent jamais), premierNiveauMasque ('autres' = toutes celles qui ne sont pas renommées, ou liste d'ids `famille-N` : écrites `actif: false`), articles ([[id, libelle, unité, prix de vente HT, type, familleId]]),
//   ensembles ([[id, libelle, unité, familleId, [[idArticle, quantité]]]]), mots (mots appris, même modèle que MOTS_EXEMPLE), organisations ([[nom, ville, secteur]] ×15),
//   travaux (intitulés d'affaires), vedettes (devis écrits à la main : { statut, client, travaux, objet, sections: [{ titre, lignes: [[idArticle, quantité, TVA facultative]] }], acompte }).
import { FAMILLES_PAR_DEFAUT } from '../../../js/modules/devis/familles.js';
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
  const familles = documentFamilles(jeu);
  return { articles: [...articles, ...ensembles], familles };
}

/** Sous-familles de départ (`famille-N-M`) que le jeu masque : toutes (`'toutes'`) ou la liste donnée. Un id inconnu est ignoré ici (`problemesDuJeu` le signale). */
export function famillesMasqueesDuJeu(jeu) {
  const departs = FAMILLES_PAR_DEFAUT.filter((f) => f.parentId);
  if (jeu.famillesMasquees === 'toutes') return departs;
  const ids = new Set(Array.isArray(jeu.famillesMasquees) ? jeu.famillesMasquees : []);
  return departs.filter((f) => ids.has(f.id));
}

/** Familles de premier niveau (`famille-N`) du jeu : renommées (actives) puis masquées (`actif: false`, avec leur nom d'origine). Seuls `id`, `nom` et `actif` sont écrits (jamais de `parentId`). */
export function premierNiveauDuJeu(jeu) {
  const departs = FAMILLES_PAR_DEFAUT.filter((f) => !f.parentId);
  const renommees = Object.entries(jeu.famillesPremierNiveau ?? {}).filter(([id]) => departs.some((d) => d.id === id)).map(([id, nom]) => ({ id, nom, actif: true }));
  const dejaVues = new Set(renommees.map((f) => f.id));
  const ids = new Set(jeu.premierNiveauMasque === 'autres' ? departs.filter((d) => !dejaVues.has(d.id)).map((d) => d.id) : Array.isArray(jeu.premierNiveauMasque) ? jeu.premierNiveauMasque : []);
  const masquees = departs.filter((d) => ids.has(d.id) && !dejaVues.has(d.id)).map((d) => ({ id: d.id, nom: d.nom, actif: false }));
  return [...renommees, ...masquees];
}

/** Document `devis_parametres/familles` du jeu : les familles de premier niveau renommées ou masquées, ses sous-familles propres (actives), puis les sous-familles de départ masquées (`actif: false`, toujours avec leur nom). Null s'il n'y a rien de tout cela. */
function documentFamilles(jeu) {
  const premier = premierNiveauDuJeu(jeu);
  const propres = (jeu.familles ?? []).map(([id, nom, parentId]) => ({ id, nom, actif: true, parentId }));
  const masquees = famillesMasqueesDuJeu(jeu).map((f) => ({ id: f.id, nom: f.nom, actif: false, parentId: f.parentId }));
  return premier.length || propres.length || masquees.length ? { liste: [...premier, ...propres, ...masquees] } : null;
}
