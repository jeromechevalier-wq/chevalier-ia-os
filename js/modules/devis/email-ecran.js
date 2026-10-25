// « Envoyer par e-mail » d'un devis : un dialogue (À, Cc, Objet, Message) puis un BROUILLON dans le Gmail de l'utilisateur, avec le PDF du devis en pièce jointe.
// L'appli n'envoie JAMAIS seule : l'utilisateur relit le brouillon dans Gmail et l'envoie lui-même, puis revient appuyer sur « Marquer comme envoyé »
// (on ne peut pas savoir si l'e-mail est vraiment parti). Chaque utilisateur utilise SON Google (jeton en mémoire, portée gmail.compose demandée seulement au clic).
// Toutes les règles (message par défaut, MIME, messages d'erreur, historique) sont dans email-brouillon.js (pur, testé) ; ici, seulement l'écran.
import { h, icone, remplir, toast, dialogue } from '../../os/ui.js';
import { obtenirJeton, oublierJeton, preparerGoogle, googleDisponible } from '../../os/google-picker.js';
import * as CRM from '../crm/donnees.js';
import * as D from './donnees.js';
import { etatPdfDevis } from './pdf.js';
import { nomFichierDrive } from './drive-copie.js';
import * as E from './email-brouillon.js';

const emailCourant = () => CRM.compteCourant()?.email || '';

/** Nom de la personne à qui s'adresse le devis (« Bonjour Marie Durand, ») ; vide si le devis n'a qu'une organisation : le message dit alors « Bonjour, ». */
export function contactDuDevis(d) {
  return (d?.personneId ? CRM.personne(d.personneId)?.nom : '') || '';
}

/** Saisie de départ du dialogue : destinataires et copie du devis, objet et message par défaut. */
export function saisieDeDepart(d) {
  const variables = { contact: contactDuDevis(d), numero: d?.numero || '', objet: d?.objet || '' };
  return {
    a: E.adressesDuDevis(d?.destinataires).join(', '),
    cc: E.adressesDuDevis(d?.copie).join(', '),
    objet: E.objetParDefaut(variables),
    message: E.messageParDefaut(variables),
  };
}

/** Lit le PDF du devis : lien signé de 5 minutes (devisPdfLien), puis téléchargement. Même risque que la copie dans Drive : le navigateur doit avoir le droit de lire le stockage. */
async function lirePdf(devisId) {
  const r = await D.pdfLien(devisId);
  const url = typeof r?.url === 'string' && /^https:\/\//i.test(r.url) ? r.url : null;
  if (!url) throw new Error(D.MESSAGE_RESEAU_DEVIS);
  const rep = await fetch(url);
  if (!rep.ok) throw new Error(`Lecture du PDF : ${rep.status}`);
  return new Uint8Array(await rep.arrayBuffer());
}

const info = (titre, message, { action = null, libelleAction = '', nom = 'info-email' } = {}) => dialogue({
  titre,
  contenu: h('p', { dataset: { valeur: nom } }, message),
  boutons: action
    ? [{ libelle: 'Annuler', valeur: false }, { libelle: libelleAction, valeur: true, style: 'principal' }]
    : [{ libelle: 'Compris', valeur: true, style: 'principal' }],
}).then((r) => (r === true && action ? action() : undefined));

/**
 * Point d'entrée (éditeur et fiche). `getDevis()` rend le devis À JOUR ; `finaliser` : { libelle, action } proposé pour un brouillon (« Finaliser d'abord »).
 * Ne lève jamais : tout problème devient un message.
 */
export async function lancerEnvoiEmail({ devisId, getDevis, finaliser = null }) {
  const d = getDevis();
  if (!d) { toast('Ce devis est introuvable.', { type: 'erreur', duree: 6000 }); return; }
  if (!googleDisponible()) { await info('Envoyer le devis par e-mail', E.MESSAGE_GOOGLE_ABSENT, { nom: 'google-absent' }); return; }
  const possible = E.emailPossible(d.statut);
  if (!possible.actif) { await info('Envoyer le devis par e-mail', possible.raison, { nom: 'statut-interdit' }); return; }
  if (d.statut === 'brouillon') {
    await info('Finaliser d’abord', E.MESSAGE_FINALISER_D_ABORD, finaliser ? { action: finaliser.action, libelleAction: finaliser.libelle, nom: 'finaliser-d-abord' } : { nom: 'finaliser-d-abord' });
    return;
  }
  const etat = etatPdfDevis(d);
  if (etat !== 'pret') { await pdfPasPret(devisId, getDevis, finaliser, etat, d); return; }
  preparerGoogle().catch(() => {}); // les scripts de Google sont chargés avant le clic sur « Créer le brouillon » : la fenêtre d'autorisation s'ouvre sans délai
  await dialogueEnvoi({ devisId, getDevis });
}

/** Attend (3 secondes au plus) que le PDF du devis soit prêt. */
async function attendrePret(getDevis) {
  for (let i = 0; i < 10 && etatPdfDevis(getDevis() ?? {}) !== 'pret'; i += 1) await new Promise((r) => setTimeout(r, 300));
}

/** PDF en cours / à refaire : message clair et « Réessayer » (relance la fabrication si elle a échoué, puis ré-essaie l'envoi). */
async function pdfPasPret(devisId, getDevis, finaliser, etat, d) {
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
      await lancerEnvoiEmail({ devisId, getDevis, finaliser });
    },
  });
}

/** Le dialogue : saisie -> brouillon créé -> « Marquer comme envoyé ». */
function dialogueEnvoi({ devisId, getDevis }) {
  const d0 = getDevis();
  const depart = saisieDeDepart(d0);
  const champ = (cle, libelle, attrs) => {
    const el = attrs.rows
      ? h('textarea', { class: 'champ', id: `email-${cle}`, dataset: { champ: `email-${cle}` }, ...attrs }, attrs.value ?? '')
      : h('input', { class: 'champ', id: `email-${cle}`, dataset: { champ: `email-${cle}` }, ...attrs });
    const erreur = h('p', { class: 'erreur', role: 'alert', hidden: true, dataset: { erreur: `email-${cle}` } });
    return { el, erreur, bloc: h('div', { class: 'bloc-champ' }, h('label', { class: 'etiquette', for: `email-${cle}` }, libelle), el, erreur) };
  };
  const a = champ('a', 'À', { type: 'text', inputmode: 'email', autocomplete: 'off', placeholder: 'contact@exemple.fr', value: depart.a, 'aria-required': 'true' });
  const cc = champ('cc', 'Cc', { type: 'text', inputmode: 'email', autocomplete: 'off', placeholder: 'contact@exemple.fr', value: depart.cc });
  const objet = champ('objet', 'Objet', { type: 'text', autocomplete: 'off', value: depart.objet, 'aria-required': 'true' });
  const message = champ('message', 'Message', { rows: 11, value: depart.message });
  const champs = { a, cc, objet, message };
  const aide = h('p', { class: 'texte-discret' }, 'Un brouillon est créé dans ton Gmail, avec le PDF du devis. Tu le relis et tu l’envoies toi-même depuis Gmail (ta signature Gmail s’ajoute là-bas).');
  const etat = h('p', { class: 'texte-discret', role: 'status', 'aria-live': 'polite', hidden: true, dataset: { zone: 'etat-email' } });
  const erreurGlobale = h('p', { class: 'erreur', role: 'alert', hidden: true, dataset: { zone: 'erreur-email' } });
  const formulaire = h('div', { class: 'formulaire-email-devis' }, a.bloc, cc.bloc, objet.bloc, message.bloc, aide, etat, erreurGlobale);
  const succes = h('div', { class: 'succes-email-devis', hidden: true, dataset: { zone: 'brouillon-cree' } });
  const contenu = h('div', { class: 'contenu-email-devis' }, formulaire, succes);

  let phase = 'saisie'; // saisie | cree
  let boutons = [];
  let resultat = null; // { saisie, url } du brouillon créé
  let occupe = false;
  let statutPose = false; // « Marquer comme envoyé » déjà passé : « Réessayer » ne le redemande pas (le serveur refuserait la transition)

  const montrerErreur = (texte) => { erreurGlobale.textContent = texte || ''; erreurGlobale.hidden = !texte; };
  const occuper = (v, texte = '') => { occupe = v; boutons.forEach((b) => { b.disabled = v; }); etat.textContent = texte; etat.hidden = !v; };
  const nommer = (libelle, action) => { boutons[1].textContent = libelle; boutons[1].dataset.action = action; };

  async function creer() {
    montrerErreur('');
    for (const c of Object.values(champs)) { c.erreur.hidden = true; c.el.classList.remove('invalide'); }
    const saisie = { a: a.el.value, cc: cc.el.value, objet: objet.el.value, message: message.el.value };
    const v = E.validerSaisie(saisie);
    const clesErreur = Object.keys(v.erreurs);
    if (clesErreur.length) {
      for (const k of clesErreur) { champs[k].erreur.textContent = v.erreurs[k]; champs[k].erreur.hidden = false; champs[k].el.classList.add('invalide'); }
      champs[clesErreur[0]].el.focus();
      return;
    }
    occuper(true, 'Création du brouillon dans Gmail…');
    // Le jeton est demandé en premier : la fenêtre de Google doit s'ouvrir juste après le clic.
    const r = await E.preparerBrouillonGmail({
      saisie, nomPdf: nomFichierDrive(getDevis() ?? d0),
      outils: {
        obtenirJeton: () => obtenirJeton({ email: emailCourant(), portee: E.PORTEE_GMAIL }),
        lirePdf: () => lirePdf(devisId),
        email: emailCourant(),
      },
    });
    occuper(false);
    if (r.etat === 'erreur') {
      if (r.erreur?.statut === 401 || (r.erreur?.statut === 403 && r.message === E.MESSAGE_PORTEE)) oublierJeton(E.PORTEE_GMAIL);
      montrerErreur(r.message);
      nommer('Réessayer', 'reessayer-gmail');
      return;
    }
    if (r.etat === 'invalide') return;
    resultat = r;
    phase = 'cree';
    toast(E.MESSAGE_BROUILLON_CREE, { duree: 6000 });
    formulaire.hidden = true;
    succes.hidden = false;
    remplir(succes,
      h('p', { class: 'succes-titre', role: 'status', dataset: { valeur: 'message-brouillon' } }, icone('check', { taille: 18 }), E.MESSAGE_BROUILLON_CREE),
      h('p', {}, 'Ouvre-le dans Gmail, relis-le et envoie-le. Ensuite, reviens ici et appuie sur « Marquer comme envoyé » : l’appli ne peut pas savoir si l’e-mail est parti.'),
      h('a', { class: 'bouton bouton-secondaire', href: r.url, target: '_blank', rel: 'noopener noreferrer', dataset: { action: 'ouvrir-brouillon-gmail' } }, icone('external-link', { taille: 16 }), 'Ouvrir le brouillon dans Gmail'),
      erreurGlobale);
    boutons[0].textContent = 'Fermer';
    nommer('Marquer comme envoyé', 'marquer-envoye-email');
    boutons[1].focus();
  }

  async function marquer() {
    montrerErreur('');
    occuper(true, 'Enregistrement…');
    try {
      const courant = getDevis();
      if (!statutPose && courant?.statut === 'en_attente_envoi') { await D.changerStatut(devisId, 'marquer_envoye'); statutPose = true; }
      await D.enregistrerEnvoi(devisId, { destinataires: resultat.saisie.a, copie: resultat.saisie.cc });
      occuper(false);
      toast('Devis marqué comme envoyé', { duree: 6000 });
      return true;
    } catch (e) {
      console.warn(e);
      occuper(false);
      montrerErreur(e?.message || D.MESSAGE_RESEAU_DEVIS);
      nommer('Réessayer', 'reessayer-marquer-envoye');
      return false;
    }
  }

  return dialogue({
    titre: 'Envoyer le devis par e-mail',
    classe: 'dialogue-formulaire dialogue-email-devis',
    peutFermer: () => !occupe, // ni Échap, ni croix, ni voile pendant la création du brouillon ou l'enregistrement
    contenu,
    boutons: [
      { libelle: 'Annuler', valeur: false },
      {
        libelle: 'Créer le brouillon Gmail', valeur: true, style: 'principal',
        avantFermeture: async () => {
          if (occupe) return false;
          if (phase === 'saisie') { await creer(); return false; } // la fenêtre reste ouverte : elle montre le résultat
          return marquer();
        },
      },
    ],
    auMontage: ({ boutons: b }) => {
      boutons = b;
      b[1].dataset.action = 'creer-brouillon-gmail';
      b[0].dataset.action = 'annuler-email';
    },
  });
}
