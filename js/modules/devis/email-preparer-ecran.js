// « Préparer l'e-mail » : un clic dans le menu « Envoyer » -> UNE fenêtre à quatre champs (Destinataires, Copie, Objet, Message, préremplis) -> la fonction du serveur demande à un workflow n8n de créer
// un BROUILLON dans le Gmail du compte, avec le PDF. Rien n'est envoyé (ni par l'appli, ni par n8n) : la personne envoie elle-même depuis Gmail. Toutes les règles et tous les textes sont dans
// email-preparer.js et email-brouillon.js (purs, testés). Ce qu'on change dans la fenêtre vaut pour CET envoi seulement : le devis et le texte standard ne bougent pas (01/11/2026).
// Le résultat se lit dans l'Historique du devis (« E-mail préparé dans Gmail le … ») : le serveur l'écrit quand n8n a fini.
import { h, toast, dialogue, icone } from '../../os/ui.js';
import * as D from './donnees.js';
import * as Fiches from '../crm/donnees.js';
import { etatPdfDevis } from './pdf.js';
import { info, pdfPasPret } from './email-ecran.js';
import * as E from './email-brouillon.js';
import * as P from './email-preparer.js';
import { saisieAdresses } from './saisie-adresses.js';
import { emailsDeFiche } from './editeur-logique.js';

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
  let contact = '';
  try { contact = (d.personneId ? Fiches.personne(d.personneId)?.nom : '') || ''; } catch { contact = ''; }
  if (await fenetre(devisId, P.valeursDeDepart(d, contact), E.nomPieceJointe(d.pdf?.nom), () => adressesDeFiche(d))) toast(P.MESSAGE_DEMANDE_ENVOYEE, { duree: 8000 });
}

/** Les adresses e-mail de la fiche du client du devis, proposées pendant la saisie (liste courte ; on peut toujours taper une autre adresse). Ne lève jamais. */
function adressesDeFiche(d) {
  try { return [...(d.personneId ? emailsDeFiche(Fiches.personne(d.personneId)) : []), ...(d.organisationId ? emailsDeFiche(Fiches.organisation(d.organisationId)) : [])]; } catch { return []; }
}

/** La fenêtre. Rend true si la demande est partie, false si annulée. Pendant l'appel tout est grisé et rien ne ferme ; un échec garde la fenêtre ouverte et tout le texte saisi. */
function fenetre(devisId, depart, nomPdf, suggestions) {
  const etat = { destinataires: [...depart.destinataires], copie: [...depart.copie], objet: depart.objet, message: depart.message };
  let occupe = false;
  let boutons = [];
  const erreur = h('p', { class: 'erreur', role: 'alert', hidden: true, dataset: { zone: 'erreur-preparer-email' } });
  const enCours = h('p', { class: 'texte-discret', role: 'status', 'aria-live': 'polite', hidden: true, dataset: { zone: 'etat-preparer-email' } }, P.MESSAGE_EN_COURS);
  const majBouton = () => { if (boutons[0]) boutons[0].disabled = occupe || !P.peutPreparer(etat); };
  const aide = h('p', { class: 'texte-discret', role: 'status', hidden: true, dataset: { zone: 'aide-destinataires-preparer-email' } }, P.MESSAGE_AJOUTER_DESTINATAIRE);
  const majAide = () => { aide.hidden = P.peutPreparer(etat); };
  // Les règles de cette fenêtre (adresse sûre, doublon, maximum) sont dans P.ajouterAdresse ; le composant partagé ne fait que la saisie à la Gmail.
  const adresses = saisieAdresses({
    lire: (cle) => etat[cle],
    ecrire: (cle, liste) => { etat[cle] = liste; },
    surChangement: () => { majBouton(); majAide(); },
    refus: (cle, adresse, courante, autre) => P.ajouterAdresse(cle === 'copie' ? { destinataires: autre, copie: courante } : { destinataires: courante, copie: autre }, cle, adresse).erreur ?? null,
    plafond: (cle) => ({ max: E.MAX_ADRESSES_PAR_CHAMP, texte: P.maximumAtteint(E.MAX_ADRESSES_PAR_CHAMP) }),
    suggestions,
    suffixe: '-preparer-email',
  });
  const limite = h('p', { class: 'message-limite', role: 'status', hidden: true, dataset: { zone: 'limite-preparer-email' } }, icone('info', { taille: 16 }), h('span', {}));
  const montrerErreur = (e) => {
    const texte = e?.message || P.MESSAGE_FENETRE_ERREUR;
    const info = P.estMessageDeLimite(texte); // une limite du serveur n'est pas une panne : phrase grise avec une icône, pas en rouge
    limite.querySelector('span').textContent = info ? texte : '';
    limite.hidden = !info;
    erreur.textContent = info ? '' : texte;
    erreur.hidden = info;
  };
  const objet = h('input', { class: 'champ', type: 'text', maxlength: String(E.MAX_OBJET), value: etat.objet, 'aria-label': 'Objet', dataset: { champ: 'objet-preparer-email' }, oninput: () => { etat.objet = objet.value; } });
  const message = h('textarea', { class: 'champ', rows: '9', maxlength: String(E.MAX_MESSAGE), 'aria-label': 'Message', dataset: { champ: 'message-preparer-email' }, oninput: () => { etat.message = message.value; } });
  message.value = etat.message;
  const occuper = (v) => {
    occupe = v;
    for (const el of [objet, message]) el.disabled = v;
    adresses.desactiver(v);
    boutons.forEach((b) => { b.disabled = v; });
    enCours.hidden = !v;
    if (!v) majBouton();
  };
  const contenu = h('div', { class: 'contenu-preparer-email' },
    h('p', { dataset: { valeur: 'confirmation-preparer-email' } }, P.MESSAGE_CONFIRMATION),
    adresses.element, aide,
    h('div', { class: 'champ-preparer-email' }, h('label', { class: 'etiquette' }, 'Objet'), objet),
    h('div', { class: 'champ-preparer-email' }, h('label', { class: 'etiquette' }, 'Message'), message),
    h('div', { class: 'piece-jointe-puce', dataset: { zone: 'piece-jointe-preparer-email' } }, icone('file', { taille: 16 }), h('span', {}, nomPdf)), // le poids du PDF n'est connu qu'après la demande : pas affiché
    enCours, limite, erreur);
  return dialogue({
    titre: P.TITRE_FENETRE,
    classe: 'dialogue-formulaire dialogue-preparer-email',
    peutFermer: () => !occupe, // ni Échap, ni croix, ni voile pendant l'appel
    contenu,
    boutons: [ // comme dans Gmail : le bouton principal en bas à GAUCHE, puis « Annuler » (css : .dialogue-preparer-email .dialogue-pied)
      {
        libelle: P.LIBELLE_PREPARER_BROUILLON, valeur: true, style: 'principal',
        avantFermeture: async () => {
          if (occupe) return false;
          // Une adresse tapée mais pas encore ajoutée compte (ou affiche son refus sous le champ et la fenêtre reste ouverte).
          if (!adresses.valider()) return false;
          majAide();
          if (!P.peutPreparer(etat)) return false;
          limite.hidden = true; erreur.hidden = true;
          occuper(true);
          try {
            await D.preparerEmailDevis(devisId, P.saisieModifiee(depart, etat));
          } catch (e) {
            console.warn(e);
            occuper(false);
            montrerErreur(e);
            return false; // la fenêtre reste ouverte, avec le message et tout le texte saisi
          }
          occuper(false);
          return true;
        },
      },
      { libelle: 'Annuler', valeur: false },
    ],
    auMontage: ({ boutons: b }) => {
      boutons = b;
      b[0].dataset.action = 'confirmer-preparer-email';
      b[1].dataset.action = 'annuler-preparer-email';
      majBouton(); majAide();
      (etat.destinataires.length ? objet : { focus: () => adresses.focus() }).focus();
    },
  }).then((ok) => ok === true);
}
