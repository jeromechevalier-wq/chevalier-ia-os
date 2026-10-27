// Dialogues partagés de l'e-mail d'un devis : un message d'information (avec une action facultative) et le cas « PDF pas prêt ». Servent à « Préparer l'e-mail » (email-preparer-ecran.js).
// Depuis le 27/10/2026 le navigateur ne crée plus de brouillon Gmail lui-même : tout passe par n8n.
import { h, toast, dialogue } from '../../os/ui.js';
import * as D from './donnees.js';
import { etatPdfDevis } from './pdf.js';
import * as E from './email-brouillon.js';

export const info = (titre, message, { action = null, libelleAction = '', nom = 'info-email' } = {}) => dialogue({
  titre,
  contenu: h('p', { dataset: { valeur: nom } }, message),
  boutons: action
    ? [{ libelle: 'Annuler', valeur: false }, { libelle: libelleAction, valeur: true, style: 'principal' }]
    : [{ libelle: 'Compris', valeur: true, style: 'principal' }],
}).then((r) => (r === true && action ? action() : undefined));

/** Attend (3 secondes au plus) que le PDF du devis soit prêt. */
async function attendrePret(getDevis) {
  for (let i = 0; i < 10 && etatPdfDevis(getDevis() ?? {}) !== 'pret'; i += 1) await new Promise((r) => setTimeout(r, 300));
}

/** PDF en cours / à refaire : message clair et « Réessayer » (relance la fabrication si elle a échoué, puis ré-essaie avec `relancer` : l'envoi par e-mail, ou « Préparer l'e-mail »). */
export async function pdfPasPret(devisId, getDevis, finaliser, etat, d, relancer) {
  const echec = d.pdf?.statut === 'echec';
  const message = etat === 'en_cours' ? E.MESSAGE_PDF_EN_COURS : echec ? `${E.MESSAGE_PDF_ECHEC}${d.pdf?.message ? ` (${d.pdf.message})` : ''}` : E.MESSAGE_PDF_PAS_PRET;
  await info('Le PDF n’est pas prêt', message, {
    nom: 'pdf-pas-pret',
    libelleAction: 'Réessayer',
    action: async () => {
      if (etat === 'a_reessayer') {
        try { await D.pdfDevis(devisId); } catch (e) { toast(e?.message || D.MESSAGE_RESEAU_DEVIS, { type: 'erreur', duree: 8000 }); return; }
        await attendrePret(getDevis); // le serveur écrit `pdf` sur le devis : l'écran le reçoit un instant après la réponse
      }
      await relancer({ devisId, getDevis, finaliser });
    },
  });
}
