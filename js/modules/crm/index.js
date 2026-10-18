// Module CRM (version 2.0) : montage, routes, actions rapides et recherche globale.
// Routes : crm/accueil, crm/personnes[/id], crm/organisations[/id], crm/affaires[/id], crm/journal.
import { vider, h, icone } from '../../os/ui.js';
import { naviguer } from '../../os/router.js';
import { enregistrerCalculs, definirConfigObjectifs, signalerChangement, surObjectifs, estPret as objectifsPrets, tousLesObjectifs, majObjectif, rendreReglagesObjectifs } from '../../os/objectifs.js';
import * as D from './donnees.js';
import * as PD from '../projets/donnees.js';
import * as L from './logique.js';
import { rendreAccueil } from './accueil.js';
import { rendrePersonnes, ouvrirCreationPersonne } from './personnes.js';
import { rendreOrganisations, ouvrirCreationOrganisation } from './organisations.js';
import { rendreAffaires, ouvrirCreationAffaire } from './affaires.js';
import { rendreFichePersonne } from './fiche-personne.js';
import { rendreFicheOrganisation } from './fiche-organisation.js';
import { rendreFicheAffaire } from './fiche-affaire.js';
import { rendreReglagesCrm } from './reglages.js';
import { rendreJournal } from './journal.js';

const VUES = {
  accueil: (conteneur, _id, ctx) => rendreAccueil(conteneur, ctx),
  personnes: (conteneur, id) => (id ? rendreFichePersonne(conteneur, id) : rendrePersonnes(conteneur)),
  organisations: (conteneur, id) => (id ? rendreFicheOrganisation(conteneur, id) : rendreOrganisations(conteneur)),
  affaires: (conteneur, id) => (id ? rendreFicheAffaire(conteneur, id) : rendreAffaires(conteneur)),
  journal: (conteneur) => rendreJournal(conteneur),
};

/** Objectifs de départ fournis à l'OS (créés au premier lancement de la base de Jérôme ; un nouvel espace part des objectifs neutres : L.objectifsDepart(config)). */
export const objectifsDepart = L.OBJECTIFS_JEROME;

/** Entrées du bouton "+" de la barre supérieure. */
export const actionsRapides = [
  { id: 'personne', libelle: 'Personne', icone: 'user-plus', raccourci: 'n', action: () => ouvrirCreationPersonne() },
  { id: 'organisation', libelle: 'Organisation', icone: 'building-2', action: () => ouvrirCreationOrganisation() },
  { id: 'affaire', libelle: 'Affaire', icone: 'briefcase', action: () => ouvrirCreationAffaire() },
];

let arretSignal = null;
let montee = null; // { cle, quitter }

export function demarrer({ compte, cheminBase = '', equipe = null, nomEspace = '' }) {
  D.demarrer(compte, cheminBase, { equipe, nomEspace });
  const calculs = {};
  for (const [id, c] of Object.entries(L.CALCULS)) {
    calculs[id] = {
      libelle: c.libelle,
      unite: c.unite,
      explication: c.explication,
      exige: c.exige,
      etape: c.etape === true,
      heritage: c.heritage === true,
      calculer: (mois, objectif) => c.calculer({ personnes: D.etat.personnes, affaires: D.etat.affaires, activites: D.etat.activites, projets: PD.etat.projets, config: D.etat.config }, mois, objectif),
    };
  }
  enregistrerCalculs(calculs, { pret: D.estPret });
  definirConfigObjectifs({
    libelle: (o) => L.libelleObjectif(o, D.etat.config),
    disponible: (o) => L.objectifDisponible(o, D.etat.config),
    proposables: (objectifs) => L.calculsProposables(D.etat.config, objectifs),
    etapes: () => L.etapesActives(D.etat.config),
  });
  const arretCrm = D.surChangement(signalerChangement);
  const arretProjets = PD.surChangement(signalerChangement); // un paiement de facture change l'objectif « encaissé »
  // L'objectif « Interviews JTBD réalisées » n'est plus calculé : il devient un compteur à tenir à la main (une seule fois, s'il existe déjà).
  let objectifConverti = false;
  const arretObjectifs = surObjectifs(() => {
    if (objectifConverti || !objectifsPrets() || compte?.ecrit === false) return;
    const ancien = tousLesObjectifs().find((o) => o.type === 'calcule' && o.calcul === 'interviews_jtbd');
    objectifConverti = true;
    if (ancien) majObjectif(ancien.id, { type: 'manuel', calcul: null }).catch((e) => console.warn('Conversion de l’objectif JTBD', e));
  });
  arretSignal = () => { arretCrm(); arretProjets(); arretObjectifs(); };
}

export function arreter() {
  quitter();
  arretSignal?.();
  arretSignal = null;
  D.arreter();
}

function quitter() {
  montee?.quitter?.();
  montee = null;
  document.querySelector('.menu-pop')?.remove();
}

export function afficher(conteneur, segs, ctx) {
  const [vue, id] = segs;
  if (!VUES[vue]) {
    naviguer('crm/accueil', { remplacer: true });
    return quitter;
  }
  const cle = `${vue}/${id || ''}`;
  if (montee?.cle === cle && conteneur.firstChild) return quitter;
  quitter();
  vider(conteneur);
  const arret = VUES[vue](conteneur, id, ctx);
  montee = { cle, quitter: typeof arret === 'function' ? arret : null };
  conteneur.scrollTop = 0;
  window.scrollTo?.(0, 0);
  return quitter;
}

/**
 * Réglages du CRM (page Réglages > CRM, sections déclarées dans registre.js). Les objectifs du mois sont ceux de la racine (chez un client l'accueil n'en montre pas) :
 * la section n'est donc ajoutée que là. Rien n'est stocké ailleurs qu'avant.
 */
export function reglages(page, ctx = {}) {
  const arrets = [rendreReglagesCrm(page, ctx)];
  if (!ctx.chezClient) {
    const sectionObjectifs = h('section', { class: 'carte-section', id: 'reglages-objectifs' },
      h('h2', {}, icone('target', { taille: 18 }), 'Objectifs du mois'),
      h('p', { class: 'aide' }, 'Cibles, couleurs, ordre et affichage. Chaque indicateur calculé explique comment il est calculé ; tu peux en ajouter (chiffre d’affaires signé, facturé, encaissé, passages à une étape…) et créer des objectifs manuels.'));
    arrets.push(rendreReglagesObjectifs(sectionObjectifs));
    page.append(sectionObjectifs);
  }
  return () => arrets.forEach((f) => typeof f === 'function' && f());
}

// ---------------------------------------------------------------- recherche globale

/** Résultats groupés pour la recherche de la barre supérieure : { groupes: [{ titre, resultats }] }. */
export function rechercher(saisie) {
  const personnes = D.etat.personnes.filter((p) => !p.archive).map((p) => {
    const o = D.organisation(p.organisationId);
    return { id: p.id, libelle: p.nom, sousTitre: o?.nom || L.premierEmail(p), extra: [o?.nom, ...(p.emails || []).map((e) => e.valeur)].filter(Boolean), chemin: `crm/personnes/${p.id}` };
  });
  const organisations = D.etat.organisations.filter((o) => !o.archive).map((o) => ({ id: o.id, libelle: o.nom, sousTitre: o.ville || '', chemin: `crm/organisations/${o.id}` }));
  const affaires = D.etat.affaires.filter((a) => !a.archive).map((a) => {
    const p = D.personne(a.personneId);
    const o = D.organisation(a.organisationId);
    return { id: a.id, libelle: a.titre, sousTitre: [o?.nom, p?.nom].filter(Boolean).join(' · '), extra: [o?.nom, p?.nom].filter(Boolean), chemin: `crm/affaires/${a.id}` };
  });
  const groupe = (titre, elements) => ({ titre, resultats: L.rechercherSuggestions(saisie, elements, {}).resultats });
  return { groupes: [groupe('Personnes', personnes), groupe('Organisations', organisations), groupe('Affaires', affaires)].filter((g) => g.resultats.length) };
}
