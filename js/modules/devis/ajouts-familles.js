// Boutons « + Fourniture », « + Main d'œuvre »… de l'éditeur du devis et entrées du menu « insérer avant / après » : une entrée par famille de départ qui a un bouton.
// Logique PURE (aucun accès à Firebase ni au navigateur). Règles : le bouton porte le NOM de la famille dès qu'elle est renommée (sinon le mot d'origine, et pour les ouvrages
// le mot du métier réglé) ; une famille désactivée n'a plus de bouton (ses articles restent au Catalogue). « Textes » n'a pas de bouton ici : il vit dans le bouton « Texte ».
import { nomDeDepart } from './familles.js';

/** Les six familles qui ont un bouton, dans l'ordre : `[id, mot d'origine, clé stable, bouton principal]`. L'ouvrage est rempli par le mot du métier. */
const BOUTONS = [
  ['famille-1', 'Fourniture', 'fourniture', true], ['famille-2', 'Main d’œuvre', 'main-oeuvre', true], ['famille-3', null, 'ouvrage', true],
  ['famille-4', 'Sous-traitance', 'sous-traitance', false], ['famille-5', 'Matériel', 'materiel', false], ['famille-7', 'Divers', 'divers', false],
];

/**
 * Entrées d'ajout de lignes d'après les familles : `{ principales, autres }`, chacune `[{ familleId, libelle, cle }]`. `motOuvrage` : le mot du métier au singulier, majuscule
 * (« Ouvrage », « Prestation »). Une famille absente de la liste ou désactivée n'a pas d'entrée ; renommée, elle porte son nouveau nom.
 */
export function entreesAjoutFamilles(familles, motOuvrage = 'Ouvrage') {
  const entrees = BOUTONS.flatMap(([familleId, motDepart, cle, principal]) => {
    const f = (familles ?? []).find((x) => x.id === familleId);
    if (!f || f.actif === false) return [];
    const renommee = typeof f.nom === 'string' && f.nom !== nomDeDepart(familleId);
    return [{ familleId, libelle: renommee ? f.nom : (motDepart ?? motOuvrage), cle, principal }];
  });
  return { principales: entrees.filter((e) => e.principal), autres: entrees.filter((e) => !e.principal) };
}
