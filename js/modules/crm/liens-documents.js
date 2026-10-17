// Section « Liens et documents » d'une fiche projet ou affaire (même composant pour les deux).
// - La liste : nom (un clic ouvre le lien), note en petit dessous, étoile, crayon (modifier nom et note), croix.
// - Deux boutons côte à côte : « Ajouter un document » (fenêtre standard de Google, si Google est branché) et « Ajouter un lien web ».
//   Les deux ouvrent un petit formulaire en place : nom (facultatif pour un lien ; prérempli avec le nom du fichier pour un document) et note facultative.
// - Les documents existants restent tels quels (le champ `note` s'ajoute seulement quand on en écrit une). L'ancienne adresse GitHub est reprise comme lien « GitHub ».
import { h, icone, remplir, toast, dialogue } from '../../os/ui.js';
import * as D from './donnees.js';
import * as L from './logique.js';
import { sectionRepliable, boutonEtoile, iconeInfo } from './composants.js';
import { retirerAvecAnnulation } from '../../os/retrait.js';
import { creerRepertoireDrive, messageCreation } from './lanceurs.js';
import { googleDisponible, preparerGoogle, ouvrirFenetreGoogle, obtenirJeton } from '../../os/google-picker.js';
import { idDossierDrive, documentDepuisChoix, copierFichier, TYPE_DOSSIER } from '../../os/google-drive.js';

// Formulaire ouvert, gardé hors de la fiche : la fiche est redessinée quand des données arrivent, le formulaire en cours de saisie ne doit pas disparaître.
const EXPLICATION = 'Liens et documents de cette fiche. « Ajouter un document » choisit un fichier dans Google Drive (ou envoie un fichier de l’ordinateur) et, par défaut, le copie dans le dossier de travail. « Ajouter un lien web » garde l’adresse d’un site ou d’un fichier.';
const formulaires = new Map();

/**
 * - id : identifiant de la section (data-section) ; typeFiche : 'projet' | 'affaire'
 * - courant() : la fiche à jour ; enregistrer(patch) : l'écrit
 */
export function sectionLiensEtDocuments({ id, typeFiche, entite, courant, enregistrer }) {
  const cle = `${typeFiche}:${entite.id}`;
  const liens = L.liensEtDocuments(entite);
  const google = googleDisponible();
  if (google) preparerGoogle().catch((e) => console.warn(e)); // chargé à l'avance : le clic ouvre la fenêtre sans délai
  const zoneFormulaire = h('div', { class: 'pile', dataset: { role: 'zone-lien' } });
  const liste = h('div', { class: 'pile' });

  async function ecrire(patch, messageErreur = 'Enregistrement impossible') {
    try { await enregistrer(patch); return true; } catch (e) { console.warn(e); toast(messageErreur, { type: 'erreur' }); return false; }
  }

  // ------------------------------------------------------------ formulaire en place (ajout d'un lien ou d'un document)
  function champ(libelle, valeur, surSaisie, options = {}) {
    const c = h('input', { class: 'champ', type: options.type || 'text', 'aria-label': libelle, placeholder: options.placeholder || '', value: valeur, maxlength: options.max || null, autocapitalize: 'off', spellcheck: false });
    c.addEventListener('input', () => surSaisie(c.value));
    return c;
  }

  function afficherFormulaire() {
    const etat = formulaires.get(cle);
    if (!etat) { remplir(zoneFormulaire); return; }
    const lien = etat.mode === 'lien';
    const champUrl = lien ? champ('Lien web', etat.url, (v) => { etat.url = v; champUrl.classList.remove('invalide'); }, { type: 'url', placeholder: 'Adresse du lien (commence par http)', max: 2000 }) : null;
    const champNom = champ(lien ? 'Nom (facultatif)' : 'Nom du document', etat.nom, (v) => { etat.nom = v; }, { placeholder: lien ? 'Nom du lien (sinon le nom du site)' : 'Nom du document', max: 200 });
    const champNote = champ('Note (facultative)', etat.note, (v) => { etat.note = v; }, { placeholder: 'Note (ex. envoyé au client)', max: L.LONGUEUR_MAX_NOTE });
    const valider = async () => {
      let urlChoisie = lien ? etat.url : etat.urlDocument;
      // Case cochée (par défaut, quand elle est proposée) : on copie le fichier dans le dossier de travail (l'original reste où il est) et le lien enregistré pointe vers la COPIE.
      const dossier = idDossierDrive(courant().urlDossier);
      if (!lien && etat.copiable && etat.copier && dossier) {
        try {
          const jeton = await obtenirJeton({ email: D.compteCourant()?.email || '' });
          urlChoisie = (await copierFichier({ jeton, fichierId: etat.fichierId, parentId: dossier, nom: etat.nomOriginal })).url;
          toast('Copie faite dans le dossier de travail', { type: 'info' });
        } catch (e) {
          if (!e?.saisie && !e?.annule) console.warn(e);
          toast(`La copie dans le dossier de travail n’a pas pu être faite (${e?.message || 'erreur'}) : le lien d’origine est gardé.`, { type: 'erreur', duree: 8000 });
        }
      }
      if (lien) urlChoisie = L.normaliserLienWeb(urlChoisie); // on complète le début de l'adresse (voir normaliserLienWeb)
      const r = L.ajouterDocument(courant(), etat.nom, urlChoisie, false, etat.note);
      if (r.erreurs.url) { toast(r.erreurs.url, { type: 'erreur' }); champUrl?.classList.add('invalide'); return; }
      if ((courant().documents || []).some((d) => d.url === r.patch.documents.at(-1).url)) { toast('Ce lien est déjà dans la liste', { type: 'info' }); return; }
      formulaires.delete(cle);
      afficherFormulaire();
      await ecrire(r.patch);
    };
    // Case « Copier dans le dossier de travail » : seulement pour un fichier déjà dans Drive (pas « Importer »), si le dossier de travail est un dossier Drive.
    const dossierDrive = idDossierDrive(courant().urlDossier);
    const caseCopie = !lien && etat.importe && dossierDrive
      ? h('label', { class: 'case case-grisee', dataset: { role: 'case-importe' } }, h('input', { type: 'checkbox', checked: true, disabled: true, dataset: { champ: 'copier' }, 'aria-label': 'Copier dans le dossier de travail' }),
        h('span', {}, 'Le fichier est envoyé dans le dossier de travail'))
      : !lien && etat.copiable && dossierDrive
      ? h('label', { class: 'case' }, h('input', { type: 'checkbox', checked: etat.copier === true, dataset: { champ: 'copier' }, 'aria-label': 'Copier dans le dossier de travail',
        onchange: (e) => { etat.copier = e.target.checked; } }), h('span', {}, `Copier dans le dossier de travail${typeFiche === 'affaire' ? ' de l’affaire' : ' du projet'}`))
      : null;
    for (const c of [champUrl, champNom, champNote]) c?.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); valider(); } });
    remplir(zoneFormulaire, h('div', { class: 'form-lien', dataset: { role: 'form-lien', mode: etat.mode } },
      champUrl, champNom, champNote, caseCopie,
      h('div', { class: 'ligne-ajout' },
        h('button', { type: 'button', class: 'bouton bouton-principal bouton-petit', dataset: { action: 'valider-lien' }, onclick: valider }, 'Ajouter'),
        h('button', { type: 'button', class: 'bouton bouton-secondaire bouton-petit', dataset: { action: 'annuler-lien' }, onclick: () => { formulaires.delete(cle); afficherFormulaire(); } }, 'Annuler'))));
    (champUrl || champNom).focus?.();
  }

  const ouvrirFormulaire = (etat) => { formulaires.set(cle, { url: '', nom: '', note: '', ...etat }); afficherFormulaire(); };

  // ------------------------------------------------------------ « Ajouter un document » : la fenêtre standard de Google
  async function choisirDansGoogle(bouton) {
    const email = D.compteCourant()?.email || '';
    let fiche = courant();
    let dossierImport = idDossierDrive(fiche.urlDossier);
    bouton.disabled = true;
    try {
      if (!fiche.urlDossier) {
        const choix = await dialogue({
          titre: 'Pas encore de dossier de travail',
          contenu: h('p', {}, 'Cette fiche n’a pas de dossier de travail. « Créer le dossier » en crée un dans Google Drive (avec les sous-dossiers définis dans les Réglages) et l’enregistre comme dossier de travail : les fichiers importés ou copiés y seront rangés.'),
          boutons: [
            { libelle: 'Annuler', valeur: null },
            { libelle: 'Créer le dossier', valeur: 'creer', style: 'principal' },
          ],
        });
        if (choix !== 'creer') return;
        {
          const r = await creerRepertoireDrive({ nom: fiche.titre });
          await enregistrer({ urlDossier: r.url });
          dossierImport = idDossierDrive(r.url);
          toast(messageCreation(r), { type: r.manquants.length ? 'erreur' : 'info' });
          fiche = courant();
        }
      }
      // « Mon Drive » est libre (racine) ; « Importer » envoie dans le dossier de travail Drive, s'il y en a un.
      const elus = await ouvrirFenetreGoogle({ mode: 'documents', dossierImport, email, multiple: false });
      const doc = documentDepuisChoix(elus[0]);
      if (!doc) { if (elus[0]) toast('Ce document n’a pas d’adresse Google utilisable', { type: 'erreur' }); return; }
      // Un fichier choisi dans « Google Drive » (pas déposé par « Importer » : celui-là est déjà dans le dossier de travail) est copié dans ce dossier, sauf si on décoche la case.
      const dejaDansLeDossier = dossierImport && elus[0].parentId === dossierImport;
      ouvrirFormulaire({ mode: 'document', nom: doc.libelle, nomOriginal: doc.libelle, urlDocument: doc.url, fichierId: elus[0].id, copiable: !dejaDansLeDossier && elus[0].type !== TYPE_DOSSIER, importe: !!dejaDansLeDossier, copier: true }); // cochée par défaut (décision de Jérôme)
    } catch (e) {
      if (!e?.saisie && !e?.annule) console.warn(e);
      toast(e?.message || 'Ajout impossible', { type: e?.annule ? 'info' : 'erreur' });
    } finally {
      bouton.disabled = false;
    }
  }

  // ------------------------------------------------------------ la liste
  /** Retirer un lien : confirmation, puis « Retiré · Annuler » pendant 8 secondes (le fichier lui-même n'est jamais touché). */
  function retirerLien(lien) {
    const avant = courant();
    return retirerAvecAnnulation({
      titre: 'Retirer ce lien ?', message: `« ${lien.libelle} » sera retiré de la liste. Le fichier ou le site, lui, n’est pas touché.`,
      faire: () => enregistrer(L.retirerLien(avant, lien)),
      defaire: () => enregistrer({ documents: avant.documents || [], urlGithub: avant.urlGithub || '' }),
      messageFait: `« ${lien.libelle} » retiré`,
    });
  }

  function ligneModifiable(lien) {
    let nom = lien.libelle;
    let note = lien.note;
    const enregistrerLigne = async () => {
      await ecrire(L.modifierLien(courant(), lien, { libelle: nom, note }));
    };
    const champNom = champ(`Nom de ${lien.libelle}`, lien.libelle, (v) => { nom = v; }, { max: 200 });
    const champNote = champ(`Note de ${lien.libelle}`, lien.note, (v) => { note = v; }, { placeholder: 'Note (facultative)', max: L.LONGUEUR_MAX_NOTE });
    for (const c of [champNom, champNote]) c.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); enregistrerLigne(); }
      if (e.key === 'Escape') { e.stopPropagation(); remplir(liste, ...lignes()); }
    });
    return h('li', { class: 'ligne-lien ligne-lien-edition', dataset: { lien: lien.url } },
      h('div', { class: 'form-lien' }, champNom, champNote,
        h('div', { class: 'ligne-ajout' },
          h('button', { type: 'button', class: 'bouton bouton-principal bouton-petit', dataset: { action: 'enregistrer-lien' }, onclick: enregistrerLigne }, 'Enregistrer'),
          h('button', { type: 'button', class: 'bouton bouton-secondaire bouton-petit', dataset: { action: 'annuler-modification-lien' }, onclick: () => remplir(liste, ...lignes()) }, 'Annuler'))));
  }

  function ligne(lien) {
    const li = h('li', { class: 'ligne-lien', dataset: { lien: lien.url } },
      icone('link', { taille: 14 }),
      boutonEtoile({ favori: lien.favori, libelle: lien.libelle, surBascule: () => ecrire(L.basculerFavoriLien(courant(), lien)) }),
      h('div', { class: 'lien-texte' },
        h('a', { href: lien.url, target: '_blank', rel: 'noopener noreferrer' }, lien.libelle),
        lien.note ? h('span', { class: 'lien-note' }, lien.note) : null),
      h('button', { type: 'button', class: 'bouton-icone', dataset: { action: 'modifier-lien' }, 'aria-label': `Modifier ${lien.libelle}`, onclick: () => li.replaceWith(ligneModifiable(lien)) }, icone('pencil', { taille: 14 })),
      h('button', { type: 'button', class: 'bouton-icone', dataset: { action: 'retirer-lien' }, 'aria-label': `Retirer ${lien.libelle}`, onclick: () => retirerLien(lien) }, icone('x', { taille: 14 })));
    return li;
  }
  const lignes = () => (liens.length ? [h('ul', { class: 'liste-liens' }, liens.map(ligne))] : []);
  remplir(liste, ...lignes());

  const boutonGoogle = google ? h('button', { type: 'button', class: 'bouton bouton-secondaire bouton-petit', dataset: { action: 'ajouter-document-google' }, onclick: () => choisirDansGoogle(boutonGoogle) },
    icone('plus', { taille: 14 }), 'Ajouter un document') : null;
  const boutonLien = h('button', { type: 'button', class: 'bouton bouton-secondaire bouton-petit', dataset: { action: 'ajouter-lien' }, onclick: () => ouvrirFormulaire({ mode: 'lien' }) },
    icone('link', { taille: 14 }), 'Ajouter un lien web');
  afficherFormulaire();

  return sectionRepliable({
    id, titre: 'Liens et documents', compteur: liens.length, actions: [iconeInfo(EXPLICATION, 'Liens et documents')],
    contenu: h('div', { class: 'pile' }, liste, h('div', { class: 'boutons-liens' }, boutonGoogle, boutonLien), zoneFormulaire),
  });
}
