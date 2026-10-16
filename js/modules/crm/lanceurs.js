// « Dossier de travail » d'une affaire ou d'un projet : n'importe quel lien (Drive, serveur, NAS, site…).
// Sur un PROJET, si l'option « Créer le répertoire dans Google Drive » est allumée et que Google est branché, un bouton « Créer le répertoire »
// crée le dossier (et ses sous-dossiers, définis dans les Réglages) directement dans Drive, puis enregistre son lien.
// L'ancienne « Adresse GitHub » n'est plus un champ : elle est reprise comme lien « GitHub » (liste « Liens et documents » du projet),
// et reste visible ici, sur l'affaire, tant qu'elle existe.
import { h, icone, remplir, toast } from '../../os/ui.js';
import * as D from './donnees.js';
import * as L from './logique.js';
import { googleDisponible, preparerGoogle, obtenirJeton, oublierJeton } from '../../os/google-picker.js';
import { creerArborescence, nettoyerNomDossier } from '../../os/google-drive.js';

function boutonPetit(libelle, nomIcone, action, onclick) {
  return h('button', { type: 'button', class: 'bouton bouton-secondaire bouton-petit', dataset: { action }, onclick }, icone(nomIcone, { taille: 14 }), libelle);
}

/**
 * Crée dans Google Drive le dossier d'un projet (et ses sous-dossiers) d'après les Réglages du CRM, puis renvoie son lien.
 * Sert au bouton « Créer le répertoire » et à « Ajouter un document » (dossier créé au besoin). Lève une erreur au message lisible.
 */
export async function creerRepertoireDrive({ nom }) {
  const { nom: propre, erreur } = nettoyerNomDossier(nom);
  if (erreur) throw Object.assign(new Error(erreur), { saisie: true });
  const reglages = D.etat.reglages || {};
  let jeton;
  try { jeton = await obtenirJeton({ email: D.compteCourant()?.email || '' }); } catch (e) { throw Object.assign(e, { saisie: e.annule === true }); }
  try {
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

/**
 * Les lignes de la section Détails.
 * - fiche : l'affaire (ou le projet) ; enregistrer(patch) l'écrit ; typeFiche : 'affaire' ou 'projet' ; nomSuggere : nom proposé pour le dossier à créer.
 * Renvoie { github, dossier } : `github` n'existe que sur une affaire qui porte encore une ancienne adresse GitHub.
 */
export function creerLanceurs({ fiche, typeFiche = 'affaire', nomSuggere = '', enregistrer }) {
  const etat = { urlGithub: fiche.urlGithub || '', urlDossier: fiche.urlDossier || '' };
  const peutCreer = typeFiche === 'projet' && D.etat.config.options.boutonsDepot === true;
  const google = googleDisponible();
  if (peutCreer && google) preparerGoogle().catch((e) => console.warn(e)); // chargé à l'avance : le clic ouvre la fenêtre sans délai

  async function sauver(champ, resultat, lecture) {
    if (Object.keys(resultat.erreurs).length) {
      champ.classList.add('invalide');
      toast(resultat.erreurs.url, { type: 'erreur' });
      return false;
    }
    champ.classList.remove('invalide');
    try {
      await enregistrer(resultat.patch);
      lecture(resultat.patch);
      return true;
    } catch (e) {
      console.warn(e);
      toast('Enregistrement impossible', { type: 'erreur' });
      return false;
    }
  }

  // ------------------------------------------------------------ Ancienne adresse GitHub (affaire seulement, tant qu'elle existe)
  let ligneGithub = null;
  if (typeFiche === 'affaire' && etat.urlGithub) {
    const sure = !Object.keys(L.validerUrlGithub(etat.urlGithub)).length;
    const texte = ` ${etat.urlGithub.replace(/^https:\/\//, '')}`;
    ligneGithub = h('div', { class: 'prop', dataset: { prop: 'github' } }, h('span', { class: 'prop-libelle' }, 'GitHub'),
      h('div', { class: 'prop-valeur lanceur' }, h('div', { class: 'lanceur-ligne' },
        sure ? h('a', { class: 'prop-lien', href: etat.urlGithub, target: '_blank', rel: 'noopener noreferrer' }, icone('git-branch', { taille: 14 }), texte) : h('span', {}, texte),
        h('button', { type: 'button', class: 'prop-modifier bouton-icone', dataset: { action: 'retirer-github' }, 'aria-label': 'Retirer l’adresse GitHub',
          onclick: async () => { try { await enregistrer({ urlGithub: '' }); } catch (e) { console.warn(e); toast('Enregistrement impossible', { type: 'erreur' }); } } }, icone('x', { taille: 14 })))));
  }

  // ------------------------------------------------------------ Dossier de travail
  const zoneDossier = h('div', { class: 'prop-valeur lanceur' });
  const ligneDossier = h('div', { class: 'prop', dataset: { prop: 'dossier' } }, h('span', { class: 'prop-libelle' }, 'Dossier de travail'), zoneDossier);

  function afficherDossier() {
    if (!etat.urlDossier) { editerDossier(); return; }
    // Défense en profondeur : une valeur écrite hors de l'écran (agent, import) n'est un lien que si elle passe la même validation.
    const sure = !Object.keys(L.validerUrlDossier(etat.urlDossier)).length && /^https?:/i.test(etat.urlDossier);
    remplir(zoneDossier, h('div', { class: 'lanceur-ligne' },
      sure ? h('a', { class: 'prop-lien', href: etat.urlDossier, target: '_blank', rel: 'noopener noreferrer' }, icone('external-link', { taille: 14 }), ' Ouvrir le dossier') : h('span', {}, etat.urlDossier),
      h('button', { type: 'button', class: 'prop-modifier bouton-icone', 'aria-label': 'Modifier : Dossier de travail', onclick: editerDossier }, icone('pencil', { taille: 14 }))));
  }

  function editerDossier() {
    const valider = () => sauver(champUrl, L.majUrlDossier(champUrl.value), (patch) => { etat.urlDossier = patch.urlDossier; afficherDossier(); });
    const champUrl = h('input', { class: 'champ', type: 'url', 'aria-label': 'Adresse du dossier de travail', placeholder: 'Lien du dossier (Drive, serveur, NAS, site…)', value: etat.urlDossier, dataset: { champ: 'dossier' } });
    champUrl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); valider(); }
      if (e.key === 'Escape' && etat.urlDossier) { e.stopPropagation(); afficherDossier(); }
    });
    const lignes = [];
    if (!etat.urlDossier && peutCreer && google) {
      const champNom = h('input', { class: 'champ', type: 'text', 'aria-label': 'Nom du dossier à créer', value: nomSuggere, maxlength: '200', dataset: { champ: 'nom-dossier' }, autocapitalize: 'off', spellcheck: false });
      const creer = async () => {
        const { nom, erreur } = nettoyerNomDossier(champNom.value);
        if (erreur) { champNom.classList.add('invalide'); toast(erreur, { type: 'erreur' }); return; }
        champNom.classList.remove('invalide');
        bouton.disabled = true;
        bouton.lastChild.textContent = 'Création en cours…';
        try {
          const r = await creerRepertoireDrive({ nom });
          try {
            await enregistrer({ urlDossier: r.url });
            etat.urlDossier = r.url;
            afficherDossier();
            toast(messageCreation(r), { type: r.manquants.length ? 'erreur' : 'info' });
          } catch (e) {
            console.warn(e);
            toast(`Dossier créé, mais son lien n'a pas pu être enregistré : ${r.url}`, { type: 'erreur' });
          }
        } catch (e) {
          if (!e?.saisie) console.warn(e);
          toast(e?.message || 'Création impossible', { type: 'erreur' });
          bouton.disabled = false;
          bouton.lastChild.textContent = 'Créer le répertoire';
        }
      };
      const bouton = boutonPetit('Créer le répertoire', 'folder-plus', 'creer-dossier', creer);
      champNom.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); creer(); } });
      lignes.push(h('p', { class: 'aide' }, 'Créer un dossier dans Google Drive (nom du dossier) :'), h('div', { class: 'lanceur-ligne' }, champNom, bouton));
    }
    lignes.push(h('div', { class: 'lanceur-ligne' },
      champUrl,
      boutonPetit('Enregistrer', 'check', 'enregistrer-dossier', valider),
      etat.urlDossier ? boutonPetit('Annuler', 'x', 'annuler-dossier', afficherDossier) : null));
    remplir(zoneDossier, ...lignes);
    if (!etat.urlDossier && peutCreer && google) zoneDossier.append(h('p', { class: 'aide' }, 'Seul le lien du dossier est enregistré, pas son nom. Pour un dossier qui existe déjà (Drive, serveur, NAS, site…), colle plutôt son lien dans le champ ci-dessous.'));
    if (!etat.urlDossier && peutCreer && !google) zoneDossier.append(h('p', { class: 'aide', dataset: { role: 'google-absent' } }, '« Créer le répertoire » apparaîtra quand Google Drive sera branché (guide : docs/google-drive.md).'));
  }

  afficherDossier();
  return { github: ligneGithub, dossier: ligneDossier };
}
