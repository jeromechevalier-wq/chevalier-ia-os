// Adresse GitHub et dossier de travail d'une affaire (ou d'un projet), chacun avec son bouton
// « Créer le GitHub » / « Créer le répertoire » : une fenêtre donne un prompt à coller dans Claude Code.
import { h, icone, remplir, toast, dialogue } from '../../os/ui.js';
import * as D from './donnees.js';
import * as L from './logique.js';

async function copierTexte(texte, zone) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(texte);
      return true;
    }
  } catch (e) {
    console.warn(e);
  }
  try {
    zone.focus();
    zone.select();
    return document.execCommand('copy');
  } catch (e) {
    console.warn(e);
    return false;
  }
}

/** Fenêtre qui montre le prompt, avec un bouton « Copier » (elle reste ouverte après la copie). */
function ouvrirPrompt({ titre, aide, texte }) {
  const zone = h('textarea', { class: 'champ prompt-zone', readOnly: true, rows: 16, 'aria-label': 'Prompt à copier', value: texte, dataset: { zone: 'prompt' } });
  return dialogue({
    titre,
    classe: 'dialogue-prompt',
    contenu: h('div', { class: 'pile' }, h('p', { class: 'aide' }, aide), zone),
    boutons: [
      {
        libelle: 'Copier', valeur: 'copier', style: 'principal',
        avantFermeture: async () => {
          const ok = await copierTexte(texte, zone);
          toast(ok ? 'Prompt copié : colle-le dans Claude Code.' : 'Copie impossible : sélectionne le texte et copie-le à la main.', { type: ok ? 'info' : 'erreur' });
          return false;
        },
      },
      { libelle: 'Fermer', valeur: null },
    ],
  });
}

function boutonPetit(libelle, nomIcone, action, onclick) {
  return h('button', { type: 'button', class: 'bouton bouton-secondaire bouton-petit', dataset: { action }, onclick }, icone(nomIcone, { taille: 14 }), libelle);
}

/**
 * Les deux lignes de la section Détails : « Adresse GitHub » puis « Dossier » (dans cet ordre : le PROJET.md du dossier
 * reprend l'adresse du dépôt, donc le dépôt se crée d'abord).
 * - fiche : l'affaire (ou le projet) ; enregistrer(patch) l'écrit ; typeFiche : 'affaire' ou 'projet'.
 */
export function creerLanceurs({ fiche, typeFiche = 'affaire', organisation = null, personne = null, affaireOrigine = null, enregistrer }) {
  const etat = { urlGithub: fiche.urlGithub || '', urlDossier: fiche.urlDossier || '' };
  const reglages = D.etat.reglages || {};
  const nomDossier = L.nomDossierSuggere({ organisation, titre: fiche.titre });
  const nomDepot = L.nomDepotSuggere(nomDossier);
  const creeLe = L.aujourdhuiParis();

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

  function champAdresse({ libelle, valeur, placeholder, nom, surValider, surAnnuler }) {
    const champ = h('input', { class: 'champ', type: 'url', 'aria-label': libelle, placeholder, value: valeur, dataset: { champ: nom } });
    champ.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); surValider(); }
      if (e.key === 'Escape' && surAnnuler) { e.stopPropagation(); surAnnuler(); }
    });
    return champ;
  }

  // ------------------------------------------------------------ Adresse GitHub
  const zoneGithub = h('div', { class: 'prop-valeur lanceur' });
  const ligneGithub = h('div', { class: 'prop', dataset: { prop: 'github' } }, h('span', { class: 'prop-libelle' }, 'Adresse GitHub'), zoneGithub);

  function afficherGithub() {
    if (!etat.urlGithub) { editerGithub(L.adresseDepotSuggeree(reglages.proprietaireGithub, nomDepot), true); return; }
    // Défense en profondeur : une valeur écrite hors de l'écran (agent, import) n'est un lien que si elle passe la même validation.
    const sure = !Object.keys(L.validerUrlGithub(etat.urlGithub)).length;
    const texte = ` ${etat.urlGithub.replace(/^https:\/\//, '')}`;
    remplir(zoneGithub, h('div', { class: 'lanceur-ligne' },
      sure ? h('a', { class: 'prop-lien', href: etat.urlGithub, target: '_blank', rel: 'noopener noreferrer' }, icone('git-branch', { taille: 14 }), texte) : h('span', {}, texte),
      h('button', { type: 'button', class: 'prop-modifier bouton-icone', 'aria-label': 'Modifier : Adresse GitHub', onclick: () => editerGithub(etat.urlGithub, false) }, icone('pencil', { taille: 14 }))));
  }

  /** `proposition` : la valeur est une suggestion, enregistrée seulement quand Jérôme la valide. */
  function editerGithub(valeur, proposition) {
    const valider = () => sauver(champ, L.majUrlGithub(champ.value), (patch) => { etat.urlGithub = patch.urlGithub; afficherGithub(); });
    const champ = champAdresse({ libelle: 'Adresse GitHub', valeur, placeholder: 'https://github.com/compte/nom', nom: 'github', surValider: valider, surAnnuler: etat.urlGithub ? afficherGithub : null });
    const creer = () => {
      const depot = L.lireDepotGithub(champ.value);
      if (!depot) { champ.classList.add('invalide'); toast("Indique l'adresse du dépôt sous la forme https://github.com/compte/nom.", { type: 'erreur' }); return; }
      const texte = L.promptCreationGithub({ typeFiche, id: fiche.id, titre: fiche.titre, organisation, personne, proprietaire: depot.proprietaire, nomDepot: depot.nom, creeLe });
      if (!texte) { champ.classList.add('invalide'); toast('Le nom du dépôt ne contient que des minuscules, des chiffres et des tirets.', { type: 'erreur' }); return; }
      champ.classList.remove('invalide');
      ouvrirPrompt({
        titre: 'Créer le GitHub',
        aide: "Copie ce texte et colle-le dans Claude Code : il crée le dépôt en privé, après ton accord. Ensuite, reviens valider l'adresse dans le champ « Adresse GitHub ».",
        texte,
      });
    };
    remplir(zoneGithub, h('div', { class: 'lanceur-ligne' },
      champ,
      boutonPetit('Enregistrer', 'check', 'enregistrer-github', valider),
      proposition ? boutonPetit('Créer le GitHub', 'git-branch', 'creer-github', creer) : null,
      !proposition && etat.urlGithub ? boutonPetit('Annuler', 'x', 'annuler-github', afficherGithub) : null));
    if (proposition) zoneGithub.append(h('p', { class: 'aide' }, "Adresse proposée : elle n'est enregistrée que quand tu la valides."));
  }

  // ------------------------------------------------------------ Dossier
  const zoneDossier = h('div', { class: 'prop-valeur lanceur' });
  const ligneDossier = h('div', { class: 'prop', dataset: { prop: 'dossier' } }, h('span', { class: 'prop-libelle' }, 'Dossier'), zoneDossier);

  function afficherDossier() {
    if (!etat.urlDossier) { editerDossier(); return; }
    const sure = !Object.keys(L.validerUrlDossier(etat.urlDossier)).length;
    remplir(zoneDossier, h('div', { class: 'lanceur-ligne' },
      sure ? h('a', { class: 'prop-lien', href: etat.urlDossier, target: '_blank', rel: 'noopener noreferrer' }, icone('external-link', { taille: 14 }), ' Ouvrir le dossier') : h('span', {}, etat.urlDossier),
      h('button', { type: 'button', class: 'prop-modifier bouton-icone', 'aria-label': 'Modifier : Dossier', onclick: editerDossier }, icone('pencil', { taille: 14 }))));
  }

  function editerDossier() {
    const valider = () => sauver(champUrl, L.majUrlDossier(champUrl.value), (patch) => { etat.urlDossier = patch.urlDossier; afficherDossier(); });
    const champUrl = champAdresse({ libelle: 'Adresse du dossier Google Drive', valeur: etat.urlDossier, placeholder: "Colle ici l'adresse du dossier Drive", nom: 'dossier', surValider: valider, surAnnuler: etat.urlDossier ? afficherDossier : null });
    const lignes = [];
    if (!etat.urlDossier) {
      const champNom = h('input', { class: 'champ', type: 'text', 'aria-label': 'Nom du dossier', value: nomDossier, dataset: { champ: 'nom-dossier' }, autocapitalize: 'off', spellcheck: false });
      const creer = () => {
        const nom = champNom.value.trim();
        const erreurs = L.validerNomDossier(nom);
        if (Object.keys(erreurs).length) { champNom.classList.add('invalide'); toast(erreurs.nom, { type: 'erreur' }); return; }
        champNom.classList.remove('invalide');
        const texte = L.promptCreationDossier({
          typeFiche, id: fiche.id, titre: fiche.titre, organisation, personne, affaireOrigine,
          urlGithub: etat.urlGithub, creeLe, cheminProjets: reglages.cheminProjets, nomDossier: nom,
        });
        ouvrirPrompt({
          titre: 'Créer le répertoire',
          aide: "Copie ce texte et colle-le dans Claude Code : il propose la liste de ce qu'il va créer et attend ton accord. Ensuite, reviens coller l'adresse du dossier dans le champ ci-dessous.",
          texte,
        });
      };
      champNom.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); creer(); } });
      lignes.push(h('div', { class: 'lanceur-ligne' }, champNom, boutonPetit('Créer le répertoire', 'folder-plus', 'creer-dossier', creer)));
    }
    lignes.push(h('div', { class: 'lanceur-ligne' },
      champUrl,
      boutonPetit('Enregistrer', 'check', 'enregistrer-dossier', valider),
      etat.urlDossier ? boutonPetit('Annuler', 'x', 'annuler-dossier', afficherDossier) : null));
    remplir(zoneDossier, ...lignes);
    if (!etat.urlDossier) zoneDossier.append(h('p', { class: 'aide' }, "Le nom du dossier n'est pas enregistré : seule l'adresse du dossier l'est."));
  }

  afficherGithub();
  afficherDossier();
  return { github: ligneGithub, dossier: ligneDossier };
}
