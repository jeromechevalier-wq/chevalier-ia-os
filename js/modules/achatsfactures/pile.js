// Vue « Valider à la suite » du module Achats « Factures » (26/11/2026 : rester concentré sur une seule tâche) : route achatsfactures/pile.
// Une facture « à valider » à la fois, la plus ancienne d'abord, dans la page Examiner elle-même (examiner.js : PDF, montants, fournisseur, chantier, alertes, Accepter / Refuser).
// Après une acceptation ou un refus réussi, la facture suivante s'affiche toute seule ; un échec laisse la facture affichée avec son message (c'est la page Examiner qui le gère).
// « Passer » la met en fin de pile pour cette séance seulement (rien n'est écrit) ; il est désactivé pendant qu'une décision s'écrit (quitter la page perdrait son résultat).
// Facture traitée entre-temps par quelqu'un d'autre, ou archivée depuis la pile : message en toast, puis la liste est relue (jamais de facture ni de compteur faux).
// Focus clavier : sur le titre de la facture suivante, ou sur « Voir la liste des factures » à la fin. Plus rien à valider (ou rien dès l'ouverture) : « Toutes les factures sont traitées » et un bouton vers la liste.
// LECTURES : seulement par le client de la base (donnees.js) ; aucune écriture ici : les décisions passent par la page Examiner et la couche des actions métier.
import { h, icone, remplir } from '../../os/ui.js';
import { lien } from '../../os/router.js';
import { clientBase, actionsBase, verifierAcces } from '../../os/acces-base.js';
import { enteteListe } from '../crm/barre-liste.js';
import { creerDonnees } from './donnees.js';
import { rendreExaminer } from './examiner.js';
import { chargement, etatErreur, etatVide } from './composants.js';
import { dessinerEtatAcces } from './ecran.js';
import { ordonnerPile, passerFacture, texteRestantes, TEXTE_PILE_FINIE, AIDE_PILE_FINIE } from './logique.js';

export const TITRE_PILE = 'Valider à la suite';
const MESSAGE_LECTURE = 'Impossible de lire les factures à valider. Vérifie ta connexion, puis réessaie.';

/** Monte la pile dans `conteneur`. Renvoie la fonction d'arrêt (la réponse tardive d'une pile quittée est ignorée). */
export function rendrePile(conteneur) {
  let vivant = true;
  let numero = 0; // une lecture plus récente rend la précédente caduque
  let passees = []; // factures passées pendant la séance (remises en fin de pile)
  const traitees = new Set(); // factures décidées pendant la séance : jamais remontrées, même si la base tarde à les donner pour décidées
  let arretExaminer = null;
  let dejaMontree = false; // après la première facture, le focus suit la facture suivante
  const donnees = () => creerDonnees({ client: clientBase(), actions: actionsBase() });

  const racine = h('div', { class: 'pile-factures', dataset: { role: 'pile' } });
  conteneur.replaceChildren(racine);
  const retour = () => h('a', { class: 'bouton-icone retour-liste', href: lien('achatsfactures/liste'), 'aria-label': 'Retour aux factures', dataset: { action: 'retour-liste' } }, icone('chevron-left', { taille: 18 }));

  /** Page simple (chargement, accès, erreur, fin) : même en-tête que la liste, titre « Valider à la suite ». */
  function pageSimple(...contenu) {
    arretExaminer?.(); arretExaminer = null;
    remplir(racine, h('div', { class: 'page page-achats-factures page-pile', dataset: { module: 'achats' } },
      enteteListe({ titre: h('h1', {}, TITRE_PILE), retour: retour() }), ...contenu));
  }

  async function avancer(forcer = false) {
    const n = ++numero;
    pageSimple(chargement());
    let etat = 'illisible';
    try { etat = (await verifierAcces(forcer)).etat; } catch (e) { console.warn('Accès à la base : vérification impossible', e?.code ?? e?.message); }
    if (!vivant || n !== numero) return;
    if (etat !== 'connecte') { const z = h('div', {}); dessinerEtatAcces(z, etat, (f) => avancer(f)); pageSimple(z); return; }
    let lu;
    try { lu = await donnees().listerAValider(); } catch (e) {
      if (!vivant || n !== numero) return;
      if (e?.code === 'reconnexion') { const z = h('div', {}); dessinerEtatAcces(z, 'reconnexion', (f) => avancer(f)); pageSimple(z); return; }
      console.warn('Pile des factures : lecture impossible', e?.code ?? e?.message);
      pageSimple(etatErreur(MESSAGE_LECTURE, () => avancer(false)));
      return;
    }
    if (!vivant || n !== numero) return;
    const ordre = ordonnerPile(lu.ids.filter((id) => !traitees.has(id)), passees);
    if (ordre.length === 0) {
      pageSimple(etatVide(TEXTE_PILE_FINIE, { action: h('div', { class: 'pile-fin' },
        h('p', { class: 'aide' }, AIDE_PILE_FINIE),
        h('a', { class: 'bouton bouton-principal', href: lien('achatsfactures/liste'), dataset: { action: 'vers-liste' } }, icone('list', { taille: 16 }), 'Voir la liste des factures')) }));
      racine.querySelector('[data-etat="vide"]')?.setAttribute('data-role', 'pile-finie');
      racine.querySelector('[data-action="vers-liste"]')?.focus();
      return;
    }
    montrer(ordre[0], texteRestantes(ordre.length, lu.complete));
  }

  /** Montre une facture dans la page Examiner, avec le compteur et « Passer » dans l'en-tête. */
  function montrer(id, restantes) {
    arretExaminer?.();
    const zone = h('div', { dataset: { role: 'pile-facture', facture: id } });
    remplir(racine, zone);
    const compteur = h('span', { class: 'aide', dataset: { role: 'pile-restantes' }, 'aria-live': 'polite' }, restantes);
    const passer = h('button', { type: 'button', class: 'bouton bouton-secondaire', dataset: { action: 'passer' }, title: 'La remettre à la fin de la pile pour cette fois',
      onclick: () => { if (passer.disabled) return; passees = passerFacture(passees, id); void avancer(false); } }, icone('chevron-right', { taille: 16 }), 'Passer');
    const sortir = () => { traitees.add(id); passees = passees.filter((x) => x !== id); if (vivant) void avancer(false); };
    arretExaminer = rendreExaminer(zone, id, {
      actionsTete: [compteur, passer],
      focusTitre: dejaMontree,
      surOccupation: (occupe) => { passer.disabled = occupe; },
      surDecision: sortir,
      surPerimee: sortir, // déjà traitée ailleurs ou archivée : elle n'est plus à valider, on relit la liste
    });
    dejaMontree = true;
  }

  void avancer(false);
  return () => { vivant = false; numero += 1; arretExaminer?.(); arretExaminer = null; };
}
