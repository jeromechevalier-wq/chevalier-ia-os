// Déclencheur du PDF : dès qu'un devis passe de brouillon à finalisé (par n'importe quelle voie : bouton « Envoyer », outil de l'assistant, automatisation à venir),
// le serveur fabrique le PDF et le range. Jamais déclenché par le navigateur.
//  - Le gestionnaire ne réagit qu'au passage « brouillon -> autre statut » : l'écriture du champ `pdf` (ou tout autre changement) ne le relance jamais ;
//  - il ne lève jamais d'erreur : la finalisation ne dépend pas du PDF (un échec est noté sur le devis, `pdf.statut = 'echec'`) et on ne demande pas à Eventarc de rejouer ;
//  - idempotent : deux événements pour la même version = un seul PDF (voir reserverPdf : « ok » et « en_cours » ne refabriquent pas) ;
//  - au plus TENTATIVES_AUTO_MAX tentatives automatiques par version, ensuite échec définitif jusqu'à une demande explicite (`devisPdf`).
import { fabriquerPdfDevis } from './pdf-service.js';
import { TENTATIVES_AUTO_MAX } from '../coeur/devis.js';

/** Le passage qui déclenche la fabrication : de brouillon à n'importe quel statut finalisé. */
export const estFinalisation = (avant, apres) => !!avant && !!apres && avant.statut === 'brouillon' && typeof apres.statut === 'string' && apres.statut !== 'brouillon';

/**
 * `evenement` : { params: { devisId }, data: { before: { data() }, after: { data() } } } (forme de firebase-functions pour onDocumentUpdated).
 * Rend un petit résumé { suite, statut? } (utile aux tests) ; ne lève jamais.
 */
export function creerDeclencheurPdf({ donnees, espace = '', baseLien = '', convertir, stockage, journal = () => {}, maintenant = Date.now, tentativesMax = TENTATIVES_AUTO_MAX }) {
  return async function gestionnaire(evenement) {
    const debut = maintenant();
    const fin = (resume, statut, code) => { journal({ action: 'pdf_auto', statut, code, dureeMs: maintenant() - debut }); return resume; };
    try {
      const avant = evenement?.data?.before?.data?.();
      const apres = evenement?.data?.after?.data?.();
      if (!estFinalisation(avant, apres)) return { suite: 'ignore' }; // pas de journal : l'immense majorité des mises à jour de devis passent ici
      if (apres.pdf?.statut === 'ok') return fin({ suite: 'deja', statut: 'ok' }, 'ok', 'deja');
      const devisId = evenement?.params?.devisId;
      const rangement = typeof stockage === 'function' ? stockage() : stockage;
      if (typeof devisId !== 'string' || !devisId || !rangement) return fin({ suite: 'ignore' }, 'refus', 'non_configure');
      let dernier = null;
      for (let i = 0; i < tentativesMax; i += 1) {
        // Une nouvelle date à chaque tour : l'« en cours » posé au tour précédent est remplacé par l'échec, puis une nouvelle tentative est réservée.
        const ctx = { acteur: 'declencheur-pdf', via: 'declencheur', maintenant: new Date(maintenant()) };
        dernier = await fabriquerPdfDevis({ donnees: donnees(), espace, baseLien, devisId, explicite: false, ctx, convertir, stockage: rangement, tentativesMax });
        if (dernier.statut !== 'echec' || dernier.definitif) break;
      }
      return fin({ suite: 'traite', statut: dernier?.statut }, dernier?.statut === 'echec' ? 'erreur' : 'ok', dernier?.definitif ? 'definitif' : undefined);
    } catch (e) {
      // Jamais de levée : l'événement ne doit pas être rejoué à l'infini. Le devis reste finalisé ; l'écran proposera « Réessayer ».
      return fin({ suite: 'erreur' }, 'erreur', String(e?.name ?? 'inconnue').slice(0, 30));
    }
  };
}
