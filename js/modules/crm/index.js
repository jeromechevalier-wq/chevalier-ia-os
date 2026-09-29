// Module CRM : montage, sous menu (Accueil, Kanban, Liste), fiche en panneau.
import { vider } from '../../os/ui.js';
import { naviguer } from '../../os/router.js';
import { enregistrerCalculs, signalerChangement } from '../../os/objectifs.js';
import * as D from './donnees.js';
import { CALCULS, OBJECTIFS_DEPART } from './logique.js';
import { rendreAccueil } from './accueil.js';
import { rendreKanban } from './kanban.js';
import { rendreListe } from './liste.js';
import { ouvrirPanneau, fermerPanneau } from './fiche.js';
import { rendreReglagesCrm } from './reglages.js';

const VUES = { accueil: rendreAccueil, kanban: rendreKanban, liste: rendreListe };

/** Objectifs de départ fournis à l'OS (créés au premier lancement). */
export const objectifsDepart = OBJECTIFS_DEPART;

let arretSignal = null;
let vueMontee = null; // { nom, quitter }
let vueFond = 'accueil';
let conteneurCourant = null;

export function demarrer({ compte }) {
  D.demarrer(compte);
  const calculs = {};
  for (const [id, c] of Object.entries(CALCULS)) {
    calculs[id] = { libelle: c.libelle, unite: c.unite, calculer: (mois) => c.calculer(D.etat.fiches, mois) };
  }
  enregistrerCalculs(calculs, { pret: D.estPret });
  arretSignal = D.surChangement(signalerChangement);
}

export function arreter() {
  quitter();
  arretSignal?.();
  arretSignal = null;
  D.arreter();
}

function quitter() {
  fermerPanneau();
  vueMontee?.quitter?.();
  vueMontee = null;
  document.querySelector('.suggestion')?.remove();
}

function monterVue(conteneur, nom, ctx) {
  vueMontee?.quitter?.();
  vider(conteneur);
  const quitterVue = VUES[nom](conteneur, ctx);
  vueMontee = { nom, quitter: quitterVue };
  conteneur.scrollTop = 0;
}

export function afficher(conteneur, segs, ctx) {
  conteneurCourant = conteneur;
  const [vue, id] = segs;
  if (vue === 'fiche' && id) {
    if (!vueMontee || conteneur !== conteneurCourant || !conteneur.firstChild) monterVue(conteneur, vueFond, ctx);
    ouvrirPanneau(id, { surFermer: () => naviguer(`crm/${vueFond}`) });
  } else if (VUES[vue]) {
    fermerPanneau();
    vueFond = vue;
    if (vueMontee?.nom !== vue || !conteneur.firstChild) monterVue(conteneur, vue, ctx);
  } else {
    naviguer('crm/accueil', { remplacer: true });
    return quitter;
  }
  return quitter;
}

export function reglages(page) {
  return rendreReglagesCrm(page);
}
