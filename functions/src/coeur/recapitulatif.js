// Structure courte d'un devis pour l'assistant : numéro de rang, identifiant, intitulé et quantité de chaque section et ligne. JAMAIS de prix d'achat ni de marge.
// Le numéro est calculé par numerosDevis (le même calcul que l'éditeur et le PDF), jamais stocké : il bouge quand on insère une ligne.
import * as D from '../../partage/devis.js';

const estSaut = (l) => l?.type === 'saut';

/** « 10 m² », « 3,5 ml » ; vide pour une ligne de texte sans quantité. */
export function quantiteAvecUnite(ligne) {
  const q = Number(ligne?.quantite);
  if (!Number.isFinite(q) || ligne?.type === 'texte') return '';
  return `${String(Math.round(q * 10000) / 10000).replace('.', ',')}${ligne?.unite ? ` ${ligne.unite}` : ''}`;
}

/**
 * Sections et lignes avec leur numéro. `prixParLigne` (Map id de ligne -> { prixVenteUnitaire, totalHT }) n'est donné que si le client le demande :
 * on y prend seulement le prix de vente unitaire et le total hors taxes de la ligne.
 */
export function structureCourte(sections, { prixParLigne } = {}) {
  const liste = Array.isArray(sections) ? sections : [];
  const numeros = D.numerosDevis(liste);
  return liste.map((s, i) => ({
    numero: numeros[i].numero,
    id: s.id,
    titre: s.titre ?? '',
    lignes: (s.lignes ?? []).flatMap((l, j) => {
      if (estSaut(l)) return [];
      const prix = prixParLigne?.get(l.id);
      return [{
        numero: numeros[i].lignes[j], id: l.id, intitule: l.libelle ?? '', quantite: quantiteAvecUnite(l),
        ...(prixParLigne ? { prixVenteUnitaire: prix?.prixVenteUnitaire ?? null, totalHT: prix?.totalHT ?? 0 } : {}),
      }];
    }),
  }));
}

/** Phrase fabriquée par le serveur : le mot « hors taxes » est écrit ici, en toutes lettres, jamais laissé à l'assistant. */
export function phraseTotaux(totalHt, totalTtc) {
  return `Total hors taxes : ${D.montantFr(totalHt)}. Total TTC : ${D.montantFr(totalTtc)}.`;
}
