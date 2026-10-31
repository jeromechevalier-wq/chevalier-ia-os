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
  if (!P.aUnDestinataire(d)) { await saisirEtPreparer(devisId); return; } // une seule fenêtre : l'adresse, puis le brouillon
  await confirmerEtDemander(devisId, P.adressesDuBrouillon(d));
}

/**
 * Une fenêtre d'adresse (un devis finalisé sans adresse ne se modifie plus : seul le destinataire est écrit par le serveur, jamais le contenu du devis).
 *  - `preparer` : « Enregistrer et préparer l'e-mail » enregistre l'adresse PUIS demande le brouillon, sans seconde confirmation ; rend true si la demande est partie.
 *  - sinon (« Changer l'adresse » depuis la confirmation) : « Enregistrer l'adresse » ; rend l'adresse enregistrée, ou null si annulé.
 * Une erreur reste affichée dans la fenêtre ; pendant l'appel les boutons sont grisés (ni « Annuler » ni Échap ne ferment une écriture en cours).
 * Si l'adresse est enregistrée mais que le brouillon échoue, la fenêtre le dit et « Réessayer » ne réécrit pas l'adresse.
 */
function demanderAdresse(devisId, { preparer = false, depart = '', destinataires = [], copie = [] } = {}) {
  let occupe = false;
  let enregistree = null;
  let boutons = [];
  const occuper = (v) => { occupe = v; boutons.forEach((b) => { b.disabled = v; }); etat.hidden = !v; };
  const champ = h('input', { class: 'champ', type: 'email', inputmode: 'email', autocomplete: 'off', value: depart, 'aria-label': 'Adresse e-mail du destinataire', dataset: { champ: 'destinataire-preparer-email' } });
  const erreur = h('p', { class: 'erreur', role: 'alert', hidden: true, dataset: { zone: 'erreur-destinataire-preparer-email' } });
  const etat = h('p', { class: 'texte-discret', role: 'status', 'aria-live': 'polite', hidden: true, dataset: { zone: 'etat-preparer-email' } }, P.MESSAGE_EN_COURS);
  const contenu = h('div', { class: 'contenu-preparer-email' },
    h('p', { dataset: { valeur: 'sans-destinataire' } }, preparer ? P.MESSAGE_SANS_DESTINATAIRE_ICI : P.MESSAGE_CHANGER_ADRESSE_ICI),
    ...(preparer ? [h('p', { dataset: { valeur: 'confirmation-preparer-email' } }, P.MESSAGE_CONFIRMATION)] : []),
    champ, etat, erreur);
  return dialogue({
    titre: P.TITRE_PREPARER_EMAIL,
    classe: 'dialogue-preparer-email',
    peutFermer: () => !occupe,
    contenu,
    boutons: [
      { libelle: 'Annuler', valeur: false },
      {
        libelle: preparer ? P.LIBELLE_ENREGISTRER_ET_PREPARER : P.LIBELLE_ENREGISTRER_ADRESSE, valeur: true, style: 'principal',
        avantFermeture: async () => {
          if (occupe) return false;
          const adresse = champ.value.trim();
          const refus = P.refusDestinataire(adresse);
          erreur.hidden = !refus;
          if (refus) { erreur.textContent = refus; champ.setAttribute('aria-invalid', 'true'); champ.focus(); return false; }
          champ.setAttribute('aria-invalid', 'false');
          if (!preparer && adresse === depart) { enregistree = adresse; return true; } // « Changer l'adresse » sans la changer : rien à écrire
          occuper(true);
          let etape = 'adresse';
          try {
            if (enregistree !== adresse) {
              const suite = P.adressesApresChangement({ destinataires, copie }, depart, adresse); // les autres destinataires et la copie sont gardés
              await D.modifierDestinataires(devisId, { destinataires: suite.destinataires, ...(suite.copieChangee ? { copie: suite.copie } : {}) });
              enregistree = adresse;
            }
            etape = 'brouillon';
            if (preparer) await D.preparerEmailDevis(devisId);
          } catch (e) {
            console.warn(e);
            occuper(false);
            erreur.textContent = (etape === 'brouillon' ? 'L’adresse est enregistrée, mais le brouillon n’a pas pu être demandé. ' : '') + (e?.message || P.MESSAGE_ERREUR_PAR_DEFAUT);
            erreur.hidden = false;
            if (etape === 'brouillon') { boutons[1].textContent = 'Réessayer'; boutons[1].dataset.action = 'reessayer-preparer-email'; }
            return false; // la fenêtre reste ouverte, avec le message
          }
          occuper(false);
          return true;
        },
      },
    ],
    auMontage: ({ boutons: b }) => {
      boutons = b;
      b[0].dataset.action = 'annuler-destinataire-preparer-email';
      b[1].dataset.action = 'enregistrer-destinataire-preparer-email';
      champ.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); if (!occupe) b[1].click(); } });
      champ.focus();
    },
  }).then((ok) => (ok === true ? (preparer ? true : enregistree) : (preparer ? false : null)));
}

async function saisirEtPreparer(devisId) {
  if (await demanderAdresse(devisId, { preparer: true })) toast(P.MESSAGE_DEMANDE_ENVOYEE, { duree: 8000 });
}

/**
 * La confirmation : elle dit À QUI le brouillon sera adressé (et la copie), pour voir une mauvaise adresse au dernier moment ; « Changer l'adresse » ouvre la fenêtre d'adresse puis revient ici.
 * Un clic sur « Préparer l'e-mail » appelle la fonction ; pendant l'appel les boutons sont grisés ; une erreur reste affichée avec « Réessayer ».
 */
async function confirmerEtDemander(devisId, adresses) {
  const reponse = await confirmation(devisId, adresses);
  if (reponse !== 'changer') return;
  const depart = adresses.destinataires[0] ?? '';
  const nouvelle = await demanderAdresse(devisId, { depart, destinataires: adresses.destinataires, copie: adresses.copie });
  const suite = nouvelle ? P.adressesApresChangement(adresses, depart, nouvelle) : adresses;
  await confirmerEtDemander(devisId, suite);
}

function confirmation(devisId, adresses) {
  let occupe = false;
  let boutons = [];
  const etat = h('p', { class: 'texte-discret', role: 'status', 'aria-live': 'polite', hidden: true, dataset: { zone: 'etat-preparer-email' } }, P.MESSAGE_EN_COURS);
  const erreur = h('p', { class: 'erreur', role: 'alert', hidden: true, dataset: { zone: 'erreur-preparer-email' } });
  const contenu = h('div', { class: 'contenu-preparer-email' },
    h('p', { dataset: { valeur: 'confirmation-preparer-email' } }, P.MESSAGE_CONFIRMATION),
    h('p', { dataset: { valeur: 'adresses-preparer-email' } }, P.texteAdresses(adresses)),
    h('p', { class: 'texte-discret' }, P.MESSAGE_CHANGER_ADRESSE), etat, erreur);
  const occuper = (v) => { occupe = v; boutons.forEach((b) => { b.disabled = v; }); etat.hidden = !v; };
  return dialogue({
    titre: P.TITRE_PREPARER_EMAIL,
    classe: 'dialogue-preparer-email',
    peutFermer: () => !occupe, // ni Échap, ni croix, ni voile pendant l'appel
    contenu,
    boutons: [
      { libelle: 'Annuler', valeur: false },
      { libelle: P.LIBELLE_CHANGER_ADRESSE, valeur: 'changer', style: 'discret' },
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
            boutons[2].textContent = 'Réessayer';
            boutons[2].dataset.action = 'reessayer-preparer-email';
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
      b[1].dataset.action = 'changer-adresse-preparer-email';
      b[2].dataset.action = 'confirmer-preparer-email';
    },
  }).then((ok) => { if (ok === true) toast(P.MESSAGE_DEMANDE_ENVOYEE, { duree: 8000 }); return ok; });
}
