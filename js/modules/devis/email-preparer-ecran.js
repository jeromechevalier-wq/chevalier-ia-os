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
  if (await fenetre(devisId, P.valeursDeDepart(d, contact))) toast(P.MESSAGE_DEMANDE_ENVOYEE, { duree: 8000 });
}

/** Un champ « liste d'adresses » : puces avec croix, un champ d'ajout (Entrée, virgule ou sortie du champ), un message sous le champ. `lire()` / `ecrire(liste)` : l'état de la fenêtre. */
function champAdresses({ champ, titre, lire, ecrire, autres, changement }) {
  const puces = h('ul', { class: 'puces-choix', dataset: { zone: `liste-${champ}` } });
  const saisie = h('input', { class: 'champ', type: 'email', inputmode: 'email', autocomplete: 'off', 'aria-label': `Ajouter une adresse (${titre.toLowerCase()})`, placeholder: 'contact@exemple.fr', dataset: { champ: `${champ}-preparer-email` } });
  const maximum = h('p', { class: 'texte-discret', hidden: true, dataset: { zone: `maximum-${champ}` } }, P.maximumAtteint(E.MAX_ADRESSES_PAR_CHAMP));
  const message = h('p', { class: 'erreur', role: 'alert', hidden: true, dataset: { zone: `erreur-${champ}-preparer-email` } });
  const aide = h('p', { class: 'texte-discret', role: 'status', hidden: true, dataset: { zone: `aide-${champ}-preparer-email` } }, P.MESSAGE_AJOUTER_DESTINATAIRE);
  const dire = (texte) => { message.textContent = texte || ''; message.hidden = !texte; saisie.setAttribute('aria-invalid', texte ? 'true' : 'false'); };
  function dessiner() {
    const liste = lire();
    puces.replaceChildren(...liste.map((adresse) => h('li', { class: 'puce-choix', dataset: { adresse } },
      h('span', {}, adresse),
      h('button', { type: 'button', class: 'bouton-icone puce-retirer', 'aria-label': `Retirer ${adresse}`, dataset: { action: `retirer-${champ}-preparer-email` },
        onclick: () => { ecrire(liste.filter((a) => a !== adresse)); dire(''); dessiner(); changement(); saisie.focus(); } }, icone('x', { taille: 14 })))));
    puces.hidden = !liste.length;
    const plein = liste.length >= E.MAX_ADRESSES_PAR_CHAMP;
    saisie.hidden = plein;
    maximum.hidden = !plein;
    if (champ === 'destinataires') aide.hidden = liste.length > 0;
  }
  function valider() {
    const r = P.ajouterAdresse(autres(champ), champ, saisie.value);
    if (r.erreur) { dire(r.erreur); return false; } // le texte tapé reste
    dire('');
    if (saisie.value.trim()) { ecrire(r.liste); saisie.value = ''; dessiner(); changement(); }
    return true;
  }
  saisie.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); if (saisie.value.trim()) valider(); else if (e.key === 'Enter') e.stopPropagation(); }
  });
  saisie.addEventListener('input', () => dire(''));
  saisie.addEventListener('blur', () => { if (saisie.value.trim()) valider(); });
  const etiquette = h('label', { class: 'etiquette' }, titre);
  const corps = h('div', { class: 'champ-preparer-email', dataset: { zone: `champ-${champ}` } }, etiquette, puces, saisie, maximum, message, aide);
  dessiner();
  return { corps, saisie, valider, dessiner };
}

/** La fenêtre. Rend true si la demande est partie, false si annulée. Pendant l'appel tout est grisé et rien ne ferme ; un échec garde la fenêtre ouverte et tout le texte saisi. */
function fenetre(devisId, depart) {
  const etat = { destinataires: [...depart.destinataires], copie: [...depart.copie], objet: depart.objet, message: depart.message };
  let occupe = false;
  let boutons = [];
  const autres = (champ) => (champ === 'copie' ? { destinataires: etat.destinataires, copie: etat.copie } : { destinataires: etat.destinataires, copie: etat.copie });
  const erreur = h('p', { class: 'erreur', role: 'alert', hidden: true, dataset: { zone: 'erreur-preparer-email' } });
  const enCours = h('p', { class: 'texte-discret', role: 'status', 'aria-live': 'polite', hidden: true, dataset: { zone: 'etat-preparer-email' } }, P.MESSAGE_EN_COURS);
  const majBouton = () => { if (boutons[1]) boutons[1].disabled = occupe || !P.peutPreparer(etat); };
  const destinataires = champAdresses({ champ: 'destinataires', titre: 'Destinataires', lire: () => etat.destinataires, ecrire: (l) => { etat.destinataires = l; }, autres, changement: majBouton });
  const copie = champAdresses({ champ: 'copie', titre: 'Copie', lire: () => etat.copie, ecrire: (l) => { etat.copie = l; }, autres, changement: majBouton });
  const objet = h('input', { class: 'champ', type: 'text', maxlength: String(E.MAX_OBJET), value: etat.objet, 'aria-label': 'Objet', dataset: { champ: 'objet-preparer-email' }, oninput: () => { etat.objet = objet.value; } });
  const message = h('textarea', { class: 'champ', rows: '9', maxlength: String(E.MAX_MESSAGE), 'aria-label': 'Message', dataset: { champ: 'message-preparer-email' }, oninput: () => { etat.message = message.value; } });
  message.value = etat.message;
  const occuper = (v) => {
    occupe = v;
    for (const el of [objet, message, destinataires.saisie, copie.saisie]) el.disabled = v;
    boutons.forEach((b) => { b.disabled = v; });
    enCours.hidden = !v;
    if (!v) majBouton();
  };
  const contenu = h('div', { class: 'contenu-preparer-email' },
    h('p', { dataset: { valeur: 'confirmation-preparer-email' } }, P.MESSAGE_CONFIRMATION),
    destinataires.corps, copie.corps,
    h('div', { class: 'champ-preparer-email' }, h('label', { class: 'etiquette' }, 'Objet'), objet),
    h('div', { class: 'champ-preparer-email' }, h('label', { class: 'etiquette' }, 'Message'), message),
    enCours, erreur);
  return dialogue({
    titre: P.TITRE_FENETRE,
    classe: 'dialogue-formulaire dialogue-preparer-email',
    peutFermer: () => !occupe, // ni Échap, ni croix, ni voile pendant l'appel
    contenu,
    boutons: [
      { libelle: 'Annuler', valeur: false },
      {
        libelle: P.LIBELLE_PREPARER_BROUILLON, valeur: true, style: 'principal',
        avantFermeture: async () => {
          if (occupe) return false;
          // Une adresse tapée mais pas encore ajoutée compte (ou affiche son refus sous le champ et la fenêtre reste ouverte).
          if (!destinataires.valider() || !copie.valider()) return false;
          if (!P.peutPreparer(etat)) return false;
          erreur.hidden = true;
          occuper(true);
          try {
            await D.preparerEmailDevis(devisId, P.saisieModifiee(depart, etat));
          } catch (e) {
            console.warn(e);
            occuper(false);
            erreur.textContent = e?.message || P.MESSAGE_FENETRE_ERREUR;
            erreur.hidden = false;
            return false; // la fenêtre reste ouverte, avec le message et tout le texte saisi
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
      majBouton();
      (etat.destinataires.length ? objet : destinataires.saisie).focus();
    },
  }).then((ok) => ok === true);
}
