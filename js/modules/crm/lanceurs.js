// « Dossier de travail » d'une affaire OU d'un projet : le même composant pour les deux.
// Sans dossier : deux boutons, « Créer un dossier dans Google Drive » (si l'option « Créer un dossier dans Google Drive » est allumée et que Google est branché :
// crée le dossier et ses sous-dossiers des Réglages, puis enregistre son lien) et « Lier un dossier existant » (n'importe quel lien : Drive, serveur, NAS, site…).
// Avec un dossier : Ouvrir, Modifier, Retirer.
// L'ancienne « Adresse GitHub » n'est plus un champ : elle est reprise comme lien « GitHub » dans la liste « Liens et documents » (projet et affaire).
import { h, icone, remplir, toast } from '../../os/ui.js';
import * as D from './donnees.js';
import * as L from './logique.js';
import * as PD from '../projets/donnees.js';
import { iconeInfo } from './composants.js';
import { googleDisponible, preparerGoogle, obtenirJeton, oublierJeton, ouvrirFenetreGoogle } from '../../os/google-picker.js';
import { retirerAvecAnnulation } from '../../os/retrait.js';
import { creerArborescence, nettoyerNomDossier, idDossierDrive, trouverDossierDeMemeNom, adresseDossierDrive } from '../../os/google-drive.js';

function boutonPetit(libelle, nomIcone, action, onclick) {
  return h('button', { type: 'button', class: 'bouton bouton-secondaire bouton-petit', dataset: { action }, onclick }, icone(nomIcone, { taille: 14 }), libelle);
}

/**
 * Crée dans Google Drive le dossier d'un projet (et ses sous-dossiers) d'après les Réglages du CRM, puis renvoie son lien.
 * Sert au bouton « Créer un dossier dans Google Drive » et à « Ajouter un document » (dossier créé au besoin). Lève une erreur au message lisible.
 */
export async function creerRepertoireDrive({ nom }) {
  const { nom: propre, erreur } = nettoyerNomDossier(nom);
  if (erreur) throw Object.assign(new Error(erreur), { saisie: true });
  const reglages = D.etat.reglages || {};
  let jeton;
  try { jeton = await obtenirJeton({ email: D.compteCourant()?.email || '' }); } catch (e) { throw Object.assign(e, { saisie: e.annule === true }); }
  try {
    // Un dossier de ce nom créé par l'appli (ou montré à l'appli) existe déjà : on ne crée pas de doublon. (Un dossier créé à la main dans Drive n'est pas visible avec la portée drive.file.)
    const existant = await trouverDossierDeMemeNom({ jeton, nom: propre, parentId: reglages.dossierParentDrive?.id || '' });
    if (existant) throw Object.assign(new Error('Un dossier de ce nom existe déjà. Utilise « Lier un dossier Google Drive existant ».'), { saisie: true });
    const r = await creerArborescence({ jeton, nom: propre, parentId: reglages.dossierParentDrive?.id || '', sousDossiers: reglages.sousDossiersDrive || [] });
    return { url: r.dossier.url, nom: r.dossier.nom, manquants: r.manquants };
  } catch (e) {
    if (e?.statut === 401) oublierJeton();
    throw e;
  }
}

/** Message après création : les sous-dossiers qui n'ont pas pu être créés sont nommés (le dossier principal, lui, existe). */
export function messageCreation({ nom, manquants }) {
  return manquants.length
    ? `Dossier « ${nom} » créé, mais ces sous-dossiers n'ont pas pu l'être : ${manquants.join(', ')}.`
    : `Dossier « ${nom} » créé dans Google Drive.`;
}

/** Les projets (autres que `sauf`) qui utilisent déjà ce dossier de travail : [{ id, titre }]. Même dossier = même adresse, ou même identifiant Drive. */
export function projetsUtilisantDossier(url, sauf = null) {
  const cible = L.nettoyerEspaces(url);
  if (!cible) return [];
  const idCible = idDossierDrive(cible);
  return (PD.etat.projets || []).filter((p) => p.id !== sauf && p.urlDossier && (p.urlDossier === cible || (idCible && idDossierDrive(p.urlDossier) === idCible))).map((p) => ({ id: p.id, titre: p.titre }));
}

const EXPLICATION = 'Le dossier où ranger les fichiers de cette fiche : un dossier créé dans Google Drive, ou un dossier Google Drive qui existe déjà. Une adresse web (serveur, NAS, site) se met dans « Liens et documents ».';
const formulaires = new Map(); // formulaire ouvert (la fiche est redessinée quand des données arrivent : il ne doit pas disparaître)

/**
 * La ligne « Dossier de travail » de la section Détails (affaire et projet, identique).
 * - fiche : l'affaire ou le projet ; enregistrer(patch) l'écrit ; typeFiche : 'affaire' ou 'projet' ; nomSuggere : nom proposé pour le dossier à créer.
 * Renvoie { github: null, dossier } (l'ancienne adresse GitHub est dans la liste « Liens et documents », avec le libellé « GitHub »).
 */
export function creerLanceurs({ fiche, typeFiche = 'affaire', nomSuggere = '', enregistrer }) {
  const etat = { urlDossier: fiche.urlDossier || '' };
  const cle = `${typeFiche}:${fiche.id}`;
  const sauf = typeFiche === 'projet' ? fiche.id : (fiche.projetId || null); // le projet de cette affaire peut partager son dossier, sans avertissement
  const google = googleDisponible();
  const peutCreer = D.etat.config.options.boutonsDepot === true && google;
  if (google) preparerGoogle().catch((e) => console.warn(e)); // chargé à l'avance : le clic ouvre la fenêtre sans délai

  const zoneDossier = h('div', { class: 'prop-valeur lanceur' });
  const ligneDossier = h('div', { class: 'prop', dataset: { prop: 'dossier' } },
    h('span', { class: 'prop-libelle' }, 'Dossier de travail de cette fiche', iconeInfo(EXPLICATION, 'Dossier de travail de cette fiche')), zoneDossier);

  /** Avertissement simple, jamais bloquant : le dossier choisi sert déjà à un autre projet. */
  function avertirSiPartage(url) {
    const autres = projetsUtilisantDossier(url, sauf);
    if (autres.length) toast(`Ce dossier sert déjà au projet « ${autres[0].titre} »${autres.length > 1 ? ` (et ${autres.length - 1} autre${autres.length > 2 ? 's' : ''})` : ''}.`, { type: 'info', duree: 7000 });
  }

  async function ecrireDossier(url) {
    // Le formulaire se ferme AVANT l'écriture : dès qu'elle est enregistrée, la fiche est redessinée (nouvelle ligne « Dossier de travail ») et ne doit plus le retrouver ouvert.
    const ouvert = formulaires.get(cle);
    formulaires.delete(cle);
    try {
      await enregistrer({ urlDossier: url });
      etat.urlDossier = url;
      afficherDossier();
      return true;
    } catch (e) {
      if (ouvert) formulaires.set(cle, ouvert);
      console.warn(e);
      toast('Enregistrement impossible', { type: 'erreur' });
      return false;
    }
  }

  const annuler = () => { formulaires.delete(cle); afficherDossier(); };
  const ouvrir = (mode, valeur) => { formulaires.set(cle, { mode, valeur }); afficherDossier(); };

  function formulaireCreation(etatForm) {
    const champNom = h('input', { class: 'champ', type: 'text', 'aria-label': 'Nom du dossier à créer', value: etatForm.valeur, maxlength: '200', dataset: { champ: 'nom-dossier' }, autocapitalize: 'off', spellcheck: false });
    champNom.addEventListener('input', () => { etatForm.valeur = champNom.value; champNom.classList.remove('invalide'); });
    const creer = async () => {
      const { nom, erreur } = nettoyerNomDossier(champNom.value);
      if (erreur) { champNom.classList.add('invalide'); toast(erreur, { type: 'erreur' }); return; }
      bouton.disabled = true;
      bouton.lastChild.textContent = 'Création en cours…';
      try {
        const r = await creerRepertoireDrive({ nom });
        if (await ecrireDossier(r.url)) toast(messageCreation(r), { type: r.manquants.length ? 'erreur' : 'info' });
        else toast(`Dossier créé, mais son lien n'a pas pu être enregistré : ${r.url}`, { type: 'erreur' });
      } catch (e) {
        if (!e?.saisie) console.warn(e);
        toast(e?.message || 'Création impossible', { type: 'erreur' });
        bouton.disabled = false;
        bouton.lastChild.textContent = 'Créer le dossier';
      }
    };
    const bouton = boutonPetit('Créer le dossier', 'folder-plus', 'creer-dossier', creer);
    champNom.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); creer(); }
      if (e.key === 'Escape') { e.stopPropagation(); annuler(); }
    });
    return h('div', { class: 'form-lien', dataset: { role: 'form-dossier', mode: 'creer' } }, champNom,
      h('div', { class: 'ligne-ajout' }, bouton, boutonPetit('Annuler', 'x', 'annuler-dossier', annuler)));
  }

  /** « Lier un dossier Google Drive existant » : la fenêtre Google en mode « choisir UN dossier », depuis la racine de Mon Drive (plus de champ pour coller une adresse). */
  async function lierDossierExistant(bouton) {
    bouton.disabled = true;
    try {
      const elus = await ouvrirFenetreGoogle({ mode: 'dossier', email: D.compteCourant()?.email || '', multiple: false });
      const dossier = elus[0];
      if (!dossier) return;
      const url = adresseDossierDrive(dossier.id);
      if (await ecrireDossier(url)) { toast('Dossier lié', { type: 'info' }); avertirSiPartage(url); }
    } catch (e) {
      if (!e?.annule) console.warn(e);
      toast(e?.message || 'Liaison impossible', { type: e?.annule ? 'info' : 'erreur' });
    } finally { bouton.disabled = false; }
  }

  /** Retirer le dossier de travail : confirmation, puis « Retiré · Annuler » 8 secondes. Seul le lien est retiré : rien n'est supprimé dans Drive. */
  function retirerDossier() {
    const ancien = etat.urlDossier;
    return retirerAvecAnnulation({
      titre: 'Retirer le dossier de travail de cette fiche ?', message: 'Seul le lien est retiré de cette fiche : le dossier lui-même n’est pas supprimé.',
      faire: async () => { if (!(await ecrireDossier(''))) throw new Error('enregistrement'); },
      defaire: async () => { await enregistrer({ urlDossier: ancien }); etat.urlDossier = ancien; afficherDossier(); },
      messageFait: 'Dossier de travail retiré',
    });
  }

  function afficherDossier() {
    const ouvert = formulaires.get(cle);
    if (ouvert) { remplir(zoneDossier, formulaireCreation(ouvert)); return; }
    if (etat.urlDossier) {
      // Un ancien lien (serveur, NAS, site) reste affiché et ouvrable comme avant ; seule une adresse web est un lien cliquable.
      const sure = !Object.keys(L.validerUrlDossier(etat.urlDossier)).length && /^https?:/i.test(etat.urlDossier);
      remplir(zoneDossier, h('div', { class: 'lanceur-ligne' },
        sure ? h('a', { class: 'prop-lien', href: etat.urlDossier, target: '_blank', rel: 'noopener noreferrer', dataset: { action: 'ouvrir-dossier' } }, icone('external-link', { taille: 14 }), ' Ouvrir le dossier') : h('span', {}, etat.urlDossier),
        boutonPetit('Retirer', 'x', 'retirer-dossier', retirerDossier)));
      return;
    }
    const lier = google ? boutonPetit('Lier un dossier Google Drive existant', 'link', 'lier-dossier', (e) => lierDossierExistant(e.currentTarget)) : null;
    remplir(zoneDossier, h('div', { class: 'boutons-liens' },
      peutCreer ? boutonPetit('Créer un dossier dans Google Drive', 'folder-plus', 'creer-dossier-ouvrir', () => ouvrir('creer', nomSuggere)) : null, lier),
      !peutCreer && !google ? h('p', { class: 'aide', dataset: { role: 'google-absent' } }, 'Aucun dossier de travail. Google Drive n’est pas branché ici : ajoute une adresse dans « Liens et documents ».') : null);
  }

  afficherDossier();
  return { github: null, dossier: ligneDossier };
}
