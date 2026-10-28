// Module Devis (cadrage-devis.md) : montage et routes. Trois écrans : le Bordereau (articles), la liste des devis et l'éditeur d'un devis.
// Routes : devis/bordereau, devis/liste, devis/voir/<id> (le même écran que l'éditeur, ouvert sur l'onglet Prévisualisation), devis/editeur (ancienne page « Nouveau devis » : crée un brouillon sans affaire et ouvre l'éditeur), devis/editeur/<id> (non déclarée dans le menu : on y arrive par la liste), et les anciennes adresses devis/pdf/<id> et devis/pdf/<id>/brouillon (la page du PDF n'existe plus : elles mènent à l'éditeur du devis ; elles sont écrites dans les Documents des affaires et dans des e-mails déjà envoyés). Le module lit le CRM (étapes des affaires) : le CRM démarre avant lui (le module Devis dépend de « affaires », pas de « projets »).
import { vider } from '../../os/ui.js';
import * as D from './donnees.js';
import { rendreBordereau } from './bordereau.js';
import { rendreListeDevis } from './liste-ecran.js';
import { rendreEditeurDevis } from './editeur-ecran.js';
import { routeApresPdfSupprime } from './pdf.js';
import { annulerAttentesPdf } from './pdf-actions.js';
import { reglages as reglagesDuModule } from './reglages.js';
import { retenirDevis } from './memoire.js';
import { noterArrivee, oublierOrigine } from './origine.js';
import * as CRM from '../crm/donnees.js';
import { inscrirePastilleAffaire, inscrireOngletAffaire, inscrireActionAffaire, signaler } from '../crm/pastilles-externes.js';
import { pastilleDevisDeAffaire } from './pastille-affaire.js';
import { creerDevisSansAffaire } from './actions-devis.js';
import { ongletDevisDeAffaire, oublierOnglets, ajouterDevis } from './onglet-affaire.js';
import { actionEnteteDevis } from './onglet-affaire-logique.js';
import { naviguer } from '../../os/router.js';
import { rechercherDevis } from './recherche.js';
import { ETAPES_DEPLOIEMENT_DEVIS, controlerDeploiementDevis } from './deploiement.js';
import { attendreQue } from '../../os/deploiement.js';

// Feuille de style propre au module, ajoutée au premier affichage (index.html reste inchangé).
function ajouterFeuille() {
  if (document.querySelector('link[data-devis]')) return;
  const l = document.createElement('link');
  l.rel = 'stylesheet';
  l.href = new URL('../../../css/devis.css', import.meta.url).href;
  l.dataset.devis = '1';
  document.head.append(l);
}

/** Entrées du bouton « + » de la barre supérieure : « Devis » crée un brouillon sans affaire et ouvre l'éditeur. */
export const actionsRapides = [
  { id: 'devis', libelle: 'Devis', icone: 'file-text', action: () => creerDevisSansAffaire() },
];

let montee = null; // { cle, quitter }

let retirerPastille = null;
let retirerOnglet = null;
let retirerAction = null;
let arretSignal = null;

export function demarrer({ cheminBase = '' } = {}) {
  ajouterFeuille(); // aussi pour la page Réglages, qui montre une section du module
  D.demarrer(cheminBase);
  // Pastille « Devis : … » sur les cartes et fiches d'affaire (seulement tant que le module tourne : éteint, le CRM n'affiche rien).
  retirerPastille?.(); retirerOnglet?.(); retirerAction?.(); arretSignal?.();
  retirerPastille = inscrirePastilleAffaire((affaireId) => (D.estPretDevis() ? pastilleDevisDeAffaire(D.etat.devis, affaireId, { aujourdhui: CRM.ctx().aujourdhui }) : null));
  // Onglet « Devis » à côté d'Activité / Notes / Documents (même règle : module éteint = rien d'inscrit = pas d'onglet). Un seul signal pour la pastille et l'onglet.
  retirerOnglet = inscrireOngletAffaire(ongletDevisDeAffaire);
  // Bouton d'action de l'en-tête de l'affaire, à côté de « Perdue » : « Créer un devis », ou « Voir le devis » quand il y en a déjà un.
  retirerAction = inscrireActionAffaire((affaireId) => {
    const r = actionEnteteDevis(D.etat.devis, affaireId, D.estPretDevis(), CRM.affaire(affaireId)?.statut === 'ouverte');
    if (!r) return null;
    return r.mode === 'creer'
      ? { libelle: r.libelle, icone: 'plus', action: () => ajouterDevis(affaireId) }
      : { libelle: r.libelle, icone: 'file-text', action: () => naviguer(r.route) };
  });
  arretSignal = D.surChangement(signaler);
}

export function arreter() {
  quitter();
  annulerAttentesPdf(); // une attente de PDF en cours ne doit rien faire après l'arrêt du module
  retirerPastille?.(); retirerPastille = null;
  retirerOnglet?.(); retirerOnglet = null;
  retirerAction?.(); retirerAction = null;
  oublierOnglets();
  oublierOrigine();
  arretSignal?.(); arretSignal = null;
  signaler();
  D.arreter();
}

function quitter() {
  montee?.quitter?.();
  montee = null;
  document.querySelector('.menu-pop')?.remove();
}

const VUES = {
  liste: (conteneur) => rendreListeDevis(conteneur),
  editeur: (conteneur, segs) => rendreEditeurDevis(conteneur, segs[1] || null),
  voir: (conteneur, segs) => rendreEditeurDevis(conteneur, segs[1], { voir: true }), // devis/voir/<id> : le MÊME écran que devis/editeur/<id>, ouvert sur l'onglet Prévisualisation (lecture seule si le devis n'est plus un brouillon)
  bordereau: (conteneur) => rendreBordereau(conteneur),
};

export function afficher(conteneur, segs) {
  const [vue] = segs;
  // La fiche d'un devis n'existe plus : ses anciennes adresses (devis/fiche/<id>, devis/liste/<id>) ouvrent l'écran unique du devis, sur la Prévisualisation.
  if (vue === 'fiche' || (vue === 'liste' && segs[1]) || (vue === 'voir' && !segs[1])) {
    naviguer(segs[1] ? `devis/voir/${segs[1]}` : 'devis/liste', { remplacer: true });
    return quitter;
  }
  // Plus de page « PDF » : l'ancienne adresse (signet, e-mail déjà envoyé, lien des Documents d'une affaire) ouvre le devis, en lecture seule s'il est finalisé.
  if (vue === 'pdf' && segs[1]) {
    naviguer(routeApresPdfSupprime(segs[1]), { remplacer: true });
    return quitter;
  }
  if (!VUES[vue]) {
    naviguer('devis/bordereau', { remplacer: true });
    return quitter;
  }
  noterArrivee(vue); // d'où l'on vient, pour la flèche « Retour » de l'éditeur
  if (vue === 'editeur') retenirDevis(segs[1]); // le Bordereau propose « Reprendre le devis en cours »
  const cle = vue === 'editeur' || vue === 'voir' ? `${vue}/${segs[1] ?? ''}` : vue; // un éditeur par devis
  if (montee?.cle === cle && conteneur.firstChild) return quitter; // même écran : rien à refaire
  quitter();
  vider(conteneur);
  const arret = VUES[vue](conteneur, segs);
  montee = { cle, quitter: typeof arret === 'function' ? arret : null };
  conteneur.scrollTop = 0;
  window.scrollTo?.(0, 0);
  return quitter;
}

/** Réglages du module (page Réglages > Devis) : une section, déclarée dans registre.js. */
export function reglages(page, ctx = {}) {
  return reglagesDuModule(page, ctx);
}

/** Recherche globale de la barre supérieure : numéro, client, affaire. Un résultat ouvre le devis. */
export function rechercher(saisie) {
  return rechercherDevis(saisie);
}

/** Page Réglages > Déploiement : les lignes du module Devis et leur contrôle (données déjà lues par le module). */
export function controlesDeploiement() {
  return {
    etapes: ETAPES_DEPLOIEMENT_DEVIS,
    verifier: async () => {
      const ecouter = (rappel) => { const a = D.surChangement(rappel); const b = CRM.surChangement(rappel); return () => { a?.(); b?.(); }; };
      const pret = await attendreQue(() => D.estPret() && CRM.etat.pret.parametres, ecouter);
      return controlerDeploiementDevis({
        pret, reglages: D.etat.reglages, articles: D.etat.articles, erreurArticles: D.etat.erreurLecture,
      });
    },
  };
}
