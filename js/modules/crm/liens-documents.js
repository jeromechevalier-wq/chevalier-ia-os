// Onglet « Documents » d'une fiche projet ou affaire (même composant pour les deux).
// - Une ligne « Documents  + Ajouter » toujours en haut de la liste : « + Ajouter » ouvre la fenêtre standard de Google (si Google est branché).
//   Elle ouvre ensuite un petit formulaire en place : nom (prérempli avec le nom du fichier) et note facultative.
// - La liste : nom (un clic ouvre le lien), note en petit dessous, date et heure d'ajout (les anciens documents n'en ont pas), étoile, crayon (modifier nom et note), croix.
// - Plus de bouton « Ajouter un lien web » (les adresses passent par les notes) ; les liens web déjà enregistrés restent affichés.
// - Les documents existants restent tels quels (le champ `note` s'ajoute seulement quand on en écrit une). L'ancienne adresse GitHub est reprise comme lien « GitHub ».
import { h, icone, remplir, toast, dialogue } from '../../os/ui.js';
import * as D from './donnees.js';
import * as L from './logique.js';
import { boutonEtoile, iconeInfo } from './composants.js';
import { retirerAvecAnnulation } from '../../os/retrait.js';
import { googleDisponible, preparerGoogle, ouvrirFenetreGoogle, obtenirJeton } from '../../os/google-picker.js';
import { idDossierDrive, documentDepuisChoix, copierFichier, infoFichier, etatCopie, TYPE_DOSSIER } from '../../os/google-drive.js';

// Formulaire ouvert, gardé hors de la fiche : la fiche est redessinée quand des données arrivent, le formulaire en cours de saisie ne doit pas disparaître.
const EXPLICATION = 'Les documents de cette fiche. « + Ajouter » choisit un fichier dans Google Drive (ou envoie un fichier de l’ordinateur) et, par défaut, le copie dans le dossier de travail. Une adresse web se met dans une note.';
const formulaires = new Map();
const afficheurs = new Map(); // fiche → fonction qui redessine le formulaire de la section la plus récente (la fiche peut être redessinée pendant une action : on redessine alors la nouvelle section, pas l'ancienne)

/**
 * - id : identifiant de la section (data-section) ; typeFiche : 'projet' | 'affaire'
 * - courant() : la fiche à jour ; enregistrer(patch) : l'écrit
 * - renvoie { element, compteur } pour l'onglet « Documents » de la fiche ;
 *   `avant` : éléments mis au-dessus de la liste (le dossier de travail), `apres` : au-dessous (les documents de l'affaire, sur un projet).
 */
export function sectionLiensEtDocuments({ id, typeFiche, entite, courant, enregistrer, avant = [], apres = [] }) {
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
    const champNom = champ('Nom du document', etat.nom, (v) => { etat.nom = v; }, { placeholder: 'Nom du document', max: 200 });
    const champNote = champ('Note (facultative)', etat.note, (v) => { etat.note = v; }, { placeholder: 'Note (ex. envoyé au client)', max: L.LONGUEUR_MAX_NOTE });
    const valider = async () => {
      let urlChoisie = etat.urlDocument;
      // Case cochée (par défaut, quand elle est proposée) : on copie le fichier dans le dossier de travail (l'original reste où il est) et le lien enregistré pointe vers la COPIE.
      const dossier = idDossierDrive(courant().urlDossier);
      if (etat.etatCopie === 'copiable' && etat.copier && dossier) {
        try {
          const jeton = await obtenirJeton({ email: D.compteCourant()?.email || '' });
          urlChoisie = (await copierFichier({ jeton, fichierId: etat.fichierId, parentId: dossier, nom: etat.nomOriginal })).url;
          toast('Copie faite dans le dossier de travail', { type: 'info' });
        } catch (e) {
          if (!e?.saisie && !e?.annule) console.warn(e);
          toast(`La copie dans le dossier de travail n’a pas pu être faite (${e?.message || 'erreur'}) : le lien d’origine est gardé.`, { type: 'erreur', duree: 8000 });
        }
      }
      const r = L.ajouterDocument(courant(), etat.nom, urlChoisie, false, etat.note, new Date().toISOString());
      if (r.erreurs.url) { toast(r.erreurs.url, { type: 'erreur' }); return; }
      if ((courant().documents || []).some((d) => d.url === r.patch.documents.at(-1).url)) { toast('Ce lien est déjà dans la liste', { type: 'info' }); return; }
      formulaires.delete(cle);
      afficherFormulaire();
      await ecrire(r.patch);
    };
    // Case « Copier dans le dossier de travail » : seulement pour un fichier déjà dans Drive (pas « Importer »), si le dossier de travail est un dossier Drive.
    const dossierDrive = idDossierDrive(courant().urlDossier);
    const grisee = (role, coche, texte) => h('label', { class: 'case case-grisee', dataset: { role } }, h('input', { type: 'checkbox', checked: coche, disabled: true, dataset: { champ: 'copier' }, 'aria-label': 'Copier dans le dossier de travail' }), h('span', {}, texte));
    const caseCopie = dossierDrive && etat.etatCopie === 'importe' ? grisee('case-importe', true, 'Le fichier est envoyé dans le dossier de travail')
      : dossierDrive && etat.etatCopie === 'dejaDans' ? grisee('case-deja-dans', true, 'Ce fichier est déjà dans le dossier de travail')
      : dossierDrive && etat.etatCopie === 'incertain' ? grisee('case-incertaine', false, 'Impossible de vérifier le dossier de ce fichier : il reste où il est, seul son lien est gardé')
      : etat.etatCopie === 'copiable' && dossierDrive
      ? h('label', { class: 'case' }, h('input', { type: 'checkbox', checked: etat.copier === true, dataset: { champ: 'copier' }, 'aria-label': 'Copier dans le dossier de travail',
        onchange: (e) => { etat.copier = e.target.checked; } }), h('span', {}, `Copier dans le dossier de travail${typeFiche === 'affaire' ? ' de l’affaire' : ' du projet'}`))
      : null;
    for (const c of [champNom, champNote]) c.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); valider(); } });
    remplir(zoneFormulaire, h('div', { class: 'form-lien', dataset: { role: 'form-lien', mode: 'document' } },
      champNom, champNote, caseCopie,
      h('div', { class: 'ligne-ajout' },
        h('button', { type: 'button', class: 'bouton bouton-principal bouton-petit', dataset: { action: 'valider-lien' }, onclick: valider }, 'Ajouter'),
        h('button', { type: 'button', class: 'bouton bouton-secondaire bouton-petit', dataset: { action: 'annuler-lien' }, onclick: () => { formulaires.delete(cle); afficherFormulaire(); } }, 'Annuler'))));
    champNom.focus?.();
  }

  const ouvrirFormulaire = (etat) => { formulaires.set(cle, { nom: '', note: '', ...etat }); (afficheurs.get(cle) || afficherFormulaire)(); };
  afficheurs.set(cle, afficherFormulaire);

  // ------------------------------------------------------------ « Ajouter un document » : la fenêtre standard de Google
  async function choisirDansGoogle(bouton) {
    const email = D.compteCourant()?.email || '';
    const fiche = courant();
    const dossierImport = idDossierDrive(fiche.urlDossier);
    bouton.disabled = true;
    try {
      if (!fiche.urlDossier) {
        // Pas de dossier de travail : un message d'information, rien d'autre (aucune création, aucune fenêtre Google).
        await dialogue({
          titre: 'Pas de dossier de travail',
          contenu: h('p', {}, 'Cette fiche n’a pas de dossier de travail : on ne peut pas y ajouter de document. Crée ou relie d’abord le dossier de travail de cette fiche (bloc « Dossier de travail de cette fiche », en haut de cet onglet).'),
          boutons: [{ libelle: 'Fermer', valeur: null, style: 'principal' }],
        });
        return;
      }
      // « Mon Drive » est libre (racine) ; « Importer » envoie dans le dossier de travail Drive, s'il y en a un.
      const elus = await ouvrirFenetreGoogle({ mode: 'documents', dossierImport, email, multiple: false });
      const doc = documentDepuisChoix(elus[0]);
      if (!doc) { if (elus[0]) toast('Ce document n’a pas d’adresse Google utilisable', { type: 'erreur' }); return; }
      // Un fichier choisi dans « Google Drive » (pas déposé par « Importer » : celui-là est déjà dans le dossier de travail) est copié dans ce dossier, sauf si on décoche la case.
      // Comment reconnaître un fichier « Importer » ? On demande à Drive dans quels dossiers il est (files.get) : un fichier déposé par « Importer » est dans le dossier de travail.
      // Si Drive ne répond pas, on se rabat sur le dossier d'origine indiqué par la fenêtre Google.
      let info = null;
      if (dossierImport) { try { info = await infoFichier({ jeton: await obtenirJeton({ email }), fichierId: elus[0].id }); } catch (e) { console.warn(e); } }
      const etatDeLaCopie = elus[0].type === TYPE_DOSSIER ? 'aucune' : (dossierImport ? etatCopie({ info, parentIdFenetre: elus[0].parentId, dossierId: dossierImport }) : 'aucune');
      ouvrirFormulaire({ mode: 'document', nom: doc.libelle, nomOriginal: doc.libelle, urlDocument: doc.url, fichierId: elus[0].id, etatCopie: etatDeLaCopie, copier: etatDeLaCopie === 'copiable' }); // cochée par défaut (décision de Jérôme)
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
        lien.note ? h('span', { class: 'lien-note' }, lien.note) : null,
        L.formatDateHeure(lien.ajouteLe) ? h('span', { class: 'lien-date', dataset: { role: 'date-ajout' } }, `Ajouté le ${L.formatDateHeure(lien.ajouteLe)}`) : null),
      h('button', { type: 'button', class: 'bouton-icone', dataset: { action: 'modifier-lien' }, 'aria-label': `Modifier ${lien.libelle}`, onclick: () => li.replaceWith(ligneModifiable(lien)) }, icone('pencil', { taille: 14 })),
      h('button', { type: 'button', class: 'bouton-icone', dataset: { action: 'retirer-lien' }, 'aria-label': `Retirer ${lien.libelle}`, onclick: () => retirerLien(lien) }, icone('x', { taille: 14 })));
    return li;
  }
  const lignes = () => (liens.length ? [h('ul', { class: 'liste-liens' }, liens.map(ligne))] : []);
  remplir(liste, ...lignes());

  // Ligne « Documents  + Ajouter » : toujours au-dessus de la liste. Sans Google branché, aucun ajout possible : une phrase le dit.
  const boutonGoogle = google ? h('button', { type: 'button', class: 'prop-vide', dataset: { action: 'ajouter-document-google' }, 'aria-label': 'Ajouter un document', onclick: () => choisirDansGoogle(boutonGoogle) },
    icone('plus', { taille: 14 }), 'Ajouter') : h('span', { class: 'aide', dataset: { role: 'google-absent-documents' } }, 'Google Drive n’est pas branché ici : on ne peut pas ajouter de document.');
  afficherFormulaire();

  const ligneDocuments = h('div', { class: 'prop', dataset: { prop: 'documents' } },
    h('span', { class: 'prop-libelle' }, 'Documents', iconeInfo(EXPLICATION, 'Documents')), h('div', { class: 'prop-valeur' }, boutonGoogle));
  return {
    compteur: liens.length,
    element: h('div', { class: 'pile', dataset: { section: id } }, ...avant, h('div', { class: 'proprietes' }, ligneDocuments), zoneFormulaire,
      liste, liens.length ? null : h('p', { class: 'aide', dataset: { role: 'aucun-document' } }, 'Aucun document ni lien pour le moment.'), ...apres),
  };
}
