// Fiche d'une organisation : résumé, détails, personnes, affaires ; activité, notes et historique à droite.
import { h, icone, remplir, ouvrirMenu } from '../../os/ui.js';
import * as D from './donnees.js';
import * as L from './logique.js';
import {
  avatar, lien, cheminPersonne, sectionRepliable, champPropriete, selecteurEtiquettes, titreEditable, selectProprietaire, gabaritFiche, lienRetour,
  saisieEnCours, carteAffaireMini, fournisseurTexte, villesConnues, etatVide, planifier,
} from './composants.js';
import { panneauActivite } from './activites.js';
import { ouvrirCreationAffaire } from './affaires.js';
import * as PD from '../projets/donnees.js';
import * as P from '../projets/logique.js';
import { carteProjetMini } from '../projets/composants.js';
import { ouvrirCreationPersonne } from './personnes.js';
import { demanderSuppressionOrganisation } from './organisations.js';

export function rendreFicheOrganisation(conteneur, id) {
  let panneau = null;
  let toutesAffaires = false;
  const racine = h('div', { class: 'fiche-conteneur' });
  conteneur.append(racine);

  function introuvable() {
    remplir(racine, h('div', { class: 'page' }, lienRetour('#/crm/organisations', 'Organisations'),
      etatVide(D.estPret() ? 'Cette organisation n’existe plus.' : 'Chargement…')));
  }

  function construire(o) {
    const personnes = L.personnesDeLOrganisation(D.etat.personnes, o.id).filter((p) => !p.archive);
    const ids = new Set(D.etat.personnes.filter((p) => p.organisationId === o.id).map((p) => p.id));
    const affaires = D.etat.affaires.filter((a) => a.organisationId === o.id || (a.personneId && ids.has(a.personneId)));
    const enCours = affaires.filter((a) => L.estAffaireActive(a));

    const nom = titreEditable({ valeur: o.nom, libelle: 'Nom', surEnregistrer: (v) => D.majOrganisation(o.id, { nom: v }) });
    const menu = h('button', { type: 'button', class: 'bouton-icone', 'aria-label': 'Plus d’actions', 'data-action': 'menu-fiche',
      onclick: (e) => ouvrirMenu(e.currentTarget, [
        { libelle: o.archive ? 'Désarchiver' : 'Archiver', icone: o.archive ? 'archive-restore' : 'archive', action: () => D.majOrganisation(o.id, { archive: !o.archive }) },
        { libelle: 'Supprimer définitivement…', icone: 'trash-2', danger: true, action: () => demanderSuppressionOrganisation(o) },
      ]) }, icone('ellipsis', { taille: 20 }));
    const entete = h('header', { class: 'fiche-tete' },
      lienRetour('#/crm/organisations', 'Organisations'),
      h('div', { class: 'fiche-tete-ligne' },
        avatar(o.nom, 52, 'avatar-organisation'),
        h('div', { class: 'fiche-titre' }, nom, h('div', { class: 'fiche-sous' }, o.archive ? h('span', { class: 'badge-archive' }, 'Archivée') : null,
          selectProprietaire({ valeur: o.proprietaire, surChoix: (v) => D.majOrganisation(o.id, { proprietaire: v }) }))),
        h('div', { class: 'fiche-actions' },
          h('button', { type: 'button', class: 'bouton bouton-secondaire', 'data-action': 'nouvelle-personne', onclick: () => ouvrirCreationPersonne({ organisationId: o.id }) }, icone('plus', { taille: 16 }), 'Personne'),
          h('button', { type: 'button', class: 'bouton bouton-principal', 'data-action': 'nouvelle-affaire', onclick: () => ouvrirCreationAffaire({ organisationId: o.id }) }, icone('plus', { taille: 16 }), 'Affaire'),
          menu)));

    const etiquettes = selecteurEtiquettes({ valeurIds: o.etiquettes || [], surChoix: (liste) => D.majOrganisation(o.id, { etiquettes: liste.map((e) => e.id) }) });
    const prop = (libelle, champ, extra = {}) => champPropriete({ libelle, valeur: o[champ] ?? '', surEnregistrer: (v) => D.majOrganisation(o.id, { [champ]: v }), ...extra }).element;
    const resume = sectionRepliable({
      id: 'organisation-resume', titre: 'Résumé',
      contenu: h('div', { class: 'pile resume' }, h('div', { class: 'resume-ligne' }, etiquettes.element),
        h('div', { class: 'proprietes' }, prop('Adresse', 'adresse'), prop('Site web', 'siteWeb', { type: 'url', lienVers: (v) => v }))),
    });
    const details = sectionRepliable({
      id: 'organisation-details', titre: 'Détails',
      contenu: h('div', { class: 'proprietes' },
        champPropriete({ libelle: 'Secteur', valeur: o.secteur || '', type: 'intelligent', fournir: fournisseurTexte(() => [...D.etat.secteurs, ...D.etat.organisations.map((x) => x.secteur)]),
          surEnregistrer: async (v) => { if (v) await D.ajouterValeurListe('secteurs', v); await D.majOrganisation(o.id, { secteur: v }); } }).element,
        champPropriete({ libelle: 'Taille', valeur: o.taille || '', type: 'select', options: L.TAILLES.map((t) => ({ valeur: t, libelle: t })), surEnregistrer: (v) => D.majOrganisation(o.id, { taille: v }) }).element,
        prop('Ville', 'ville', { type: 'intelligent', fournir: fournisseurTexte(villesConnues) })),
    });
    const sectionPersonnes = sectionRepliable({
      id: 'organisation-personnes', titre: 'Personnes', compteur: personnes.length,
      actions: [h('button', { type: 'button', class: 'bouton-icone', 'aria-label': 'Ajouter une personne', onclick: () => ouvrirCreationPersonne({ organisationId: o.id }) }, icone('plus', { taille: 16 }))],
      contenu: personnes.length
        ? h('ul', { class: 'liste-simple' }, personnes.map((p) => h('li', { class: 'ligne-simple', dataset: { personne: p.id } }, avatar(p.nom, 28), lien(cheminPersonne(p.id), p.nom), h('span', { class: 'aide' }, L.premierEmail(p)))))
        : h('p', { class: 'aide' }, 'Aucune personne pour le moment.'),
    });
    const liste = toutesAffaires ? affaires : enCours;
    const sectionAffaires = sectionRepliable({
      id: 'organisation-affaires', titre: toutesAffaires ? 'Toutes les affaires' : 'Affaires en cours', compteur: liste.length,
      actions: [h('button', { type: 'button', class: 'bouton-icone', 'aria-label': 'Ajouter une affaire', onclick: () => ouvrirCreationAffaire({ organisationId: o.id }) }, icone('plus', { taille: 16 }))],
      contenu: h('div', { class: 'pile' },
        liste.length ? h('div', { class: 'liste-cartes-mini' }, liste.map(carteAffaireMini)) : h('p', { class: 'aide' }, 'Aucune affaire pour le moment.'),
        affaires.length > enCours.length || toutesAffaires
          ? h('button', { type: 'button', class: 'bouton bouton-secondaire bouton-petit', 'data-action': 'voir-toutes-affaires', onclick: () => { toutesAffaires = !toutesAffaires; reconstruire(); } }, toutesAffaires ? 'Voir les affaires en cours' : 'Voir toutes les affaires')
          : null),
    });
    const projets = P.projetsLies(PD.etat.projets, { organisationId: o.id });
    const sectionProjets = projets.length ? sectionRepliable({
      id: 'organisation-projets', titre: 'Projets', compteur: projets.length,
      contenu: h('div', { class: 'liste-cartes-mini' }, projets.map(carteProjetMini)),
    }) : null;
    if (!panneau) panneau = panneauActivite({ lien: { organisationId: o.id }, liensCreation: () => ({ organisationId: o.id }) });
    remplir(racine, gabaritFiche({ entete, gauche: [resume.element, details.element, sectionPersonnes.element, sectionAffaires.element, sectionProjets?.element].filter(Boolean), droite: panneau.element }));
  }

  function reconstruire() {
    const o = D.organisation(id);
    if (!o) { introuvable(); return; }
    construire(o);
  }
  const rafraichir = planifier(() => { if (!saisieEnCours(racine)) reconstruire(); });
  reconstruire();
  const arrets = [D.surChangement(rafraichir), PD.surChangement(rafraichir)];
  return () => { arrets.forEach((f) => f()); panneau?.arreter(); };
}
