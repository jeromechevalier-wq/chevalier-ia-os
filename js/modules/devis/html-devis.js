// HTML du devis tel que le client le voit (aperçu de l'éditeur). Le PDF, lui, est fabriqué par le serveur (devisPdf) : plus d'impression par le navigateur.
import { vueClient, affichageDe, affichageAvecReglages } from './logique.js';
import { devisHtml } from './document.js';

/**
 * HTML du devis tel que le client le voit (aperçu, impression). `contexte` : { clientNom, client: { telephone, email, numeroTva, siren }, emetteur }.
 * Les cases du menu « Options » du devis (`devis.affichage`) s'appliquent. Un devis en brouillon porte le filigrane « BROUILLON ».
 */
export function htmlDuDevis(devis, { clientNom = null, client = null, emetteur = undefined, attentionNom = null, reglages = null } = {}) {
  const vue = vueClient(devis, { clientNom, client: client ?? undefined, attentionNom });
  return devisHtml(vue, { brouillon: devis?.statut === 'brouillon', affichage: affichageAvecReglages(affichageDe(devis), reglages), ...(emetteur ? { emetteur } : {}) });
}
