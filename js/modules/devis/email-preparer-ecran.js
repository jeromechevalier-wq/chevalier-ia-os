// « Préparer l'e-mail » : un clic dans le menu « Envoyer » -> une confirmation courte -> la fonction du serveur demande à un workflow n8n de créer un BROUILLON dans le Gmail du compte,
// avec le PDF. Rien n'est envoyé (ni par l'appli, ni par n8n) : la personne envoie elle-même depuis Gmail. Toutes les règles et tous les textes sont dans email-preparer.js (pur, testé).
// Le résultat se lit dans l'Historique du devis (« E-mail préparé dans Gmail le … ») : le serveur l'écrit quand n8n a fini.
import { h, toast, dialogue } from '../../os/ui.js';
import * as D from './donnees.js';
import { etatPdfDevis } from './pdf.js';
import { info, pdfPasPret } from './email-ecran.js';
import * as E from './email-brouillon.js';
import * as P from './email-preparer.js';

/**
 * Point d'entrée (éditeur et visualisation). `getDevis()` rend le devis À JOUR ; `finaliser` : { libelle, action } proposé pour un brouillon (« Finaliser d'abord »).
 * Ne lève jamais : tout problème devient un message.
 */
export async function lancerPreparationEmail({ devisId, getDevis, finaliser = null }) {
  const d = getDevis();
  if (!d) { toast('Ce devis est introuvable.', { type: 'erreur', duree: 6000 }); return; }
  const possible = E.emailPossible(d.statut);
  if (!possible.actif) { await info(P.TITRE_PREPARER_EMAIL, possible.raison, { nom: 'statut-interdit' }); return; }
  if (d.statut === 'brouillon') {
    await info('Finaliser d’abord', E.MESSAGE_FINALISER_D_ABORD, finaliser ? { action: finaliser.action, libelleAction: finaliser.libelle, nom: 'finaliser-d-abord' } : { nom: 'finaliser-d-abord' });
    return;
  }
  const etat = etatPdfDevis(d);
  if (etat !== 'pret') { await pdfPasPret(devisId, getDevis, finaliser, etat, d, lancerPreparationEmail); return; }
  if (!P.aUnDestinataire(d)) { await info(P.TITRE_PREPARER_EMAIL, P.MESSAGE_SANS_DESTINATAIRE, { nom: 'sans-destinataire' }); return; }
  await confirmerEtDemander(devisId);
}

/** La confirmation : un clic sur « Préparer l'e-mail » appelle la fonction ; pendant l'appel les boutons sont grisés ; une erreur reste affichée avec « Réessayer ». */
function confirmerEtDemander(devisId) {
  let occupe = false;
  let boutons = [];
  const etat = h('p', { class: 'texte-discret', role: 'status', 'aria-live': 'polite', hidden: true, dataset: { zone: 'etat-preparer-email' } }, P.MESSAGE_EN_COURS);
  const erreur = h('p', { class: 'erreur', role: 'alert', hidden: true, dataset: { zone: 'erreur-preparer-email' } });
  const contenu = h('div', { class: 'contenu-preparer-email' }, h('p', { dataset: { valeur: 'confirmation-preparer-email' } }, P.MESSAGE_CONFIRMATION), etat, erreur);
  const occuper = (v) => { occupe = v; boutons.forEach((b) => { b.disabled = v; }); etat.hidden = !v; };
  return dialogue({
    titre: P.TITRE_PREPARER_EMAIL,
    classe: 'dialogue-preparer-email',
    peutFermer: () => !occupe, // ni Échap, ni croix, ni voile pendant l'appel
    contenu,
    boutons: [
      { libelle: 'Annuler', valeur: false },
      {
        libelle: P.LIBELLE_PREPARER_EMAIL, valeur: true, style: 'principal',
        avantFermeture: async () => {
          if (occupe) return false;
          erreur.hidden = true;
          occuper(true);
          try {
            await D.preparerEmailDevis(devisId);
          } catch (e) {
            console.warn(e);
            occuper(false);
            erreur.textContent = e?.message || P.MESSAGE_ERREUR_PAR_DEFAUT;
            erreur.hidden = false;
            boutons[1].textContent = 'Réessayer';
            boutons[1].dataset.action = 'reessayer-preparer-email';
            return false; // la fenêtre reste ouverte, avec le message
          }
          occuper(false);
          return true;
        },
      },
    ],
    auMontage: ({ boutons: b }) => {
      boutons = b;
      b[0].dataset.action = 'annuler-preparer-email';
      b[1].dataset.action = 'confirmer-preparer-email';
    },
  }).then((ok) => { if (ok === true) toast(P.MESSAGE_DEMANDE_ENVOYEE, { duree: 8000 }); });
}
